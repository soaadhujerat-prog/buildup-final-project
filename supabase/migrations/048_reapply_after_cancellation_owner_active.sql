-- =============================================================================
-- 048 · reapply_after_cancellation: also require the owning contractor to be
--       an active (approved) account — completes migration 046's intent
-- =============================================================================
-- GAP.  Migration 046 (blocked-user lifecycle hardening) states in its own
-- header that three paths "all let a worker file a NEW application against a
-- blocked contractor's job":
--     • the applications_insert RLS policy
--     • reapply_to_job          (028)
--     • reapply_after_cancellation (034)
-- 046 closed this by adding an "owning contractor still approved" test to
-- public.can_worker_apply(...). That reaches the first two paths (the RLS
-- policy and reapply_to_job both call can_worker_apply) — but
-- reapply_after_cancellation (034) does NOT call can_worker_apply; it inlines
-- its own open-state check (job.status = 'open' AND NOT closed_manually) and
-- was never given the owner-status test. So a worker whose OWN assignment on a
-- job was worker-cancelled can still reactivate that accepted application after
-- the job's contractor is blocked.
--
-- Impact is limited (it reactivates an application row → 'pending'; it creates
-- NO assignment, and respond_to_application 046 already refuses a blocked
-- contractor's accept), but it is exactly the hole 046 intended to close, so
-- this migration closes it with the SAME predicate and the SAME typed error /
-- errcode the function already raises for "not open" — no new client handling,
-- no business-rule change.
--
-- reapply_after_cancellation is otherwise reproduced BYTE-FOR-BYTE from 034:
-- same signature, same locking, same CASE 1/2/3 rules, same one 'job_application'
-- notification with the 033/034 per-attempt dedupe key. Only one extra guard is
-- added, immediately after the existing open-state check. SECURITY DEFINER,
-- search_path '' , EXECUTE to `authenticated` only — unchanged.
--
-- No schema / RLS / enum / trigger change. Forward-only; 001-047 untouched.
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

  -- (3b) NEW (048): the owning contractor's live account must still be approved
  --      — parity with can_worker_apply (046). A blocked contractor's job is not
  --      open for a NEW / reactivated application.
  if not exists (
    select 1 from public.profiles
    where id = v_job.contractor_id and status = 'approved'
  ) then
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

  -- (9) a free slot must exist right now
  if public.occupied_slot_count(p_job_id) >= v_job.workers_needed then
    raise exception 'job % is fully staffed', p_job_id
      using errcode = 'check_violation';
  end if;

  -- reactivate the SAME row in place (no new row; UNIQUE(job,worker,cycle)
  -- kept; recruitment_cycle untouched).
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
