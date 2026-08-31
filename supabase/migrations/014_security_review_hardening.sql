-- =============================================================================
-- 014 · security review — close two low-severity disclosure oracles
-- =============================================================================
-- Focused follow-up to the Phase-1 security review of the 8 SECURITY DEFINER
-- helper functions that remain executable by `authenticated` (required for RLS
-- / the job_registration_state view).
--
-- Findings:
--   * 6 of the 8 pin every identity check to (select auth.uid()), return only a
--     boolean, and are safe as-is (documented in the review).
--   * can_worker_apply(p_job_id, p_worker_id) — a direct RPC call with an
--     arbitrary p_worker_id acted as an oracle for "has worker W already
--     applied to job J in the current cycle" (otherwise protected by the
--     applications SELECT policy). FIX: require p_worker_id = auth.uid().
--     The only caller (the applications INSERT policy) already constrains
--     worker_id = auth.uid(), so behaviour is unchanged.
--   * occupied_slot_count(p_job_id) — a direct RPC call returned a staffed
--     head-count for any job, including non-open jobs the caller cannot see.
--     FIX: return the real count only for server-side callers (auth.uid() IS
--     NULL — triggers / service-role RPCs), admins, or callers who can see the
--     job; otherwise return 0. Every legitimate path (capacity-guard trigger,
--     invitations INSERT policy, can_worker_apply, the job_registration_state
--     view) still gets an accurate count.
--
-- No schema, no business rule, no external contract changes. search_path stays
-- '' ; both stay SECURITY DEFINER (required to bypass RLS without recursion).
-- =============================================================================

create or replace function public.can_worker_apply(p_job_id uuid, p_worker_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    -- a caller may only ask this about themselves
    p_worker_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = p_job_id and j.status = 'open' and j.closed_manually = false
    )
    and not public.is_job_fully_staffed(p_job_id)
    -- decision #9: no free re-application after reject/accept/withdraw; only a
    -- new recruitment_cycle (explicit reopen) permits another row.
    and not exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.job_id = p_job_id
        and a.worker_id = p_worker_id
        and a.recruitment_cycle = j.recruitment_cycle
    )
$$;

create or replace function public.occupied_slot_count(p_job_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select case
    when (select auth.uid()) is null          -- trigger / service-role RPC
      or public.is_admin()
      or public.can_view_job(p_job_id)
    then (
      with eff as (
        select distinct on (a.worker_id) a.worker_id, a.status
        from public.assignments a
        where a.job_id = p_job_id
        order by a.worker_id, a.updated_at desc, a.created_at desc
      )
      select coalesce(count(*) filter (where status in ('active', 'completed')), 0)::int
      from eff
    )
    else 0
  end
$$;
