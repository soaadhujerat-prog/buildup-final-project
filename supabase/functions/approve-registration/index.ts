// =============================================================================
// BuildUp – Edge Function: approve-registration  (Phase 3A)
// =============================================================================
// Server-authoritative approval. verify_jwt = true, and on top of that the
// caller is re-verified from LIVE `profiles` state as role='admin' AND
// status='approved' (never a JWT claim). The actual materialisation
// (profiles + role tables + child rows + user_identity, flip the registration,
// append the audit event) runs in ONE transaction inside
// public.approve_registration(...), which is service_role-only.
//
// body: { registrationId: string, message?: string }
// ok:   { ok: true, userId: string }
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sendEmail } from '../_shared/email.ts';
import { registrationApproved } from '../_shared/emailTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Map a raised-exception errcode from the SQL function to an HTTP status. */
const rpcStatus = (code?: string): number =>
  code === '42501' ? 403 : code === 'P0002' ? 404 : code === 'P0001' ? 409 : 500;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'invalid' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: 'server_misconfigured' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const registrationId = typeof body?.registrationId === 'string' ? body.registrationId : '';
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;
  if (!registrationId) return json({ ok: false, error: 'invalid' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- live-admin gate (role + status from the DB) ----
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const callerId = userRes?.user?.id;
  if (userErr || !callerId) return json({ ok: false, error: 'unauthorized' }, 401);

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr) return json({ ok: false, error: 'server' }, 500);
  if (!prof || prof.role !== 'admin' || prof.status !== 'approved') {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // ---- atomic approval ----
  const { data, error } = await admin.rpc('approve_registration', {
    p_registration_id: registrationId,
    p_actor_id: callerId,
    p_message: message,
  });
  if (error) {
    return json({ ok: false, error: 'approval_failed' }, rpcStatus((error as { code?: string }).code));
  }

  const userId = data as string;

  // Best-effort approval email to the applicant's real contact address.
  // `approve_registration` copies `auth.users.email` (the exact address the
  // applicant typed at sign-up — verified 1:1 with auth for every approved
  // user) into `profiles.email`, so that is the legitimate contact email.
  // sendEmail() also rejects any synthetic-looking address. A mail failure
  // NEVER affects the approval — the account is already materialised.
  try {
    const { data: prof } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle();
    const to = (prof as { email?: string; full_name?: string } | null)?.email ?? '';
    if (to) {
      const { subject, html } = registrationApproved(
        (prof as { full_name?: string } | null)?.full_name ?? ''
      );
      await sendEmail({ to, subject, html });
    }
  } catch (e) {
    console.error('[approve-registration] email step failed', { name: (e as Error)?.name });
  }

  return json({ ok: true, userId });
});
