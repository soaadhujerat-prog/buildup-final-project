-- =============================================================================
-- 029 · contractor accept / reject an application (Phase 5B)
-- =============================================================================
-- ONE atomic SECURITY DEFINER RPC for the contractor's pending-application
-- response. The client has NO direct write to applications (027) or assignments
-- (008: assignments has only a SELECT policy), so this is the sole path.
--
-- respond_to_application(p_application_id, p_accept, p_response):
--   • caller = the owning, still-approved contractor (no admin path — the UI
--     is contractor-only)
--   • application must be pending AND in the job's CURRENT recruitment_cycle
--   • ACCEPT: SELECT ... FOR UPDATE on the job row serializes concurrent
--     accepts; re-check occupied_slot_count(job) < workers_needed under that
--     lock; INSERT exactly one 'active' assignment (source='application',
--     source_id=application id); flip application pending -> accepted.
--     assignments_capacity_guard + the assignments_one_active unique index are
--     the last-resort DB guards. If the INSERT fails, the whole function
--     aborts -> application stays pending, no assignment.
--   • REJECT: flip pending -> rejected. No assignment, capacity untouched.
--   • responded_at is server time; contractor_response is the trimmed p_response
--     (or null). recruitment_cycle / worker_id / job_id / workers_needed /
--     closed_manually / job.status / any registration flag are NEVER written —
--     job_registration_state re-derives full/closed from the new assignment.
--
-- No schema change. No RLS change. Forward-only.
-- Untouched: applications/assignments RLS, applications_set_cycle, withdraw_/
-- reapply_ RPCs, occupied_slot_count, is_job_fully_staffed, staffing_progress,
-- job_registration_state, assignments_reconcile, invitations.
-- =============================================================================

create or replace function public.respond_to_application(
  p_application_id uuid,
  p_accept         boolean,
  p_response       text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_app  public.applications;
  v_job  public.jobs;
  v_resp text := nullif(btrim(coalesce(p_response, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;

  -- lock the job row for the whole response: serializes concurrent ACCEPTs
  select * into v_job from public.jobs where id = v_app.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.contractor_id <> v_uid then
    raise exception 'not authorized for this job' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'application is % and cannot be responded to', v_app.status
      using errcode = 'P0001';
  end if;
  if v_app.recruitment_cycle <> v_job.recruitment_cycle then
    raise exception 'application belongs to a past recruitment cycle'
      using errcode = 'P0001';
  end if;

  if p_accept then
    if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
      raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
    end if;

    insert into public.assignments (job_id, contractor_id, worker_id, source, source_id, status)
    values (v_job.id, v_uid, v_app.worker_id, 'application', v_app.id, 'active');

    update public.applications set
      status              = 'accepted',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;
  else
    update public.applications set
      status              = 'rejected',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;
  end if;

  return v_app;
end;
$$;
revoke execute on function public.respond_to_application(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_application(uuid, boolean, text) to authenticated;
