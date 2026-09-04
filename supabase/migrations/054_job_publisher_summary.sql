-- =============================================================================
-- 054 · safe job-publisher summary for a visible job  (audit follow-up)
-- =============================================================================
-- Read-only audit (this session) confirmed: `can_view_job(job_id)` already
-- lets any authenticated user view an OPEN job with no relationship required,
-- but `can_view_profile(contractor_id)` only returns true once a real
-- application / invitation / assignment / conversation exists between that
-- specific worker and that specific contractor. Result: a worker who can
-- legitimately see a brand-new open job still cannot resolve its "פורסם על
-- ידי" publisher until some other relationship happens to exist.
--
-- REJECTED FIX: broadening `can_view_profile()` with an "owns a visible job"
-- branch. `contractor_profiles_select` (008) is a single ROW-LEVEL policy
-- gated by that same function — broadening it would let any worker who can
-- see any open job run `select * from contractor_profiles` directly and get
-- back `license_document_path` / `contractor_registration_number` /
-- `license_details` / `license_valid_until`, none of which any worker-facing
-- screen or query is supposed to expose (see participantsService.ts).
-- `can_view_profile()` and `can_view_job()` are therefore left BYTE-FOR-BYTE
-- UNCHANGED by this migration.
--
-- SAFE FIX: one new, narrow SECURITY DEFINER reader. It:
--   • takes ONLY a job id (never a contractor id from the client — the
--     contractor is looked up server-side from the job row);
--   • re-derives authorization itself via the EXISTING, unmodified
--     `public.can_view_job(p_job_id)` (which itself re-derives the caller
--     from auth.uid(), same as every other RLS helper in this project);
--   • returns ONLY the same safe public fields
--     `services/participantsService.ts#loadContractorSummaries` already
--     exposes to workers — never the licence document/number/dates, never
--     ID/auth/admin data.
-- =============================================================================

create function public.get_job_publisher(p_job_id uuid)
returns table (
  id                          uuid,
  full_name                   text,
  phone                       text,
  avatar_path                 text,
  company_name                text,
  city_name                   text,
  bio                         text,
  license_verification_status public.contractor_license_status,
  area_slugs                  text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.phone,
    p.avatar_path,
    cp.company_name,
    cp.city_name,
    cp.bio,
    cp.license_verification_status,
    coalesce(
      (
        select array_agg(ca.area_slug order by ca.area_slug)
        from public.contractor_areas ca
        where ca.contractor_id = p.id
      ),
      '{}'::text[]
    ) as area_slugs
  from public.jobs j
  join public.profiles p on p.id = j.contractor_id and p.role = 'contractor'
  left join public.contractor_profiles cp on cp.profile_id = j.contractor_id
  where j.id = p_job_id
    and public.can_view_job(p_job_id)
$$;

revoke execute on function public.get_job_publisher(uuid) from public, anon;
grant  execute on function public.get_job_publisher(uuid) to authenticated;
