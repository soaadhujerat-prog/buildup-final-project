-- =============================================================================
-- 034 · reapply after the WORKER cancelled their OWN assignment (Phase 6)
-- =============================================================================
-- PRODUCT RULE (approved):
--   • CASE 1  assignment.status = 'cancelled' AND cancelled_by = 'worker'
--             -> the SAME worker may submit a new application to that job,
--                provided the job is still open, has capacity, and the worker
--                has no live (active/completed) assignment on it.
--   • CASE 2  cancelled_by = 'contractor'  -> NOT eligible (this RPC refuses).
--   • CASE 3  assignment.status = 'completed' -> NOT eligible (this RPC refuses).
--
-- WHY A NEW RPC. Phase 5A deliberately left an accepted application `accepted`
-- when its assignment was later cancelled (history preservation — the
-- acceptance really happened). `can_worker_apply` (028) therefore treats that
-- current-cycle `accepted` row as a blocker, and `reapply_to_job` (028) only
-- reactivates a `withdrawn` row. So neither the plain INSERT path nor the
-- withdrawn-reapply path can serve CASE 1 — the app showed
-- "כבר הגשת מועמדות למשרה זו." This RPC is the narrow, server-authoritative
-- CASE 1 path and nothing else.
--
-- SERVER AUTHORITY — the client passes only p_job_id + p_message. The function
-- PROVES, under a job-row lock (capacity decisions serialised per job, exactly
-- like respond_to_application / send_invitation):
--   1. caller is the application's worker            (worker_id = auth.uid())
--   2. caller is still an approved worker
--   3. the job is open + not closed_manually
--   4. the caller's current-cycle application row exists and is `accepted`
--   5. the caller's LATEST assignment on the job is `cancelled`
--   6. ...cancelled_by = 'worker'                    (CASE 2 / CASE 3 rejected)
--   7. ...and originates from THIS application       (source='application',
--                                                     source_id = application.id)
--   8. no active/completed assignment exists for this worker on this job
--   9. the job has a free slot right now             (occupied_slot_count)
-- Only then does it reactivate the SAME application row in place
-- (status -> pending, fresh applied_at, response fields cleared). No new row,
-- UNIQUE(job_id, worker_id, recruitment_cycle) kept, recruitment_cycle NOT
-- incremented, no global "new recruitment cycle". The placement's history
-- lives on in the untouched `cancelled` assignment row (its source_id still
-- points at this application).
--
-- The client keeps NO direct UPDATE on `applications` (026/027) — this runs as
-- owner, SECURITY DEFINER, search_path '' , EXECUTE granted to `authenticated`
-- only (revoked from public/anon), same as every other staffing RPC.
--
-- NOTIFICATION (Phase 6 parity). A successful reactivation is a real new
-- candidate action, so the owning contractor gets exactly one
-- "מועמדות חדשה התקבלה" via `public.notify` (032) — the SAME notification type
-- and dedupe scheme a fresh apply uses (033):
--     'app_submitted:' || application_id || ':' || epoch(applied_at)
-- `applied_at` is refreshed to now() here, so this key differs from the
-- original apply's key (two real events) while any accidental re-fire of the
-- identical event collapses via ON CONFLICT DO NOTHING. The 033 AFTER trigger
-- only fires for INSERT / 'withdrawn'->'pending', so the 'accepted'->'pending'
-- transition here does NOT double-notify. A later re-acceptance via
-- respond_to_application (029) reuses that RPC's existing
-- 'app_accepted:' || application_id key — the worker keeps exactly one
-- application_accepted notification, no duplicate.
--
-- Forward-only. No schema / RLS / enum / trigger change. 029/030/031/032/033
-- are byte-for-byte untouched.
-- =============================================================================

