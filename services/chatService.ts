// =============================================================================
// BuildUp – Chat service (Phase 7A backend foundation — persistence, NO realtime)
// =============================================================================
// Real Supabase reads/writes for the CHAT domain when USE_BACKEND=true. Same
// shape as assignmentsService / invitationsService: no React, data-in/data-out,
// AppContext owns the arrays + setState.
//
// The three chat tables (006) keep a SELECT-only surface for `authenticated`
// (RLS `is_conversation_member`); every write goes through a SECURITY DEFINER
// RPC added in migration 038:
//   • get_or_create_direct_conversation(p_other)  — the ONLY way a 1:1 thread
//       is created. Server derives the caller from auth.uid(), enforces the
//       worker<->contractor product rule, forbids self-chat, and is race-safe
//       via the pair_key partial-unique index. Seeds exactly two participant
//       rows on first creation.
//   • send_message(p_conversation_id, p_body)     — the ONLY message write.
//       Server sets sender_id = auth.uid() + created_at, trims the body, rejects
//       empty / >4000 chars, and requires the caller to be an approved
//       participant. The messages_touch_conversation trigger (009) keeps
//       conversations.last_message* current for inbox ordering.
//
// NO realtime, NO unread/read tracking, NO notifications, NO email in this
// phase (all Phase 7B). The receiving side sees new messages on the next
// refresh / reopen.
// =============================================================================

import type { Conversation, Message } from '../types';

import { getSupabase } from './supabaseClient';

/** Mirror of the server ceiling in send_message (migration 038). The UI can use
 *  this to cap the composer if it ever wants to; the server is authoritative. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Bounded initial history load — demo scale, no pagination UI in 7A. */
const MESSAGE_LOAD_LIMIT = 300;

// ---------------------------------------------------------------------------
// row shapes (subset actually selected)
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  last_message: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const CONVERSATION_COLS =
  'id, last_message, last_message_at, created_at, updated_at';
const MESSAGE_COLS = 'id, conversation_id, sender_id, content, created_at';

// ---------------------------------------------------------------------------
// mappers -> existing domain types
// ---------------------------------------------------------------------------

/** A backend message. `receiverId` is not modelled server-side for a 1:1 thread
 *  (the conversation's two participants define it) — screens only ever read
 *  `senderId` (for `isMine`), `content` and `timestamp`. `isRead` is a Phase 7B
 *  concern; kept `true` here so nothing renders a bogus unread state. */
export function mapMessageRow(r: MessageRow): Message {
  return {
    id: r.id,
    senderId: r.sender_id,
    receiverId: '',
    content: r.content,
    timestamp: r.created_at,
    isRead: true,
  };
}

