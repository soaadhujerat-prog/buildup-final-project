-- =============================================================================
-- 045 · job worksite coordinates (Phase 10 — Job Location / Map)
-- =============================================================================
-- Lets a contractor pin the EXACT worksite location for a job on a map. The
-- coordinate augments — never replaces — the required city; when it is absent
-- Smart Match keeps using the job city centroid (unchanged fallback).
--
-- WHAT CHANGES
--   `create_job` / `update_job` now accept two OPTIONAL payload keys:
--     "lat"  -90 .. 90
--     "lon" -180 .. 180
--   • create: both valid  -> stored; absent  -> NULL.
--   • update: both keys present + valid       -> stored;
--             both keys present + JSON null   -> cleared (remove precise pin);
--             keys ABSENT                     -> lat/lon left exactly as-is
--                                               (an unrelated edit never resets
--                                               a saved pin — Phase 10 §J).
--   • non-numeric / out-of-range / NaN / Infinity -> P0001, the whole write
--     is rejected (Phase 10 §I). A partial pair ("lat" without "lon") is
--     ignored — both keys are required to touch the columns.
--
-- This SUPERSEDES the "lat / lon are impossible to set from the client" note in
-- 022's header for this one, validated, owner-only path. Everything else about
-- create_job / update_job is reproduced verbatim from 022 — no other behaviour,
-- column, grant or security property changes. Still SECURITY DEFINER,
-- search_path '', EXECUTE to `authenticated` only; contractor_id forced to
-- auth.uid() on create; owner-or-live-admin on update; jobs RLS untouched.
-- =============================================================================

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
  v_uid       uuid := (select auth.uid());
  d           jsonb := coalesce(p_data, '{}'::jsonb);
  v_cat_slug  text;
  v_city_id   bigint;
  v_job_id    uuid;
  v_hourly    numeric(10,2);
  v_daily     numeric(10,2);
  v_has_coord boolean := (d ? 'lat') and (d ? 'lon');
  v_lat_txt   text := nullif(btrim(d->>'lat'), '');
  v_lon_txt   text := nullif(btrim(d->>'lon'), '');
  v_lat       double precision;
  v_lon       double precision;
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

  -- worksite coordinates (optional, validated)
  if v_has_coord and v_lat_txt is not null and v_lon_txt is not null then
    if v_lat_txt !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
       or v_lon_txt !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
      raise exception 'worksite coordinates must be numeric' using errcode = 'P0001';
    end if;
    v_lat := v_lat_txt::double precision;
    v_lon := v_lon_txt::double precision;
    if v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180 then
      raise exception 'worksite coordinates out of range' using errcode = 'P0001';
    end if;
  end if;

  insert into public.jobs (
    contractor_id, title, description, profession_category_slug,
    city_id, city_name, address, lat, lon, start_date, end_date, duration,
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
    v_lat,
    v_lon,
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
-- posted_at / created_at. lat / lon are now editable ONLY through the
-- validated worksite-coordinate path below (both keys present). updated_at is
-- set ONLY when the payload carries `updatedAt`.
-- ---------------------------------------------------------------------------
create or replace function public.update_job(p_job_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  d           jsonb := coalesce(p_data, '{}'::jsonb);
  v_cat_slug  text;
  v_city_id   bigint;
  v_has_coord boolean := (d ? 'lat') and (d ? 'lon');
  v_lat_txt   text := nullif(btrim(d->>'lat'), '');
  v_lon_txt   text := nullif(btrim(d->>'lon'), '');
  v_lat       double precision;
  v_lon       double precision;
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

  -- worksite coordinates (optional, validated). Only touched when BOTH keys
  -- are present; JSON null in either clears the pair.
  if v_has_coord then
    if v_lat_txt is not null and v_lon_txt is not null then
      if v_lat_txt !~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
         or v_lon_txt !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
        raise exception 'worksite coordinates must be numeric' using errcode = 'P0001';
      end if;
      v_lat := v_lat_txt::double precision;
      v_lon := v_lon_txt::double precision;
      if v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180 then
        raise exception 'worksite coordinates out of range' using errcode = 'P0001';
      end if;
    else
      v_lat := null;  -- explicit clear
      v_lon := null;
    end if;
  end if;

  update public.jobs set
    title        = case when d ? 'title'
                        then coalesce(nullif(btrim(d->>'title'), ''), title) else title end,
    description  = case when d ? 'description' then coalesce(d->>'description', '') else description end,
    profession_category_slug = coalesce(v_cat_slug, profession_category_slug),
    city_id      = case when d ? 'city' then v_city_id else city_id end,
    city_name    = case when d ? 'city' then coalesce(d->>'city', '') else city_name end,
    address      = case when d ? 'address' then coalesce(d->>'address', '') else address end,
    lat          = case when v_has_coord then v_lat else lat end,
    lon          = case when v_has_coord then v_lon else lon end,
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