create or replace function public.reapply_after_cancellation(
  p_job_id  uuid,
  p_message text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.jobs;
  v_app public.applications;
  v_asg public.assignments;
  v_wname text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- (2) caller must still be an approved worker (same gate as a fresh apply)
  if not exists (
    select 1
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = v_uid
      and p.role = 'worker'
      and p.status = 'approved'
  ) then
    raise exception 'not an approved worker' using errcode = '42501';
  end if;

  -- lock the job row — capacity + open-state is decided under this lock
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  -- (3) job must be open to registration right now
  if v_job.status <> 'open' or v_job.closed_manually then
    raise exception 'job % is not open for applications', p_job_id
      using errcode = 'P0001';
  end if;

  -- (1)(4) the caller's OWN application for this job, in the job's CURRENT
  -- recruitment cycle — locked. It must be the `accepted` row (a pending /
  -- rejected / withdrawn row has its own path and is not a cancelled placement).
  select * into v_app
  from public.applications
  where job_id = p_job_id
    and worker_id = v_uid
    and recruitment_cycle = v_job.recruitment_cycle
  for update;

  if v_app.id is null then
    raise exception 'no application to reactivate for job %', p_job_id
      using errcode = 'P0002';
  end if;
  if v_app.status <> 'accepted' then
    raise exception 'application is % — not a cancelled placement', v_app.status
      using errcode = 'P0001';
  end if;

  -- (5)(6)(7) the caller's LATEST assignment on this job must be a
  -- cancellation BY THE WORKER that originated from THIS application.
  -- A contractor cancellation (CASE 2) or a completed assignment (CASE 3)
  -- is the latest row in those cases and fails this check.
  select * into v_asg
  from public.assignments
  where job_id = p_job_id
    and worker_id = v_uid
  order by created_at desc, updated_at desc
  limit 1;

  if v_asg.id is null then
    raise exception 'no assignment history for job %', p_job_id
      using errcode = 'P0002';
  end if;
  if v_asg.status <> 'cancelled' or v_asg.cancelled_by is distinct from 'worker' then
    raise exception 'latest assignment is not a worker cancellation'
      using errcode = 'P0001';
  end if;
  if v_asg.source <> 'application' or v_asg.source_id is distinct from v_app.id then
    raise exception 'assignment does not originate from this application'
      using errcode = 'P0001';
  end if;

  -- (8) no capacity-counting assignment may exist for this worker on this job
  if exists (
    select 1
    from public.assignments
    where job_id = p_job_id
      and worker_id = v_uid
      and status in ('active', 'completed')
  ) then
    raise exception 'worker already has a live assignment on job %', p_job_id
      using errcode = 'P0001';
  end if;

  -- (9) a free slot must exist right now (the worker's own cancelled row does
  -- NOT count towards occupied_slot_count) — same guard respond_to_application
  -- uses on accept.
  if public.occupied_slot_count(p_job_id) >= v_job.workers_needed then
    raise exception 'job % is fully staffed', p_job_id
      using errcode = 'check_violation';
  end if;

  -- reactivate the SAME row in place (no new row; UNIQUE(job,worker,cycle)
  -- kept; recruitment_cycle untouched). The concurrent-safety guard
  -- (status = 'accepted' in the WHERE) makes a double call a no-op for the
  -- loser, which then raises below.
  update public.applications set
    status              = 'pending',
    applied_at          = now(),
    responded_at        = null,
    contractor_response = null,
    withdrawn_at        = null,
    message             = nullif(btrim(coalesce(p_message, '')), '')
  where id = v_app.id
    and status = 'accepted'
  returning * into v_app;

  if v_app.id is null then
    raise exception 'application changed concurrently' using errcode = 'P0001';
  end if;

  -- exactly one "new candidate" notification to the owning contractor
  select full_name into v_wname from public.profiles where id = v_uid;
  perform public.notify(
    v_job.contractor_id,
    'job_application',
    'מועמדות חדשה התקבלה',
    coalesce(nullif(btrim(v_wname), ''), 'עובד')
      || ' הגיש/ה מועמדות למשרה "' || coalesce(v_job.title, '') || '".',
    v_job.id::text,
    'app_submitted:' || v_app.id::text || ':' || extract(epoch from v_app.applied_at)::text
  );

  return v_app;
end;
$$;

revoke execute on function public.reapply_after_cancellation(uuid, text) from public, anon;
grant  execute on function public.reapply_after_cancellation(uuid, text) to authenticated;
