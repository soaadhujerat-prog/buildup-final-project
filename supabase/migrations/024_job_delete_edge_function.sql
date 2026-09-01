-- =============================================================================
-- 024 · job hard-delete moves behind an Edge Function (Phase 4C follow-up)
-- =============================================================================
-- Why: the private `worksite-images` bucket's DELETE policy is job_owner(folder),
-- so Storage objects can only be removed while the `jobs` row still exists. The
-- earlier 4C client flow therefore had to strip Storage BEFORE the authoritative
-- DB delete — leaving a window where a blocked delete (jobs_block_delete_with_
-- activity) kept the job but its images were already gone.
--
-- New shape: the `delete-job` Edge Function (verify_jwt=true) captures the job's
-- worksite-image paths, runs the authoritative DB delete FIRST, and only on
-- success removes those exact objects with server-side Storage authority (which
-- does not depend on the now-deleted row). A blocked delete never touches
-- Storage.
--
-- This migration:
--   • DROPS public.delete_job(uuid)         (023 — was authenticated-facing)
--   • ADDS  public.admin_delete_job(p_actor uuid, p_job_id uuid), EXECUTE to
--     service_role ONLY — same "explicit actor" shape as admin_block_user etc.
--   • job_is_deletable(uuid) (023) is UNCHANGED — the JobDetails menu still
--     reads it to choose between "מחק משרה" and "סגור משרה להרשמה".
--
-- The jobs_block_delete_with_activity BEFORE DELETE trigger remains the FINAL
-- guard: it fires inside admin_delete_job exactly as before (SECURITY DEFINER
-- does not bypass triggers), so a job with any application / invitation /
-- assignment still cannot be deleted.
--
-- No change to any RLS policy (jobs, job_* children, storage.objects) or to the
-- trigger.
-- =============================================================================

drop function if exists public.delete_job(uuid);

create or replace function public.admin_delete_job(p_actor uuid, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contractor uuid;
begin
  if p_actor is null then
    raise exception 'no actor' using errcode = '42501';
  end if;

  select contractor_id into v_contractor
  from public.jobs where id = p_job_id;
  if v_contractor is null then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  if v_contractor = p_actor then
    -- owner path: must still be an approved contractor
    if not exists (
      select 1
      from public.contractor_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where cp.profile_id = p_actor and p.status = 'approved'
    ) then
      raise exception 'not an approved contractor' using errcode = '42501';
    end if;
  elsif not public.is_live_admin(p_actor) then
    raise exception 'not authorized to delete this job' using errcode = '42501';
  end if;

  -- jobs_block_delete_with_activity (BEFORE DELETE) raises P0001 if the job has
  -- activity — nothing is deleted, and the Edge Function then leaves Storage
  -- untouched. Child rows cascade via existing FKs on success.
  delete from public.jobs where id = p_job_id;
end;
$$;
revoke execute on function public.admin_delete_job(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.admin_delete_job(uuid, uuid) to service_role;
