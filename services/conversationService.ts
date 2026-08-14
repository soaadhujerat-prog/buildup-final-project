// =============================================================================
// Conversation service — pure, storage-agnostic functions for messaging.
// =============================================================================
// Same idea as assignmentService: no React, no context, just data-in/data-out.
// AppContext owns the actual array + setState calls; this file owns the rules
// (how to find/dedupe a conversation, how to build a new message, how to
// migrate a legacy-shaped record).
//
// A conversation is identified by its participantIds alone (order-independent)
// — exactly one thread ever exists per pair, like WhatsApp. There is no job
// scoping. Every screen resolves who the other participant is relative to
// whoever is currently logged in, via getOtherParticipantId().
// =============================================================================

import { Conversation, LegacyConversationRecord, Message } from '../types';

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}`;

/** Converts an old-shaped mock/legacy conversation record (single
 *  `participantId`, `lastMessageTime`) into the real `Conversation` shape.
 *  Safe to run on records that are already in the new shape — it's a no-op
 *  pass-through in that case. Never drops data: if `participantIds` isn't
 *  present, it's derived from the actual senders/receivers in `messages`
 *  (the only reliable source of "who was in this conversation" for an old
 *  record), falling back to the legacy `participantId` only if there are no
 *  messages to derive it from. `lastMessage`/`lastMessageAt` are taken from
 *  the real last message when one exists, rather than trusted free-text
 *  fields (old mock data used non-parseable values like "אתמול"). */
export const normalizeConversation = (
  raw: LegacyConversationRecord
): Conversation => {
  const participantIds =
    raw.participantIds && raw.participantIds.length > 0
      ? raw.participantIds
      : deriveParticipantIdsFromMessages(raw.messages, raw.participantId);

  const realLastMessage = raw.messages[raw.messages.length - 1];
  const lastMessage = realLastMessage?.content ?? raw.lastMessage;
  const lastMessageAt =
    realLastMessage?.timestamp ?? raw.lastMessageAt ?? raw.lastMessageTime ?? '';

  return {
    id: raw.id,
    participantIds,
    lastMessage,
    lastMessageAt,
    unreadCount: raw.unreadCount ?? 0,
    messages: raw.messages,
    createdAt: raw.createdAt ?? raw.messages[0]?.timestamp ?? lastMessageAt,
    updatedAt: raw.updatedAt ?? lastMessageAt,
  };
};

const deriveParticipantIdsFromMessages = (
  messages: Message[],
  legacyOtherId?: string
): string[] => {
  const ids = new Set<string>();
  messages.forEach((m) => {
    ids.add(m.senderId);
    ids.add(m.receiverId);
  });
  if (ids.size >= 2) return Array.from(ids);
  if (legacyOtherId) return [legacyOtherId];
  return Array.from(ids);
};

/** Order-independent identity key for a pair of participants — used to
 *  dedupe conversations that ended up with more than one record for the
 *  same two people. */
const pairKey = (participantIds: string[]): string =>
  [...participantIds].sort().join('|');

/** Collapses any conversations that share the same pair of participants
 *  into a single conversation, merging their messages (deduped by message
 *  id, sorted chronologically) so no message history is ever lost. Keeps
 *  the earliest `createdAt` and recomputes `lastMessage`/`lastMessageAt`/
 *  `updatedAt` from the merged, sorted messages. Run once at load time as a
 *  safety net against any legacy/duplicate records. */
export const dedupeConversations = (
  conversations: Conversation[]
): Conversation[] => {
  const merged = new Map<string, Conversation>();
  const order: string[] = [];

  for (const c of conversations) {
    const key = pairKey(c.participantIds);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, c);
      order.push(key);
      continue;
    }

    const messageMap = new Map<string, Message>();
    [...existing.messages, ...c.messages].forEach((m) => messageMap.set(m.id, m));
    const mergedMessages = Array.from(messageMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const last = mergedMessages[mergedMessages.length - 1];

    merged.set(key, {
      ...existing,
      messages: mergedMessages,
      lastMessage: last?.content ?? existing.lastMessage,
      lastMessageAt: last?.timestamp ?? existing.lastMessageAt,
      unreadCount: existing.unreadCount + c.unreadCount,
      updatedAt: last?.timestamp ?? existing.updatedAt,
      createdAt:
        existing.createdAt && (!c.createdAt || existing.createdAt < c.createdAt)
          ? existing.createdAt
          : c.createdAt,
    });
  }

  return order.map((key) => merged.get(key)!);
};

/** Who am I talking to in this conversation, from `viewerId`'s point of
 *  view? Use this everywhere a screen needs to show "the other side" —
 *  never read a fixed field, since the same conversation is viewed by both
 *  participants. */
export const getOtherParticipantId = (
  conversation: Pick<Conversation, 'participantIds'>,
  viewerId: string
): string | undefined =>
  conversation.participantIds.find((id) => id !== viewerId);

const sameParticipants = (
  participantIds: string[],
  userIdA: string,
  userIdB: string
): boolean =>
  participantIds.includes(userIdA) && participantIds.includes(userIdB);

/** Finds the (single, WhatsApp-style) conversation between two users. There
 *  is no job scoping — the same two people always share exactly one
 *  thread, regardless of which job or screen the chat started from. */
export const findConversation = (
  conversations: Conversation[],
  userIdA: string,
  userIdB: string
): Conversation | undefined =>
  conversations.find((c) => sameParticipants(c.participantIds, userIdA, userIdB));

export const buildConversation = (params: {
  currentUserId: string;
  otherUserId: string;
}): Conversation => {
  const now = nowIso();
  return {
    id: newId('conv'),
    participantIds: [params.currentUserId, params.otherUserId],
    lastMessage: '',
    lastMessageAt: now,
    unreadCount: 0,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const buildMessage = (
  senderId: string,
  receiverId: string,
  text: string
): Message => ({
  id: newId('m'),
  senderId,
  receiverId,
  content: text,
  timestamp: nowIso(),
  isRead: false,
});
