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

// Only these notification types are also emailed (instruction G). Invitation
// accepted/declined and assignment completed stay in-app only.
const EMAIL_TYPES = new Set([
  'application_accepted',
  'application_rejected',
  'invitation_received',
  'assignment_cancelled',
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
