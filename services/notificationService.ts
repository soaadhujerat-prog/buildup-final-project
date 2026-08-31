// =============================================================================
// BuildUp – Notification service (Phase 3B, minimal read path)
// =============================================================================
// ONLY what Phase 3B needs: load the signed-in user's real `notifications`
// rows and toggle `is_read`. No realtime, no push, no email, no scheduling —
// those are later phases. Server-side Phase 3B actions (block / unblock /
// licence decisions / reg-number change) create the rows; this reads them.
//
// RLS already covers everything (008): a user SELECTs only their own rows and
// may UPDATE only `is_read` (guard_notification_columns); INSERT/DELETE are
// revoked from `authenticated`.
// =============================================================================

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
