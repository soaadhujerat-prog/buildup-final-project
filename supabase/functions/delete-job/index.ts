// =============================================================================
// BuildUp – Edge Function: delete-job  (Phase 4C follow-up)
// =============================================================================
// Hard-deletes ONE clean job, then cleans up its private worksite-image Storage
// objects — in the order that guarantees a blocked delete never destroys an
// image:
//
//   1. resolve caller from the bearer token (verify_jwt=true) and re-check the
//      LIVE profile (approved contractor, or live approved admin).
//   2. load the job row; confirm the caller owns it (or is a live admin).
//   3. capture ONLY this job's job_worksite_images.path[] (server-side).
//   4. authoritative DB delete via SECURITY DEFINER public.admin_delete_job
//      (service_role EXECUTE only). The jobs_block_delete_with_activity BEFORE
//      DELETE trigger is the final guard — if the job has any application /
//      invitation / assignment it raises P0001 and NOTHING is deleted.
//   5. ONLY on a successful DB delete: remove the captured Storage objects with
//      the service-role Storage client (does not depend on the now-deleted
//      row / on the job_owner Storage RLS). Best-effort — a failure here leaves
//      a harmless orphan in a private bucket and STILL returns ok:true; the DB
//      job stays deleted and is never recreated.
//
// The client never supplies a bucket or path — the paths are derived here from
// the job id. No arbitrary Storage deletion is possible through this function.
// No service_role key ever reaches the client.
//
// verify_jwt = true. Mirrors admin-user-action's security model (live-profile
// re-check + a service_role-only SECURITY DEFINER SQL function for the write).
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

// admin_delete_job SQLSTATE -> HTTP + stable error code for the client.
//   P0001 = jobs_block_delete_with_activity (has activity)
//   42501 = not owner / not approved / not admin
//   P0002 = job not found
const rpcOutcome = (code?: string): { status: number; error: string } =>
  code === 'P0001'
    ? { status: 409, error: 'has_activity' }
    : code === '42501'
    ? { status: 403, error: 'forbidden' }
    : code === 'P0002'
    ? { status: 404, error: 'not_found' }
    : { status: 500, error: 'action_failed' };

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
  const jobId = str(body?.jobId);
  if (!UUID_RE.test(jobId)) return json({ ok: false, error: 'invalid' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- caller identity (from the verified JWT) ----
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const callerId = userRes?.user?.id;
  if (userErr || !callerId) return json({ ok: false, error: 'unauthorized' }, 401);

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr) return json({ ok: false, error: 'server' }, 500);
  if (!prof || prof.status !== 'approved') return json({ ok: false, error: 'forbidden' }, 403);
  const isLiveAdmin = prof.role === 'admin';

  // ---- the job + a cheap ownership pre-check (admin_delete_job re-checks) ----
  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .select('id, contractor_id')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) return json({ ok: false, error: 'server' }, 500);
  if (!job) return json({ ok: false, error: 'not_found' }, 404);
  if (!isLiveAdmin && job.contractor_id !== callerId) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // ---- capture ONLY this job's worksite-image paths (before the delete) ----
  const { data: imgRows, error: imgErr } = await admin
    .from('job_worksite_images')
    .select('path')
    .eq('job_id', jobId);
  if (imgErr) return json({ ok: false, error: 'server' }, 500);
  const paths = (imgRows ?? [])
    .map((r: { path: string }) => r.path)
    .filter((p: string): p is string => typeof p === 'string' && p.startsWith(`${jobId}/`));

  // ---- authoritative DB delete (trigger is the final guard) ----
  const { error: delErr } = await admin.rpc('admin_delete_job', {
    p_actor: callerId,
    p_job_id: jobId,
  });
  if (delErr) {
    const o = rpcOutcome((delErr as { code?: string }).code);
    return json({ ok: false, error: o.error }, o.status);
  }

  // ---- DB delete succeeded: NOW clean Storage (best-effort) ----
  let storageOrphans = 0;
  if (paths.length > 0) {
    try {
      const { data: removed, error: rmErr } = await admin.storage
        .from('worksite-images')
        .remove(paths);
      if (rmErr) {
        storageOrphans = paths.length;
        console.error(`delete-job: storage cleanup failed for job ${jobId}:`, rmErr.message);
      } else {
        storageOrphans = paths.length - (removed?.length ?? 0);
        if (storageOrphans > 0) {
          console.error(
            `delete-job: ${storageOrphans}/${paths.length} worksite objects not removed for job ${jobId}`,
          );
        }
      }
    } catch (e) {
      storageOrphans = paths.length;
      console.error(`delete-job: storage cleanup threw for job ${jobId}:`, e);
    }
  }

  // The job is gone regardless of Storage cleanup — orphans are swept later.
  return json({ ok: true, storageCleaned: paths.length - storageOrphans, storageOrphans });
});
