-- =============================================================================
-- 049 · can_worker_apply: also refuse a worker who is already ENGAGED with the
--       job through staffing (invitation-sourced assignment / live invitation)
-- =============================================================================
-- GAP.  public.can_worker_apply(...) decides whether a worker may create a new
-- application (applications_insert RLS WITH CHECK) or reactivate a withdrawn one
-- (reapply_to_job, 028). Its "already involved" test looks ONLY at the
-- `applications` table:
--     a.status in ('pending','accepted','rejected')  in the current cycle
-- An accepted INVITATION, however, creates an `assignments` row and NO
-- application row (respond_to_invitation, 030/031). So a worker who is already
-- STAFFED on a job via an invitation — or merely holds a live invitation to it
-- — still passes can_worker_apply and can file a duplicate application against
-- the same job while genuinely engaged with it.
--
-- FIX.  Two extra `and not exists (...)` clauses, mirroring the worker-specific
-- eligibility rule already enforced in the app (services/assignmentService.ts
-- getWorkerJobEngagement + screens/JobDetailsScreen + AppContext.applyToJob):
--
--   A worker may NOT create / reapply an application for a job when, for the
--   same worker + job, there is
--     1. an ACTIVE assignment,
--     2. a COMPLETED assignment,
--     3. a PENDING invitation, or
--     4. an ACCEPTED invitation.
--
-- A CANCELLED assignment is deliberately NOT a blocker — the worker-cancelled
-- reapply path (reapply_after_cancellation, 034/048; it inlines its own checks
-- and never calls can_worker_apply) and the normal withdrawn-row reactivation
-- (reapply_to_job, 028) must keep working exactly as before. `declined` /
-- `cancelled` / `expired` invitations are likewise not blockers.
--
-- can_worker_apply is otherwise reproduced VERBATIM from 046: same signature,
-- same volatility / security / search_path, same "caller may only ask about
-- themselves" guard, same job-open + owning-contractor-approved test, same
-- is_job_fully_staffed test, same current-cycle application-status test. Only
-- the two staffing-engagement clauses are added at the end.
--
-- Callers affected (both gain the same guard, consistently):
--   * applications_insert  RLS WITH CHECK   — direct INSERT / applyToJobBackend
--   * reapply_to_job(uuid,text)             — withdrawn -> pending reactivation
-- NOT affected: reapply_after_cancellation (no call to can_worker_apply),
-- respond_to_application (029), respond_to_invitation (030/031), every capacity
-- / recruitment_cycle / open-state / staffing-transition rule.
--
-- No schema / RLS policy / enum / trigger / grant change. `create or replace`
-- keeps the 012 `execute ... to authenticated` grant. Forward-only; migrations
-- 001-048 untouched.
-- =============================================================================

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
      select 1
      from public.jobs j
      join public.profiles op on op.id = j.contractor_id
      where j.id = p_job_id
        and j.status = 'open'
        and j.closed_manually = false
        and op.status = 'approved'          -- owning contractor still active (046)
    )
    and not public.is_job_fully_staffed(p_job_id)
    -- decision #9 (028): in the current cycle a pending / accepted / rejected
    -- row blocks a new application; a WITHDRAWN row does not (it is reactivated
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
    -- NEW (049): the worker is not already ENGAGED with this job through
    -- staffing. An accepted INVITATION creates an assignment but NO application
    -- row, so the clause above cannot see it. Block an ACTIVE or COMPLETED
    -- assignment for this worker+job. A CANCELLED assignment is NOT a blocker
    -- (worker-cancelled reapply / withdrawn reactivation stay unchanged).
    and not exists (
      select 1
      from public.assignments s
      where s.job_id = p_job_id
        and s.worker_id = p_worker_id
        and s.status in ('active', 'completed')
    )
    -- NEW (049): a live invitation (PENDING or ACCEPTED) for this worker+job
    -- means the worker is already engaged — respond to the invitation instead
    -- of filing a fresh application. declined / cancelled / expired do not block.
    and not exists (
      select 1
      from public.invitations i
      where i.job_id = p_job_id
        and i.worker_id = p_worker_id
        and i.status in ('pending', 'accepted')
    )
$$;
-- (grants unchanged: 012 granted execute to authenticated)
