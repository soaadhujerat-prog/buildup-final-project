-- =============================================================================
-- 028 · reactivate a withdrawn application (Phase 5A UX fix)
-- =============================================================================
-- The worker UI offers "הגש מועמדות מחדש" after a withdrawal, but the backend
-- refused it: can_worker_apply() treated ANY current-cycle row as blocking, and
-- UNIQUE(job_id, worker_id, recruitment_cycle) blocks a second INSERT. So a
-- withdrawn application was a dead end until an (unimplemented) cycle reopen.
--
-- Fix (no new row, UNIQUE constraint kept, recruitment_cycle NOT incremented):
--   1. can_worker_apply — a current-cycle row blocks ONLY when its status is
--      pending / accepted / rejected. A withdrawn current-cycle row no longer
--      blocks (all other gates — self-check, job open, not full — unchanged).
--   2. reapply_to_job(p_job_id, p_message) — a narrow SECURITY DEFINER RPC that
--      reactivates the caller's OWN current-cycle withdrawn row in place:
--        status -> pending · withdrawn_at -> null · responded_at -> null ·
--        contractor_response -> null · applied_at -> now() · message -> new text
--        (recruitment_cycle / worker_id / job_id untouched)
--      It re-checks is_active_user() + can_worker_apply() so a job that closed
--      or filled in the meantime still blocks. Runs as owner (applications is
--      not force-RLS) so it needs no UPDATE policy — the client keeps NO direct
--      UPDATE access (027).
--
-- Untouched: applications INSERT/SELECT RLS, applications_set_cycle,
-- applications_set_updated_at, the UNIQUE constraint, withdraw_application (025),
-- job_registration_state, jobs / invitations / assignments. Forward-only.
-- =============================================================================

-- 1. can_worker_apply — withdrawn is no longer a blocker
create or replace function public.can_worker_apply(p_job_id uuid, p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- a caller may only ask this about themselves
    p_worker_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = p_job_id and j.status = 'open' and j.closed_manually = false
    )
    and not public.is_job_fully_staffed(p_job_id)
    -- decision #9: in the current cycle a pending / accepted / rejected row
    -- blocks a new application; a WITHDRAWN row does not (it is reactivated
    -- in place by reapply_to_job, never duplicated).
    and not exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.job_id = p_job_id
        and a.worker_id = p_worker_id
        and a.recruitment_cycle = j.recruitment_cycle
        and a.status in ('pending', 'accepted', 'rejected')
    )
$$;

-- 2. reapply_to_job — server-authoritative reactivation of the withdrawn row
create or replace function public.reapply_to_job(p_job_id uuid, p_message text)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.applications;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- the caller's OWN row for this job, in the job's CURRENT recruitment cycle
  select a.* into v_row
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.job_id = p_job_id
    and a.worker_id = v_uid
    and a.recruitment_cycle = j.recruitment_cycle;

  if v_row.id is null then
    raise exception 'no application to reactivate for job %', p_job_id
      using errcode = 'P0002';
  end if;
  if v_row.status <> 'withdrawn' then
    raise exception 'application is % and cannot be reactivated', v_row.status
      using errcode = 'P0001';
  end if;

  -- same eligibility gate as a fresh apply (job still open, not full, worker
  -- still approved) — can_worker_apply now allows the withdrawn row through.
  if not (public.is_active_user() and public.can_worker_apply(p_job_id, v_uid)) then
    raise exception 'not eligible to apply to job % right now', p_job_id
      using errcode = '42501';
  end if;

  update public.applications set
    status              = 'pending',
    withdrawn_at         = null,
    responded_at         = null,
    contractor_response  = null,
    applied_at           = now(),
    message              = nullif(btrim(coalesce(p_message, '')), '')
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.reapply_to_job(uuid, text) from public, anon;
grant  execute on function public.reapply_to_job(uuid, text) to authenticated;