function mapConversationRow(
  r: ConversationRow,
  participantIds: string[]
): Conversation {
  return {
    id: r.id,
    participantIds,
    lastMessage: r.last_message ?? '',
    lastMessageAt: r.last_message_at ?? r.created_at,
    unreadCount: 0, // Phase 7B
    messages: [], // hydrated on open via getConversationMessages
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// typed failure (clean Hebrew line per case, no raw Postgres/RLS text)
// ---------------------------------------------------------------------------

export type ChatErrorCode =
  | 'unauthorized' // not signed in / not an approved worker-or-contractor / not a participant
  | 'self_chat' // tried to open a conversation with yourself
  | 'invalid_pair' // worker<->worker or contractor<->contractor, or target not approved
  | 'gone' // target profile / conversation no longer exists
  | 'empty' // message blank after trim
  | 'too_long' // message over MAX_MESSAGE_LENGTH
  | 'unknown';

export class ChatError extends Error {
  code: ChatErrorCode;
  constructor(code: ChatErrorCode) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
}

function toChatError(e: unknown): ChatError {
  const err = (e ?? {}) as PgLikeError;
  const msg = (err.message ?? '').toLowerCase();
  if (err.code === 'P0002') return new ChatError('gone');
  if (err.code === 'P0001') {
    if (msg.includes('yourself')) return new ChatError('self_chat');
    if (msg.includes('worker') && msg.includes('contractor'))
      return new ChatError('invalid_pair');
    if (msg.includes('not available for chat'))
      return new ChatError('invalid_pair');
    if (msg.includes('empty')) return new ChatError('empty');
    if (msg.includes('too long')) return new ChatError('too_long');
    return new ChatError('unknown');
  }
  if (err.code === '42501') return new ChatError('unauthorized');
  return new ChatError('unknown');
}

/** Clean Hebrew message for any chat failure (backend path). */
export function chatErrorText(e: unknown): string {
  const code = e instanceof ChatError ? e.code : toChatError(e).code;
  switch (code) {
    case 'unauthorized':
      return 'אין לך הרשאה לשלוח הודעה בשיחה זו.';
    case 'self_chat':
      return 'לא ניתן לפתוח שיחה עם עצמך.';
    case 'invalid_pair':
      return 'ניתן להתכתב רק בין עובד לקבלן.';
    case 'gone':
      return 'המשתמש או השיחה כבר לא קיימים.';
    case 'empty':
      return 'לא ניתן לשלוח הודעה ריקה.';
    case 'too_long':
      return 'ההודעה ארוכה מדי.';
    default:
      return 'הפעולה נכשלה. בדוק/י את החיבור ונסה/י שוב.';
  }
}

function unwrap<T>(data: unknown): T {
  return (Array.isArray(data) ? data[0] : data) as T;
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

/** Every conversation the caller participates in (RLS decides), newest activity
 *  first. `messages` starts empty — call getConversationMessages() on open. */
export async function listMyConversations(): Promise<Conversation[]> {
  const sb = getSupabase();

  const convR = await sb
    .from('conversations')
    .select(CONVERSATION_COLS)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (convR.error) throw convR.error;
  const rows = (convR.data as unknown as ConversationRow[] | null) ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const partR = await sb
    .from('conversation_participants')
    .select('conversation_id, profile_id')
    .in('conversation_id', ids);
  if (partR.error) throw partR.error;

  const byConv = new Map<string, string[]>();
  for (const p of (partR.data as unknown as
    | { conversation_id: string; profile_id: string }[]
    | null) ?? []) {
    const list = byConv.get(p.conversation_id) ?? [];
    list.push(p.profile_id);
    byConv.set(p.conversation_id, list);
  }

  return rows.map((r) => mapConversationRow(r, byConv.get(r.id) ?? []));
}

/** Persisted messages for one conversation, oldest -> newest, with a stable
 *  secondary sort by id so equal timestamps never reorder between loads.
 *  Bounded to the most recent MESSAGE_LOAD_LIMIT (demo scale, no pagination). */
export async function getConversationMessages(
  conversationId: string
): Promise<Message[]> {
  const { data, error } = await getSupabase()
    .from('messages')
    .select(MESSAGE_COLS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_LOAD_LIMIT);
  if (error) throw error;
  const rows = ((data as unknown as MessageRow[] | null) ?? []).slice().reverse();
  return rows.map(mapMessageRow);
}

// ---------------------------------------------------------------------------
// writes (RPC only)
// ---------------------------------------------------------------------------

/** Find-or-create THE 1:1 conversation between the caller and `otherProfileId`.
 *  Server-authoritative and race-safe (see migration 038). Returns the
 *  conversation with `participantIds` resolved and `messages: []`. */
export async function getOrCreateDirectConversation(
  otherProfileId: string
): Promise<Conversation> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_or_create_direct_conversation', {
    p_other: otherProfileId,
  });
  if (error) throw toChatError(error);
  const row = unwrap<ConversationRow>(data);
  if (!row?.id) throw new ChatError('unknown');

  const partR = await sb
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', row.id);
  if (partR.error) throw partR.error;
  const participantIds = (
    (partR.data as unknown as { profile_id: string }[] | null) ?? []
  ).map((p) => p.profile_id);

  return mapConversationRow(row, participantIds);
}

/** Send one text message. The body is trimmed and validated server-side; this
 *  also trims client-side so a whitespace-only draft never hits the network.
 *  Returns the persisted message (server-stamped id / sender / timestamp). */
export async function sendMessage(
  conversationId: string,
  text: string
): Promise<Message> {
  const body = text.trim();
  if (!body) throw new ChatError('empty');
  if (body.length > MAX_MESSAGE_LENGTH) throw new ChatError('too_long');

  const { data, error } = await getSupabase().rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw toChatError(error);
  return mapMessageRow(unwrap<MessageRow>(data));
}
