// =============================================================================
// BuildUp – Chat service (Phase 7A persistence + Phase 7B realtime / read)
// =============================================================================
// Real Supabase reads/writes for the CHAT domain when USE_BACKEND=true. Same
// shape as assignmentsService / invitationsService: no React, data-in/data-out,
// AppContext owns the arrays + setState.
//
// The three chat tables (006) keep a SELECT-only surface for `authenticated`
// (RLS `is_conversation_member`); every write goes through a SECURITY DEFINER
// RPC:
//   • get_or_create_direct_conversation(p_other)  (038) — the ONLY way a 1:1
//       thread is created. Server derives the caller from auth.uid(), enforces
//       the worker<->contractor rule, forbids self-chat, race-safe via the
//       pair_key partial-unique index, seeds exactly two participant rows.
//   • send_message(p_conversation_id, p_body)     (038) — the ONLY message
//       write. Server sets sender_id = auth.uid() + created_at, trims, rejects
//       empty / >4000 chars, requires an approved participant. The
//       messages_touch_conversation trigger keeps conversations.last_message*.
//   • mark_conversation_read(p_conversation_id)   (039) — sets last_read_at =
//       now() on the CALLER'S OWN participant row only.
//   • list_my_conversations()                     (039) — one-shot inbox read:
//       per conversation → last_message[_at], caller last_read_at,
//       server-computed unread_count, other participant id. Replaces the old
//       two-select inbox read (no N+1 unread queries).
//
// Phase 7B realtime: a single `postgres_changes` INSERT subscription on
// `public.messages` (added to the supabase_realtime publication in 039). RLS
// (`messages_select` = is_conversation_member) is the privacy boundary — a
// subscriber only receives rows for its own conversations. NO typing/presence,
// NO read receipts, NO push, NO chat notifications/email.
// =============================================================================

import type { RealtimeChannel } from '@supabase/supabase-js';

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
  participantIds: string[],
  unreadCount = 0
): Conversation {
  return {
    id: r.id,
    participantIds,
    lastMessage: r.last_message ?? '',
    lastMessageAt: r.last_message_at ?? r.created_at,
    unreadCount,
    messages: [], // hydrated on open via getConversationMessages
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface InboxRow {
  id: string;
  last_message: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
  unread_count: number;
  other_profile_id: string | null;
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

/** Every conversation the caller participates in, newest activity first, with a
 *  server-computed `unreadCount` (messages from the other party newer than the
 *  caller's last_read_at). One RPC round trip — no N+1. `messages` starts empty;
 *  call getConversationMessages() on open. `participantIds` is
 *  `[currentUserId, otherId]` so the existing screen selectors
 *  (`participantIds.includes(me)`, `getOtherParticipantId`) keep working. */
export async function listMyConversations(
  currentUserId: string
): Promise<Conversation[]> {
  const { data, error } = await getSupabase().rpc('list_my_conversations');
  if (error) throw error;
  const rows = (data as unknown as InboxRow[] | null) ?? [];
  return rows.map((r) => {
    const participantIds = [currentUserId, r.other_profile_id].filter(
      (x): x is string => !!x
    );
    return mapConversationRow(
      {
        id: r.id,
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      participantIds,
      r.unread_count ?? 0
    );
  });
}

/** Mark the caller's own participant row read (last_read_at = server now()).
 *  Only touches the caller's row; rejects a non-participant / unknown
 *  conversation. Fire-and-forget from the UI — reconciled by the next
 *  listMyConversations(). */
export async function markConversationRead(
  conversationId: string
): Promise<void> {
  const { error } = await getSupabase().rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
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

// ---------------------------------------------------------------------------
// realtime (Phase 7B) — one channel, INSERT on public.messages, RLS-filtered
// ---------------------------------------------------------------------------

/** Subscribe to new-message INSERTs across ALL of the caller's conversations.
 *  There is no client-side conversation filter: Supabase Realtime evaluates the
 *  `messages_select` RLS policy (is_conversation_member) per subscriber, so only
 *  rows for conversations the signed-in user belongs to are delivered. The
 *  handler gets the mapped Message plus its conversation id. Returns the channel
 *  so the caller (AppContext) owns its lifecycle — call unsubscribeChannel() on
 *  logout / user switch / teardown. No-op safety is the caller's job
 *  (isBackendEnabled gate). */
export function subscribeToMyMessages(
  onInsert: (message: Message, conversationId: string) => void
): RealtimeChannel {
  const channel = getSupabase()
    .channel('chat:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const row = payload.new as MessageRow | undefined;
        if (!row?.id || !row.conversation_id) return;
        onInsert(mapMessageRow(row), row.conversation_id);
      }
    )
    .subscribe();
  return channel;
}

/** Tear down a channel from subscribeToMyMessages(). Safe to call more than once. */
export function unsubscribeChannel(channel: RealtimeChannel | null): void {
  if (!channel) return;
  void getSupabase().removeChannel(channel);
}
