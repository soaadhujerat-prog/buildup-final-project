// =============================================================================
// BuildUp – Edge Function: admin-user-action  (Phase 3B)
// =============================================================================
// ONE focused entry point for the admin user-directory write operations:
//   • block          — { action:'block', userId, reason? }
//   • unblock        — { action:'unblock', userId }
//   • set_registration_number
//                    — { action:'set_registration_number', contractorId, number }
//   • grant_permission / revoke_permission
//                    — { action:'grant_permission'|'revoke_permission',
//                        adminId, permission }
//
// Security model (identical to approve-registration):
//   • verify_jwt = true
//   • the caller is resolved from the bearer token and RE-CHECKED against LIVE
//     `profiles` (role='admin' AND status='approved') — never a JWT claim.
//   • the actual writes run inside SECURITY DEFINER `admin_*` SQL functions
//     that are EXECUTE-granted to service_role only, re-check live-admin
//     authority + (for block/unblock) the specific admin_permissions row, and
//     touch a fixed, named set of columns each. No arbitrary column update is
//     possible through this function.
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

const PERMISSIONS = new Set([
  'approve_registrations',
  'reject_registrations',
  'block_users',
  'unblock_users',
  'handle_support',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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
  const action = str(body?.action);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- live-admin gate ----
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

  // ---- dispatch (explicit whitelist) ----
  let rpcErr: { code?: string } | null = null;

  if (action === 'block') {
    const userId = str(body?.userId);
    if (!UUID_RE.test(userId)) return json({ ok: false, error: 'invalid' }, 400);
    const r = await admin.rpc('admin_block_user', {
      p_actor: callerId,
      p_user: userId,
      p_reason: str(body?.reason) || null,
    });
    rpcErr = r.error;
  } else if (action === 'unblock') {
    const userId = str(body?.userId);
    if (!UUID_RE.test(userId)) return json({ ok: false, error: 'invalid' }, 400);
    const r = await admin.rpc('admin_unblock_user', { p_actor: callerId, p_user: userId });
    rpcErr = r.error;
  } else if (action === 'set_registration_number') {
    const contractorId = str(body?.contractorId);
    const number = str(body?.number);
    if (!UUID_RE.test(contractorId) || !number) return json({ ok: false, error: 'invalid' }, 400);
    const r = await admin.rpc('admin_set_contractor_registration_number', {
      p_actor: callerId,
      p_contractor: contractorId,
      p_number: number,
    });
    rpcErr = r.error;
  } else if (action === 'grant_permission' || action === 'revoke_permission') {
    const adminId = str(body?.adminId);
    const permission = str(body?.permission);
    if (!UUID_RE.test(adminId) || !PERMISSIONS.has(permission)) {
      return json({ ok: false, error: 'invalid' }, 400);
    }
    const r = await admin.rpc('admin_set_admin_permission', {
      p_actor: callerId,
      p_target: adminId,
      p_permission: permission,
      p_grant: action === 'grant_permission',
    });
    rpcErr = r.error;
  } else {
    return json({ ok: false, error: 'invalid_action' }, 400);
  }

  if (rpcErr) {
    return json({ ok: false, error: 'action_failed' }, rpcStatus(rpcErr.code));
  }
  return json({ ok: true });
});
