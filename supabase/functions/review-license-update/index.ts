// =============================================================================
// BuildUp – Edge Function: review-license-update  (Phase 3B)
// =============================================================================
// Dedicated admin entry point for contractor-licence review (kept separate
// from admin-user-action on purpose):
//   • review          — { action:'review', requestId, approve:boolean, reason? }
//   • verify          — { action:'verify', contractorId }        (periodic stamp)
//   • request_renewal — { action:'request_renewal', contractorId } (notify only)
//
// verify_jwt = true + live-admin re-check (role='admin', status='approved').
// The writes run inside SECURITY DEFINER `*_contractor_license*` SQL functions
// (service_role EXECUTE only) which re-check live-admin authority and write a
// fixed set of columns + the contractor notification in one transaction.
// The contractor's SUBMIT of a request is a plain RLS-checked client INSERT;
// the admin notifications for it come from a DB trigger, not this function.
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

  let rpcErr: { code?: string } | null = null;

  if (action === 'review') {
    const requestId = str(body?.requestId);
    const approve = body?.approve === true;
    const reason = str(body?.reason);
    if (!UUID_RE.test(requestId)) return json({ ok: false, error: 'invalid' }, 400);
    if (!approve && !reason) return json({ ok: false, error: 'reason_required' }, 400);
    const r = await admin.rpc('review_contractor_license_update', {
      p_actor: callerId,
      p_request: requestId,
      p_approve: approve,
      p_reason: reason || null,
    });
    rpcErr = r.error;
  } else if (action === 'verify') {
    const contractorId = str(body?.contractorId);
    if (!UUID_RE.test(contractorId)) return json({ ok: false, error: 'invalid' }, 400);
    const r = await admin.rpc('verify_contractor_license', {
      p_actor: callerId,
      p_contractor: contractorId,
    });
    rpcErr = r.error;
  } else if (action === 'request_renewal') {
    const contractorId = str(body?.contractorId);
    if (!UUID_RE.test(contractorId)) return json({ ok: false, error: 'invalid' }, 400);
    const r = await admin.rpc('request_contractor_license_renewal', {
      p_actor: callerId,
      p_contractor: contractorId,
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
