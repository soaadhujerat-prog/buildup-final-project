// =============================================================================
// BuildUp – Notification service (read path + Phase 7C live delivery)
// =============================================================================
// Load the signed-in user's real `notifications` rows, toggle `is_read`, and
// (Phase 7C fix) subscribe to INSERTs so persisted notifications appear live.
// Server-side actions (staffing RPCs 029-032, send_message 040, block/unblock,
// licence decisions, …) create the rows; this only reads / marks / streams.
//
// RLS (008) is the boundary: a user SELECTs only their own rows and may UPDATE
// only `is_read` (guard_notification_columns); INSERT/DELETE are revoked from
// `authenticated`. The Realtime subscription (041 added `notifications` to the
// `supabase_realtime` publication) is filtered by the SAME RLS per subscriber.
// =============================================================================

import type { RealtimeChannel } from '@supabase/supabase-js';

import type { AppNotification, NotificationType } from '../types';

import { getSupabase } from './supabaseClient';

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_id: string | null;
  dedupe_key: string | null;
  created_at: string;
}

const mapRow = (r: NotificationRow): AppNotification => ({
  id: r.id,
  userId: r.user_id,
  type: r.type as NotificationType,
  title: r.title,
  body: r.body,
  isRead: r.is_read,
  relatedId: r.related_id ?? undefined,
  dedupeKey: r.dedupe_key ?? undefined,
  createdAt: r.created_at,
});

async function uid(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user?.id ?? null;
}

/** The current user's notifications, newest first (capped). `[]` when signed out. */
export async function listNotifications(): Promise<AppNotification[]> {
  const id = await uid();
  if (!id) return [];
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, user_id, type, title, body, is_read, related_id, dedupe_key, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data as NotificationRow[] | null) ?? []).map(mapRow);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const id = await uid();
  if (!id) return;
  const { error } = await getSupabase()
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', id)
    .eq('is_read', false);
  if (error) throw error;
}

/**
 * Mark every unread `new_message` (chat) notification for ONE conversation read
 * — in a single server-side UPDATE scoped by `related_id`. Used by the Phase 7C
 * "active-conversation no-spam" path: when the user is (or just landed) inside a
 * chat, its chat notifications should not sit unread. RLS `notifications_update_self`
 * (`user_id = auth.uid()`) + the column-guard trigger keep this to the caller's
 * own rows and to the `is_read` flag only. Catches notifications the client
 * hasn't even loaded yet, so there is no local-state timing race.
 */
export async function markChatConversationRead(
  conversationId: string
): Promise<void> {
  const id = await uid();
  if (!id) return;
  const { error } = await getSupabase()
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', id)
    .eq('type', 'new_message')
    .eq('related_id', conversationId)
    .eq('is_read', false);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// live delivery (Phase 7C fix) — one INSERT subscription, RLS-filtered
// ---------------------------------------------------------------------------

/**
 * Subscribe to INSERTs into `public.notifications` for `userId`. The
 * `user_id=eq.<uid>` filter narrows the stream server-side; RLS
 * `notifications_select` (`user_id = auth.uid()`) is still enforced per
 * subscriber, so no other user's rows can ever be delivered. The handler gets
 * the mapped `AppNotification`. Returns the channel — the caller (AppContext)
 * owns its lifecycle: call `unsubscribeNotificationsChannel()` on logout / user
 * switch / teardown. Backend-gate (`isBackendEnabled()`) is the caller's job.
 */
export function subscribeToMyNotifications(
  userId: string,
  onInsert: (n: AppNotification) => void
): RealtimeChannel {
  const channel = getSupabase()
    .channel('notifications:inserts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as NotificationRow | undefined;
        if (!row?.id) return;
        onInsert(mapRow(row));
      }
    )
    .subscribe();
  return channel;
}

/** Tear down a channel from subscribeToMyNotifications(). Safe to call twice. */
export function unsubscribeNotificationsChannel(
  channel: RealtimeChannel | null
): void {
  if (!channel) return;
  void getSupabase().removeChannel(channel);
}
