-- =============================================================================
-- 023 · jobs close / reopen / delete (Phase 4C)
-- =============================================================================
-- Phase 4A added the READ layer, 022 the create/edit WRITE RPCs. This adds the
-- three remaining contractor job operations. NO schema change to `jobs`, its
-- child tables, the job_registration_state view, or any RLS policy.
--
-- SOURCE OF TRUTH — unchanged
--   public.job_registration_state stays the ONLY source of truth for
--   open_for_applications / is_full / filled_count / remaining_slots /
--   closure_reason. There is still NO stored "accepting applications" boolean.
--   The contractor's close/reopen control writes exactly ONE column —
--   jobs.closed_manually — and the view re-derives everything from it.
--
-- Explicitly NOT touched by anything here:
--   jobs.status · jobs.workers_needed · jobs.recruitment_cycle ·
--   applications / invitations / assignments · any derived field.
--   (Re-application / recruitment-cycle semantics belong to Phase 5.)
--
-- Security model = identical to 022:
--   SECURITY DEFINER, search_path '', EXECUTE granted to `authenticated` only
--   (revoked from public/anon). auth.uid() is read live from the request JWT.
--   No service_role, no Edge Function, no client secret.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- set_job_closed_manually — the ONLY write behind the contractor's
--   "סגור / פתח משרה להרשמה" toggle. Writes jobs.closed_manually and nothing
--   else. Reopening (p_closed = false) does NOT force the job open — it only
--   clears the manual flag; job_registration_state then decides whether the
--   job actually reopens (a full job stays closed with closure_reason
--   'capacity'). Caller: the owning contractor (must still be approved) or a
--   live admin.
-- ---------------------------------------------------------------------------
create or replace function public.set_job_closed_manually(
  p_job_id uuid,
  p_closed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  if public.job_owner(p_job_id) then
    -- owner path: must still be an approved contractor
    if not exists (
      select 1
      from public.contractor_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where cp.profile_id = v_uid and p.status = 'approved'
    ) then
      raise exception 'not an approved contractor' using errcode = '42501';
    end if;
  elsif not public.is_live_admin(v_uid) then
    raise exception 'not authorized to change this job' using errcode = '42501';
  end if;

  update public.jobs
     set closed_manually = coalesce(p_closed, false)
   where id = p_job_id;
end;
$$;
revoke execute on function public.set_job_closed_manually(uuid, boolean) from public, anon;
grant  execute on function public.set_job_closed_manually(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- job_is_deletable — boolean the JobDetails menu uses to choose between
--   "מחק משרה" and "סגור משרה להרשמה". The synchronous mock staffing arrays
--   are not valid when the backend is on, so the screen asks the DB instead.
--   Returns false (never the underlying rows) when ANY application /
--   invitation / assignment references the job, when the job is gone, or when
--   the caller is not the owner / a live admin. The BEFORE DELETE trigger
--   remains authoritative even if a cached value goes stale.
-- ---------------------------------------------------------------------------
create or replace function public.job_is_deletable(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
        (public.job_owner(p_job_id) or public.is_live_admin((select auth.uid())))
    and exists     (select 1 from public.jobs         where id     = p_job_id)
    and not exists (select 1 from public.applications where job_id = p_job_id)
    and not exists (select 1 from public.invitations  where job_id = p_job_id)
    and not exists (select 1 from public.assignments  where job_id = p_job_id);
$$;
revoke execute on function public.job_is_deletable(uuid) from public, anon;
grant  execute on function public.job_is_deletable(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_job — owner / live-admin hard delete of a clean job. Authorisation
--   mirrors update_job (022). The BEFORE DELETE trigger
--   jobs_block_delete_with_activity is the FINAL guard: if the job gained any
--   application / invitation / assignment since the caller checked, the delete
--   raises and nothing is removed. Child rows (job_professions,
--   job_required_certifications, job_requirements, job_worksite_images) drop
--   via their existing ON DELETE CASCADE FKs. Worksite-image STORAGE objects
--   are a best-effort client step done BEFORE this call (bucket RLS =
--   job_owner needs the row to still exist).
-- ---------------------------------------------------------------------------
create or replace function public.delete_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;
  if not (public.job_owner(p_job_id) or public.is_live_admin(v_uid)) then
    raise exception 'not authorized to delete this job' using errcode = '42501';
  end if;

  -- jobs_block_delete_with_activity (BEFORE DELETE) raises here if activity
  -- exists — SECURITY DEFINER does not bypass triggers.
  delete from public.jobs where id = p_job_id;
end;
$$;
revoke execute on function public.delete_job(uuid) from public, anon;
grant  execute on function public.delete_job(uuid) to authenticated;
