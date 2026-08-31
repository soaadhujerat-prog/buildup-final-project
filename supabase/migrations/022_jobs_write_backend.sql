-- =============================================================================
-- 022 · jobs write backend (Phase 4B) — create / edit / worksite images
-- =============================================================================
-- Phase 4A added the READ layer. This adds the transactional WRITE RPCs for a
-- contractor creating and editing their OWN jobs. NO schema change to `jobs`,
-- its child tables, or job_registration_state — they were already complete.
--
-- Why RPCs (not direct client + RLS):
--   • a job = one `jobs` row + N child rows across 4 tables — must be ONE
--     transaction so a partial job can never exist.
--   • Hebrew display names in the payload must be resolved to taxonomy SLUGS
--     server-side (never store labels where a FK expects a slug).
--   • the one-primary partial-unique on job_professions must hold.
--   • privileged / system-derived columns must be impossible to set from the
--     client: contractor_id, status, closed_manually, recruitment_cycle,
--     posted_at, created_at, lat, lon, updated_at (except an explicit edit).
--
-- Security model (identical to the Phase 3B self-service RPCs):
--   • SECURITY DEFINER, search_path '' , EXECUTE granted to `authenticated`
--     ONLY (revoked from public/anon).
--   • create_job: caller must be an APPROVED contractor; contractor_id is
--     forced to auth.uid() — a client-supplied id is never read.
--   • update_job / set_job_worksite_images: caller must own the job
--     (public.job_owner) OR be a live approved admin (public.is_live_admin).
--   • auth.uid() is read live from the request JWT (not a role claim).
--   • no service_role, no Edge Function needed.
--
-- The registration/open state is untouched here: a new job is status='open',
-- closed_manually=false, recruitment_cycle=1, so job_registration_state
-- reports open_for_applications purely from workers_needed vs active
-- assignments — the existing single source of truth. Nothing is duplicated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- helper: resolve + write the child collections for a job (shared by
-- create_job / update_job). Only rewrites a collection when its key is
-- PRESENT in the payload (so an edit that omits e.g. "requirements" leaves
-- the existing rows intact).
-- ---------------------------------------------------------------------------
create or replace function public.jobs_apply_child_collections(
  p_job_id uuid,
  d        jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  elem     text;
  is_first boolean;
  v_i      int;
begin
  if d ? 'professions' then
    delete from public.job_professions where job_id = p_job_id;
    is_first := true;
    for elem in select jsonb_array_elements_text(coalesce(d->'professions', '[]'::jsonb)) loop
      insert into public.job_professions (job_id, profession_slug, is_primary)
      select p_job_id, pr.slug, is_first
      from public.professions pr where pr.name = elem
      on conflict do nothing;
      is_first := false;
    end loop;
  end if;

  if d ? 'requirements' then
    delete from public.job_requirements where job_id = p_job_id;
    v_i := 0;
    for elem in select jsonb_array_elements_text(coalesce(d->'requirements', '[]'::jsonb)) loop
      if length(btrim(elem)) > 0 then
        insert into public.job_requirements (job_id, text, sort_order)
        values (p_job_id, btrim(elem), v_i);
        v_i := v_i + 1;
      end if;
    end loop;
  end if;

  if d ? 'requiredCertifications' then
    delete from public.job_required_certifications where job_id = p_job_id;
    for elem in select jsonb_array_elements_text(coalesce(d->'requiredCertifications', '[]'::jsonb)) loop
      if length(btrim(elem)) > 0 then
        insert into public.job_required_certifications (job_id, name)
        values (p_job_id, btrim(elem))
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;
revoke execute on function public.jobs_apply_child_collections(uuid, jsonb)
  from public, anon, authenticated;
-- called only from the SECURITY DEFINER functions below (same owner) — no grant.

-- ---------------------------------------------------------------------------
-- create_job — approved contractor creates a job they own
-- ---------------------------------------------------------------------------
create or replace function public.create_job(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  d          jsonb := coalesce(p_data, '{}'::jsonb);
  v_cat_slug text;
  v_city_id  bigint;
  v_job_id   uuid;
  v_hourly   numeric(10,2);
  v_daily    numeric(10,2);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  select slug into v_cat_slug
  from public.profession_categories where name = d->>'professionCategory';
  if v_cat_slug is null then
    raise exception 'unknown profession category "%"', d->>'professionCategory'
      using errcode = 'P0001';
  end if;

  select id into v_city_id from public.cities where name = d->>'city' limit 1;

  v_hourly := nullif(d->>'hourlyRate', '')::numeric;
  v_daily  := nullif(d->>'dailyRate', '')::numeric;
  if v_hourly is null and v_daily is null then
    raise exception 'a job must have an hourly or a daily rate' using errcode = 'P0001';
  end if;

  insert into public.jobs (
    contractor_id, title, description, profession_category_slug,
    city_id, city_name, address, start_date, end_date, duration,
    hourly_rate, daily_rate, workers_needed, urgent
  )
  values (
    v_uid,
    coalesce(nullif(btrim(d->>'title'), ''), ''),
    coalesce(d->>'description', ''),
    v_cat_slug,
    v_city_id,
    coalesce(d->>'city', ''),
    coalesce(d->>'address', ''),
    (nullif(btrim(d->>'startDate'), ''))::date,
    (nullif(btrim(d->>'endDate'), ''))::date,
    coalesce(d->>'duration', ''),
    v_hourly,
    v_daily,
    greatest(coalesce((d->>'workersNeeded')::int, 1), 1),
    coalesce((d->>'urgent')::boolean, false)
  )
  returning id into v_job_id;

  perform public.jobs_apply_child_collections(v_job_id, d);
  return v_job_id;
end;
$$;
revoke execute on function public.create_job(jsonb) from public, anon;
grant  execute on function public.create_job(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- update_job — owner (or live admin) edits content columns + child rows.
-- Never touches contractor_id / status / closed_manually / recruitment_cycle /
-- posted_at / created_at / lat / lon. updated_at is set ONLY when the payload
-- carries `updatedAt` (a real content edit — PostJobScreen passes it).
-- ---------------------------------------------------------------------------
create or replace function public.update_job(p_job_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  d          jsonb := coalesce(p_data, '{}'::jsonb);
  v_cat_slug text;
  v_city_id  bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (public.job_owner(p_job_id) or public.is_live_admin(v_uid)) then
    raise exception 'not authorized to edit this job' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  if d ? 'professionCategory' then
    select slug into v_cat_slug
    from public.profession_categories where name = d->>'professionCategory';
    if v_cat_slug is null then
      raise exception 'unknown profession category "%"', d->>'professionCategory'
        using errcode = 'P0001';
    end if;
  end if;

  if d ? 'city' then
    select id into v_city_id from public.cities where name = d->>'city' limit 1;
  end if;

  update public.jobs set
    title        = case when d ? 'title'
                        then coalesce(nullif(btrim(d->>'title'), ''), title) else title end,
    description  = case when d ? 'description' then coalesce(d->>'description', '') else description end,
    profession_category_slug = coalesce(v_cat_slug, profession_category_slug),
    city_id      = case when d ? 'city' then v_city_id else city_id end,
    city_name    = case when d ? 'city' then coalesce(d->>'city', '') else city_name end,
    address      = case when d ? 'address' then coalesce(d->>'address', '') else address end,
    start_date   = case when d ? 'startDate'
                        then (nullif(btrim(d->>'startDate'), ''))::date else start_date end,
    end_date     = case when d ? 'endDate'
                        then (nullif(btrim(d->>'endDate'), ''))::date else end_date end,
    duration     = case when d ? 'duration' then coalesce(d->>'duration', '') else duration end,
    hourly_rate  = case when d ? 'hourlyRate' then nullif(d->>'hourlyRate', '')::numeric else hourly_rate end,
    daily_rate   = case when d ? 'dailyRate'  then nullif(d->>'dailyRate', '')::numeric  else daily_rate end,
    workers_needed = case when d ? 'workersNeeded'
                          then greatest(coalesce((d->>'workersNeeded')::int, workers_needed), 1)
                          else workers_needed end,
    urgent       = case when d ? 'urgent' then coalesce((d->>'urgent')::boolean, urgent) else urgent end,
    updated_at   = case when d ? 'updatedAt'
                        then coalesce(nullif(d->>'updatedAt', '')::timestamptz, now())
                        else updated_at end
  where id = p_job_id;

  perform public.jobs_apply_child_collections(p_job_id, d);
end;
$$;
revoke execute on function public.update_job(uuid, jsonb) from public, anon;
grant  execute on function public.update_job(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- set_job_worksite_images — replace the job's worksite-image rows with the
-- given ordered storage paths. Every path MUST live inside the job's own
-- folder (`{job_id}/…`) so a caller cannot attach an object they do not own.
-- The bytes are uploaded to the private `worksite-images` bucket by the
-- client first (RLS there: job_owner). Removal of the orphaned storage
-- objects is a best-effort client step after this succeeds.
-- ---------------------------------------------------------------------------
create or replace function public.set_job_worksite_images(
  p_job_id uuid,
  p_paths  text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  bad   text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (public.job_owner(p_job_id) or public.is_live_admin(v_uid)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select p into bad
  from unnest(coalesce(p_paths, '{}'::text[])) as p
  where nullif(btrim(p), '') is not null
    and p not like (p_job_id::text || '/%')
  limit 1;
  if bad is not null then
    raise exception 'worksite image path "%" is outside job folder', bad
      using errcode = 'P0001';
  end if;

  delete from public.job_worksite_images where job_id = p_job_id;

  insert into public.job_worksite_images (job_id, path, sort_order)
  select p_job_id, btrim(p), (ord - 1)::int
  from unnest(coalesce(p_paths, '{}'::text[])) with ordinality as t(p, ord)
  where nullif(btrim(p), '') is not null;
end;
$$;
revoke execute on function public.set_job_worksite_images(uuid, text[]) from public, anon;
grant  execute on function public.set_job_worksite_images(uuid, text[]) to authenticated;
