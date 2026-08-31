-- =============================================================================
-- 021 · update_own_worker_profile also handles available_from  (Phase 3B)
-- =============================================================================
-- AvailabilityManagementScreen sends `availableFrom` through updateWorkerProfile
-- (alongside preferredAreas), while the on/off toggle goes through
-- setWorkerAvailability. 018 only handled the latter. This adds the
-- `availableFrom` branch to update_own_worker_profile so both paths persist it.
-- Value is an ISO string / 'YYYY-MM-DD' from the client (already normalised
-- there); '' clears it. Identical to the 018 body otherwise.
-- =============================================================================

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
    available_from = case when d ? 'availableFrom'
                         then nullif(btrim(d->>'availableFrom'), '')::date
                         else available_from end,
    city_id   = case when d ? 'city' then v_city_id else city_id end,
    city_name = case when d ? 'city' then coalesce(d->>'city', '') else city_name end
  where profile_id = v_uid;

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

  if d ? 'skills' then
    delete from public.worker_skills where worker_id = v_uid;
    for elem in select jsonb_array_elements_text(coalesce(d->'skills', '[]'::jsonb)) loop
      if length(btrim(elem)) > 0 then
        insert into public.worker_skills (worker_id, skill) values (v_uid, btrim(elem))
        on conflict do nothing;
      end if;
    end loop;
  end if;

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
