-- =============================================================================
-- 026 · tighten applications UPDATE so a worker can only pending -> withdrawn
-- =============================================================================
-- WHY (Phase 5A follow-up): the 008 `applications_update` policy let the owning
-- worker UPDATE their row with no column / transition constraint. Harmless
-- while applications were mock; now that they are real a worker could craft a
-- raw PostgREST call `UPDATE applications SET status='accepted'` on their own
-- pending row and show the contractor a fabricated "accepted" application
-- (Phase 5A requirement J8: no client write to a privileged application
-- status). The sanctioned worker transition is exactly `pending -> withdrawn`,
-- and it already lives in the SECURITY DEFINER `withdraw_application` RPC (025)
-- — that RPC runs as owner and BYPASSES RLS, so this change does not affect it
-- or any Phase 5A client code. It only closes the raw-update hole.
--
-- Contractor (job_owner) and admin branches are UNCHANGED — Phase 5B's
-- accept/reject builds on them.
--
-- No schema change. Not a weakening — a tightening that makes the policy match
-- the shipped RPC rule.
-- =============================================================================

drop policy if exists applications_update on public.applications;

create policy applications_update on public.applications
  for update to authenticated
  using (
    -- worker may only act on their OWN row while it is still pending
    (worker_id = (select auth.uid()) and status = 'pending')
    or public.job_owner(job_id)
    or public.is_admin()
  )
  with check (
    -- ...and may only move it to 'withdrawn' (its own message may ride along)
    (worker_id = (select auth.uid()) and status = 'withdrawn')
    or public.job_owner(job_id)
    or public.is_admin()
  );
