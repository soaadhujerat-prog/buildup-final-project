// =============================================================================
// BuildUp – Edge Function: reject-registration  (Phase 3A)
// =============================================================================
// Server-authoritative rejection (and its inverse, "send back to review").
// Same admin authority model as approve-registration: verify_jwt = true AND
// the caller is re-verified from LIVE `profiles` as role='admin' /
// status='approved'. NEVER materialises a worker/contractor profile.
//
// body: { registrationId: string, reason?: string, revert?: boolean }
//   - revert !== true  -> reject   (reason required)  -> reject_registration(...)
//   - revert === true   -> rejected -> pending          -> revert_registration_rejection(...)
// The auth user is left in place (no deletion policy is invented here) — a
// rejected registration simply has no `profiles` / `user_identity` row.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
  const revert = body?.revert === true;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!registrationId) return json({ ok: false, error: 'invalid' }, 400);
  if (!revert && !reason) return json({ ok: false, error: 'reason_required' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  const { error } = revert
    ? await admin.rpc('revert_registration_rejection', {
        p_registration_id: registrationId,
        p_actor_id: callerId,
      })
    : await admin.rpc('reject_registration', {
        p_registration_id: registrationId,
        p_actor_id: callerId,
        p_reason: reason,
      });

  if (error) {
    return json({ ok: false, error: 'rejection_failed' }, rpcStatus((error as { code?: string }).code));
  }
  return json({ ok: true });
});
