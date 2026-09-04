// =============================================================================
// BuildUp – Edge Function: notify-email  (Phase 6)
// =============================================================================
// Fires from a Supabase DATABASE WEBHOOK on `INSERT` into `public.notifications`
// and sends a transactional email for a small allowlist of high-value events.
// The in-app notification is ALWAYS the source of truth (written in-transaction
// by the staffing RPCs / triggers, migration 032); this function is a
// best-effort mirror to email and never writes back to the DB.
//
// SECURITY
//   • Not in the JWT-verified API surface for users. Protected by a shared
//     secret header `x-notify-secret` == env `NOTIFY_EMAIL_SECRET`, set on the
//     webhook. Mismatch -> 401. Secret UNSET -> 200 no-op (inert until you
//     configure it — nothing is faked, nothing errors in a loop).
//   • Recipient email is read server-side with the service-role key from
//     `profiles.email` (the user's real contact address). No ID / hash / token
//     / document ever leaves this function — only the notification's own
//     title/body, which were composed from a display name + job title.
//
// Webhook body (Supabase): { type:'INSERT', table:'notifications',
//   schema:'public', record:{ id,user_id,type,title,body,related_id,... } }
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sendEmail } from '../_shared/email.ts';
import { genericNotice } from '../_shared/emailTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NOTIFY_EMAIL_SECRET = Deno.env.get('NOTIFY_EMAIL_SECRET') ?? '';

// Only these notification types are also emailed. Each row is written ONCE, in
// the same transaction as its authoritative state change, by a SECURITY DEFINER
// RPC / trigger that guards the transition (respond_to_application,
// admin_block_user / admin_unblock_user — early-return when already in the
// target state, review_contractor_license_update — raises if not 'pending'), so
// there is exactly one row, hence one email, per real event. This function
// stays best-effort: a Resend failure is logged and still returns HTTP 200 (no
// webhook retry, no duplicate) — the account/licence state is already committed.
//
//   • account_blocked / account_unblocked  — an Admin changed the user's
//     ability to use BuildUp. A blocked user may not be able to rely on the
//     in-app notification, so email is the authoritative channel here.
//   • license_update_approved / _rejected  — materially affects contractor use;
//     the rejection body already carries the admin's reason.
//   • job_application — a contractor may not have the app open when a worker
//     applies; the row is written by the single `applications_notify_contractor`
//     AFTER INSERT OR UPDATE trigger (033/034/048), keyed by a dedupe_key that
//     includes the application's (possibly refreshed, on reapply) applied_at,
//     so a genuine duplicate/failed application attempt writes no new row —
//     one real application event still means exactly one email.
//
// Invitation accepted/declined, assignment completed, and registration
// approved/rejected are NOT here: the first two are in-app only by design; the
// registration mails are sent directly by the approve-/reject-registration
// Edge Functions (no notifications row is written for them — no double send).
const EMAIL_TYPES = new Set([
  'job_application',
  'application_accepted',
  'application_rejected',
  'invitation_received',
  'assignment_cancelled',
  'account_blocked',
  'account_unblocked',
  'license_update_approved',
  'license_update_rejected',
]);

const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  // Secret not configured yet -> stay inert (do not error the webhook).
  if (!NOTIFY_EMAIL_SECRET) return json({ ok: true, skipped: 'no_secret' });
  if (req.headers.get('x-notify-secret') !== NOTIFY_EMAIL_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: 'misconfigured' }, 500);

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const rec = payload?.record;
  if (payload?.type !== 'INSERT' || payload?.table !== 'notifications' || !rec?.user_id) {
    return json({ ok: true, skipped: 'shape' });
  }
  if (!EMAIL_TYPES.has(String(rec.type))) return json({ ok: true, skipped: 'type' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // profiles.email is the recipient's real contact address — it is a verbatim
  // copy of auth.users.email (the address typed at sign-up), materialised by
  // approve_registration. sendEmail() additionally rejects synthetic addresses.
  const { data: prof } = await admin
    .from('profiles')
    .select('email')
    .eq('id', rec.user_id)
    .maybeSingle();
  const to = (prof as { email?: string } | null)?.email ?? '';
  if (!to) return json({ ok: true, skipped: 'no_email' });

  const { subject, html } = genericNotice(String(rec.title ?? ''), String(rec.body ?? ''));
  const result = await sendEmail({ to, subject, html });
  return json({ ok: result.ok, skipped: result.skipped ?? false });
});
