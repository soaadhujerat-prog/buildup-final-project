-- =============================================================================
-- 055 · safe summary for a worker's OWN favorite contractors  (audit follow-up)
-- =============================================================================
-- Read-only audit (this session) confirmed a real, confirmed-live gap:
-- `worker_favorite_contractors` grants NO profile visibility on its own — its
-- RLS policies (008/013) only govern the favorites table itself, never
-- `can_view_profile()`. A contractor a worker favorited while viewing one of
-- their jobs can later have that job close with no other relationship
-- (application / invitation / assignment / conversation) ever forming. At
-- that point `can_view_profile()` legitimately returns false, and even
-- migration 054's `get_job_publisher(job_id)` has no job id left to key off
-- — so the favorited contractor silently disappears from
-- FavoriteContractorsScreen. Per product decision, this MUST NOT happen: a
-- worker who explicitly saved a favorite must keep seeing it while the
-- favorite row exists.
--
-- REJECTED FIX: broadening `can_view_profile()` with a "favorited by caller"
-- branch. Exactly like 054's reasoning: `contractor_profiles_select` (008) is
-- a single ROW-LEVEL policy gated by that function, so broadening it would
-- let any worker who ever favorited a contractor `select *` the full
-- `contractor_profiles` row directly — licence document / number / details /
-- dates included. `can_view_profile()` is therefore left BYTE-FOR-BYTE
-- UNCHANGED by this migration, same as 054.
--
-- SAFE FIX: one more narrow SECURITY DEFINER reader, same shape as 054's
-- `get_job_publisher`. It:
--   • takes NO parameters — the worker is derived ONLY from auth.uid(),
--     never trusted from the client (there is no way to pass another
--     worker's id in, so Worker A can never read Worker B's favorites);
--   • joins `worker_favorite_contractors` scoped to that caller and requires
--     the target `profiles` row to be role='contractor' AND status='approved'
--     (a stale favorite pointing at a no-longer-approved contractor returns
--     nothing — same "neutral fallback, never fabricate" rule used
--     everywhere else in this codebase);
--   • returns ONLY the same safe public fields 054 already returns, plus
--     `project_type_slugs` (ContractorCard already renders project-type
--     tags for the normal contractor pool via loadContractorSummaries, so
--     this RPC includes the same field for parity) — never the licence
--     document/number/details/dates, never ID/auth/admin data.
-- =============================================================================

create function public.get_my_favorite_contractors()
returns table (
  id                          uuid,
  full_name                   text,
  phone                       text,
  avatar_path                 text,
  company_name                text,
  city_name                   text,
  bio                         text,
  license_verification_status public.contractor_license_status,
  area_slugs                  text[],
  project_type_slugs          text[]
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
    ) as area_slugs,
    coalesce(
      (
        select array_agg(cpt.project_type_slug order by cpt.project_type_slug)
        from public.contractor_project_types cpt
        where cpt.contractor_id = p.id
      ),
      '{}'::text[]
    ) as project_type_slugs
  from public.worker_favorite_contractors wfc
  join public.profiles p
    on p.id = wfc.contractor_id
   and p.role = 'contractor'
   and p.status = 'approved'
  left join public.contractor_profiles cp on cp.profile_id = p.id
  where wfc.worker_id = (select auth.uid())
    -- caller must be an approved worker (mirrors the intent of the
    -- worker-only favorites feature; a non-worker caller simply gets no
    -- rows rather than an error, same "neutral fallback" style as
    -- can_view_job / can_view_profile elsewhere in this project).
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and me.role = 'worker'
        and me.status = 'approved'
    )
$$;

revoke execute on function public.get_my_favorite_contractors() from public, anon;
grant  execute on function public.get_my_favorite_contractors() to authenticated;
