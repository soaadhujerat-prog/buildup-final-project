-- =============================================================================
-- 018 · self-service profile writes (Phase 3B)
-- =============================================================================
-- Phase 2 gave the profile READ path (fetchSessionUser). This adds the WRITE
-- path for a signed-in APPROVED worker / contractor editing their OWN profile.
--
-- Design:
--   • one SECURITY DEFINER function per role + a tiny availability function.
--   • every function is HARD-PINNED to auth.uid() — it can only ever write the
--     caller's own rows. There is no user-id parameter.
--   • the functions NEVER reference role / status / email / blocked_* on
--     profiles, and NEVER reference contractor licence columns / the
--     contractor registration number. Those stay server-authoritative
--     (guard_profiles_privileged_columns / guard_contractor_license_columns +
--     the dedicated admin flows).
--   • child collections are transactionally REPLACED (delete + re-insert)
--     inside the single function body, preserving the one-primary partial
--     unique index (only ever one is_primary=true row is inserted).
--   • Hebrew display names in the payload are resolved to taxonomy slugs
--     exactly like public.approve_registration does (name match, never an
--     invented mapping).
--
-- The payload shape mirrors the existing edit-screen patch objects; every key
-- is optional and only applied when present (`p_data ? 'key'`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- worker: scalar profile + all child collections
-- ---------------------------------------------------------------------------
create or replace function public.update_own_worker_profile(p_data jsonb)
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
  elem       text;
  is_first   boolean;
  cert       record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved worker' using errcode = '42501';
  end if;

  -- ---- profiles (non-privileged columns only) ----
  update public.profiles set
    full_name  = case when d ? 'fullName'
                      then coalesce(nullif(btrim(d->>'fullName'), ''), full_name)
                      else full_name end,
    phone      = case when d ? 'phone'
                      then coalesce(nullif(btrim(d->>'phone'), ''), phone)
                      else phone end,
    avatar_path = case when d ? 'avatarPath'
                       then nullif(d->>'avatarPath', '')
                       else avatar_path end
  where id = v_uid;

  -- ---- worker_profiles scalars ----
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

  update public.worker_profiles set
    profession_category_slug = coalesce(v_cat_slug, profession_category_slug),
    experience_years = case when d ? 'experienceYears'
                            then greatest(coalesce((d->>'experienceYears')::int, 0), 0)
                            else experience_years end,
    hourly_rate = case when d ? 'hourlyRate'
                       then greatest(coalesce((d->>'hourlyRate')::numeric, 0), 0)
                       else hourly_rate end,
    daily_rate  = case when d ? 'dailyRate'
                       then greatest(coalesce((d->>'dailyRate')::numeric, 0), 0)
                       else daily_rate end,
    bio = case when d ? 'bio' then coalesce(d->>'bio', '') else bio end,
    city_id   = case when d ? 'city' then v_city_id else city_id end,
    city_name = case when d ? 'city' then coalesce(d->>'city', '') else city_name end
  where profile_id = v_uid;

  -- ---- professions (first entry is the single primary) ----
  if d ? 'professions' then
    delete from public.worker_professions where worker_id = v_uid;
    is_first := true;
    for elem in select jsonb_array_elements_text(coalesce(d->'professions', '[]'::jsonb)) loop
      insert into public.worker_professions (worker_id, profession_slug, is_primary)
      select v_uid, pr.slug, is_first from public.professions pr where pr.name = elem
      on conflict do nothing;
      is_first := false;
    end loop;
  end if;

  -- ---- skills ----
  if d ? 'skills' then
    delete from public.worker_skills where worker_id = v_uid;
    for elem in select jsonb_array_elements_text(coalesce(d->'skills', '[]'::jsonb)) loop
      if length(btrim(elem)) > 0 then
        insert into public.worker_skills (worker_id, skill) values (v_uid, btrim(elem))
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- ---- certifications (name + optional storage path) ----
  if d ? 'certifications' then
    delete from public.worker_certifications where worker_id = v_uid;
    for cert in
      select * from jsonb_to_recordset(coalesce(d->'certifications', '[]'::jsonb))
        as x(name text, "documentPath" text)
    loop
      if length(btrim(coalesce(cert.name, ''))) > 0 then
        insert into public.worker_certifications (worker_id, name, document_path)
        values (v_uid, btrim(cert.name), nullif(cert."documentPath", ''));
      end if;
    end loop;
  end if;

  -- ---- preferred areas ----
  if d ? 'preferredAreas' then
    delete from public.worker_preferred_areas where worker_id = v_uid;
    for elem in select jsonb_array_elements_text(coalesce(d->'preferredAreas', '[]'::jsonb)) loop
      insert into public.worker_preferred_areas (worker_id, area_slug)
      select v_uid, a.slug from public.areas a where a.name = elem
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

revoke execute on function public.update_own_worker_profile(jsonb) from public, anon;
grant  execute on function public.update_own_worker_profile(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- worker: availability only (dedicated, tiny)
-- ---------------------------------------------------------------------------
create or replace function public.set_own_worker_availability(
  p_is_available  boolean,
  p_available_from text default null
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
  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved worker' using errcode = '42501';
  end if;

  update public.worker_profiles set
    is_available   = coalesce(p_is_available, is_available),
    available_from = nullif(btrim(coalesce(p_available_from, '')), '')::date
  where profile_id = v_uid;
end;
$$;

revoke execute on function public.set_own_worker_availability(boolean, text) from public, anon;
grant  execute on function public.set_own_worker_availability(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- contractor: scalar profile + areas + project types
--   (NEVER the registration number, licence text, licence document or any
--    verification column — those change only through the admin review flow)
-- ---------------------------------------------------------------------------
create or replace function public.update_own_contractor_profile(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  d         jsonb := coalesce(p_data, '{}'::jsonb);
  v_city_id bigint;
  elem      text;
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

  update public.profiles set
    full_name = case when d ? 'fullName'
                     then coalesce(nullif(btrim(d->>'fullName'), ''), full_name)
                     else full_name end,
    phone     = case when d ? 'phone'
                     then coalesce(nullif(btrim(d->>'phone'), ''), phone)
                     else phone end,
    avatar_path = case when d ? 'avatarPath'
                       then nullif(d->>'avatarPath', '')
                       else avatar_path end
  where id = v_uid;

  if d ? 'city' then
    select id into v_city_id from public.cities where name = d->>'city' limit 1;
  end if;

  update public.contractor_profiles set
    company_name = case when d ? 'companyName'
                        then coalesce(nullif(btrim(d->>'companyName'), ''), company_name)
                        else company_name end,
    bio       = case when d ? 'bio' then d->>'bio' else bio end,
    city_id   = case when d ? 'city' then v_city_id else city_id end,
    city_name = case when d ? 'city' then coalesce(d->>'city', '') else city_name end
  where profile_id = v_uid;

  if d ? 'areasOfOperation' then
    delete from public.contractor_areas where contractor_id = v_uid;
    for elem in select jsonb_array_elements_text(coalesce(d->'areasOfOperation', '[]'::jsonb)) loop
      insert into public.contractor_areas (contractor_id, area_slug)
      select v_uid, a.slug from public.areas a where a.name = elem
      on conflict do nothing;
    end loop;
  end if;

  if d ? 'projectTypes' then
    delete from public.contractor_project_types where contractor_id = v_uid;
    for elem in select jsonb_array_elements_text(coalesce(d->'projectTypes', '[]'::jsonb)) loop
      insert into public.contractor_project_types (contractor_id, project_type_slug)
      select v_uid, t.slug from public.project_types t where t.name = elem
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

revoke execute on function public.update_own_contractor_profile(jsonb) from public, anon;
grant  execute on function public.update_own_contractor_profile(jsonb) to authenticated;
