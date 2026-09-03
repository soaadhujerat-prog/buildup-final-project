-- =============================================================================
-- 051 · registration document pipeline
-- =============================================================================
-- Contractor licence documents and worker certificate documents picked at
-- sign-up are now really uploaded to private Storage, carried on the pending
-- registration, shown to the admin BEFORE approval, and — on approval —
-- materialised to CANONICAL, user-owned Storage paths.
--
-- FORWARD-ONLY. Nothing in 016 / 019 / 020 is edited. Every new field / param
-- is nullable and optional: an existing pending registration with no document
-- fields approves byte-for-byte as before.
--
-- STORAGE MODEL (staging -> canonical)
--   During registration (no session yet) the documents are staged under the
--   reserved registration id, via one-shot service-role signed upload tokens:
--       contractor-licenses/{registrationId}/license.<ext>
--       worker-certificates/{registrationId}/certificate-<n>.<ext>
--   The `id-documents/{registrationId}/...` flow is unchanged (019).
--
--   On approval the `approve-registration` Edge Function (service-role) MOVES
--   each staged object to its canonical, RLS-aligned location:
--       contractor-licenses/{approvedUserId}/license-<stamp>.<ext>
--       worker-certificates/{approvedUserId}/certificate-<stamp>-<n>.<ext>
--   and passes the canonical paths to approve_registration() via p_doc_overrides.
--
--   This SQL NEVER trusts a raw registration-scoped path as a final value.
--   contractor_profiles.license_document_path and
--   worker_certifications.document_path are set ONLY from p_doc_overrides
--   (already canonical, post-move) — otherwise left NULL and the contractor
--   uses the existing licence-renewal flow.
--
-- VERIFICATION STATE
--   A newly approved contractor is marked license_verification_status =
--   'verified' ONLY when a licence document was actually submitted and the
--   admin approved it. With no document the profile is created 'pending_review'
--   (the DB default) instead of being auto-"verified". Re-approving an already
--   approved contractor never downgrades an existing verified licence.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) carry the licence staging path on the pending registration
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column if not exists license_document_path text;

-- ---------------------------------------------------------------------------
-- (b) create_registration — now licence-document aware
--     (7-arg 019 version -> 8-arg; only the `register` Edge Function calls it)
-- ---------------------------------------------------------------------------
drop function if exists public.create_registration(
  uuid, uuid, public.registration_role, text, text, text, jsonb);

create function public.create_registration(
  p_registration_id      uuid,
  p_auth_user_id         uuid,
  p_role                 public.registration_role,
  p_id_hash              text,
  p_id_enc               text,
  p_id_document_path      text,
  p_license_document_path text,
  p_data                 jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_registration_id, gen_random_uuid());
begin
  insert into public.registrations
    (id, auth_user_id, role, status, id_number_hash, id_number_enc,
     id_document_path, license_document_path, data, external_checks)
  values
    (v_id, p_auth_user_id, p_role, 'pending', p_id_hash, p_id_enc,
     nullif(p_id_document_path, ''), nullif(p_license_document_path, ''),
     coalesce(p_data, '{}'::jsonb), '{}'::jsonb)
  returning id into v_id;

  insert into public.registration_status_events
    (registration_id, from_status, to_status, reason, actor_id)
  values (v_id, 'pending', 'pending', 'submitted', null);

  return v_id;
end;
$$;

revoke execute on function public.create_registration(
  uuid, uuid, public.registration_role, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.create_registration(
  uuid, uuid, public.registration_role, text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- (c) admin_list_registrations — expose license_document_path
--     (worker certificate document paths already travel inside `data`)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_registrations()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row_json order by (row_json->>'submitted_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',                    r.id,
      'role',                  r.role,
      'status',                r.status,
      'submitted_at',          r.submitted_at,
      'processed_at',          r.processed_at,
      'processed_by',          r.processed_by,
      'rejection_reason',      r.rejection_reason,
      'rejected_at',           r.rejected_at,
      'approved_at',           r.approved_at,
      'approval_message',      r.approval_message,
      'created_user_id',       r.created_user_id,
      'external_checks',       r.external_checks,
      'id_document_path',      r.id_document_path,
      'license_document_path', r.license_document_path,
      'data',                  r.data,
      'email',                 u.email,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',             e.id,
          'registrationId', e.registration_id,
          'fromStatus',     e.from_status,
          'toStatus',       e.to_status,
          'reason',         e.reason,
          'message',        e.message,
          'actorId',        e.actor_id,
          'createdAt',      e.created_at
        ) order by e.created_at)
        from public.registration_status_events e
        where e.registration_id = r.id
      ), '[]'::jsonb)
    ) as row_json
    from public.registrations r
    left join auth.users u on u.id = r.auth_user_id
    where public.is_live_admin((select auth.uid()))
  ) s
$$;
revoke execute on function public.admin_list_registrations() from public, anon;
grant  execute on function public.admin_list_registrations() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (d) approve_registration — canonical document materialisation
--     3-arg (016) -> 4-arg. p_doc_overrides is AUTHORITATIVE when present
--     (the Edge Function has already moved every object to its canonical
--     path); when null the function behaves exactly as the 016 version except
--     that a contractor with no licence document is created 'pending_review'
--     rather than auto-'verified'.
--       p_doc_overrides = {
--         "licenseDocumentPath": "<canonical path>" | null,   -- contractor
--         "certifications": [ { "name": "...",
--                               "documentPath": "<canonical path>" | null }, ... ] -- worker
--       }
-- ---------------------------------------------------------------------------
drop function if exists public.approve_registration(uuid, uuid, text);

create function public.approve_registration(
  p_registration_id uuid,
  p_actor_id        uuid,
  p_message         text  default null,
  p_doc_overrides   jsonb default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r             public.registrations%rowtype;
  v_uid         uuid;
  v_email       text;
  d             jsonb;
  v_cat_slug    text;
  v_city_id     bigint;
  v_from        public.user_status;
  elem          text;
  cert          record;
  is_first      boolean;
  v_lic_override boolean := false;
  v_lic_path     text;
begin
  if not public.is_live_admin(p_actor_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into r from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if r.status = 'rejected' then
    raise exception 'registration is rejected; revert it before approving' using errcode = 'P0001';
  end if;

  v_uid := r.auth_user_id;
  d     := coalesce(r.data, '{}'::jsonb);
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'auth user has no email' using errcode = 'P0001';
  end if;

  -- authoritative (already-canonical) licence path, if the caller supplied one
  if p_doc_overrides is not null and (p_doc_overrides ? 'licenseDocumentPath') then
    v_lic_override := true;
    v_lic_path     := nullif(p_doc_overrides->>'licenseDocumentPath', '');
  end if;

  -- ---- profiles ----
  insert into public.profiles (id, role, full_name, phone, email, email_verified, status)
  values (
    v_uid,
    r.role::text::public.user_role,
    coalesce(d->>'fullName', ''),
    coalesce(d->>'phone', ''),
    v_email,
    true,
    'approved'
  )
  on conflict (id) do update set
    role           = excluded.role,
    full_name      = excluded.full_name,
    phone          = excluded.phone,
    email          = excluded.email,
    email_verified = true,
    status         = 'approved';

  -- ---- user_identity (HMAC copied from the registration; no raw ID anywhere) ----
  if r.id_number_hash is not null then
    insert into public.user_identity (profile_id, id_number_hash)
    values (v_uid, r.id_number_hash)
    on conflict (profile_id) do update set id_number_hash = excluded.id_number_hash;
  end if;

  select id into v_city_id from public.cities where name = (d->>'city') limit 1;

  if r.role = 'worker' then
    v_cat_slug := (select slug from public.profession_categories where name = (d->>'professionCategory'));
    if v_cat_slug is null then
      raise exception 'unknown profession category "%"', (d->>'professionCategory') using errcode = 'P0001';
    end if;

    insert into public.worker_profiles
      (profile_id, profession_category_slug, experience_years, is_available,
       available_from, hourly_rate, daily_rate, bio, city_id, city_name)
    values (
      v_uid, v_cat_slug,
      coalesce((d->>'experienceYears')::int, 0),
      coalesce((d->>'isAvailable')::boolean, true),
      nullif(d->>'availableFrom','')::date,
      coalesce((d->>'hourlyRate')::numeric, 0),
      coalesce((d->>'dailyRate')::numeric, 0),
      coalesce(d->>'bio',''),
      v_city_id,
      coalesce(d->>'city','')
    )
    on conflict (profile_id) do update set
      profession_category_slug = excluded.profession_category_slug,
      experience_years         = excluded.experience_years,
      is_available             = excluded.is_available,
      available_from           = excluded.available_from,
      hourly_rate              = excluded.hourly_rate,
      daily_rate               = excluded.daily_rate,
      bio                      = excluded.bio,
      city_id                  = excluded.city_id,
      city_name                = excluded.city_name;

    delete from public.worker_professions     where worker_id = v_uid;
    delete from public.worker_skills          where worker_id = v_uid;
    delete from public.worker_certifications  where worker_id = v_uid;
    delete from public.worker_preferred_areas where worker_id = v_uid;

    is_first := true;
    for elem in select jsonb_array_elements_text(coalesce(d->'professions','[]'::jsonb)) loop
      insert into public.worker_professions (worker_id, profession_slug, is_primary)
      select v_uid, p.slug, is_first from public.professions p where p.name = elem
      on conflict do nothing;
      is_first := false;
    end loop;

    for elem in select jsonb_array_elements_text(coalesce(d->'skills','[]'::jsonb)) loop
      if length(btrim(elem)) > 0 then
        insert into public.worker_skills (worker_id, skill) values (v_uid, elem)
        on conflict do nothing;
      end if;
    end loop;

    -- certifications: names always; document_path ONLY from an authoritative,
    -- already-canonical override (never a raw registration-scoped path).
    if p_doc_overrides is not null and (p_doc_overrides ? 'certifications') then
      for cert in
        select * from jsonb_to_recordset(coalesce(p_doc_overrides->'certifications','[]'::jsonb))
          as x(name text, "documentPath" text)
      loop
        if cert.name is not null and length(btrim(cert.name)) > 0 then
          insert into public.worker_certifications (worker_id, name, document_path)
          values (v_uid, btrim(cert.name), nullif(cert."documentPath", ''));
        end if;
      end loop;
    else
      for elem in
        select value->>'name' from jsonb_array_elements(coalesce(d->'certifications','[]'::jsonb))
      loop
        if elem is not null and length(btrim(elem)) > 0 then
          insert into public.worker_certifications (worker_id, name) values (v_uid, elem);
        end if;
      end loop;
    end if;

    for elem in select jsonb_array_elements_text(coalesce(d->'preferredAreas','[]'::jsonb)) loop
      insert into public.worker_preferred_areas (worker_id, area_slug)
      select v_uid, a.slug from public.areas a where a.name = elem
      on conflict do nothing;
    end loop;

  else  -- contractor
    insert into public.contractor_profiles
      (profile_id, company_name, contractor_registration_number, license_details,
       bio, city_id, city_name, license_valid_until, license_document_path,
       license_verification_status, license_last_verified_at, license_next_review_at)
    values (
      v_uid,
      coalesce(d->>'companyName',''),
      coalesce(d->>'contractorRegistrationNumber',''),
      coalesce(d->>'licenseDetails',''),
      d->>'bio',
      v_city_id,
      coalesce(d->>'city',''),
      nullif(d->>'licenseValidUntil','')::date,
      case when v_lic_override then v_lic_path else null end,
      case when v_lic_path is not null
           then 'verified'::public.contractor_license_status
           else 'pending_review'::public.contractor_license_status end,
      case when v_lic_path is not null then now() else null end,
      case when v_lic_path is not null then now() + interval '1 year' else null end
    )
    on conflict (profile_id) do update set
      company_name                   = excluded.company_name,
      contractor_registration_number = excluded.contractor_registration_number,
      license_details                = excluded.license_details,
      bio                            = excluded.bio,
      city_id                        = excluded.city_id,
      city_name                      = excluded.city_name,
      license_valid_until            = excluded.license_valid_until,
      license_document_path          = case
                                         when v_lic_override
                                         then coalesce(v_lic_path, public.contractor_profiles.license_document_path)
                                         else public.contractor_profiles.license_document_path
                                       end,
      license_verification_status    = case
                                         when v_lic_path is not null
                                         then 'verified'::public.contractor_license_status
                                         else public.contractor_profiles.license_verification_status
                                       end,
      license_last_verified_at       = case
                                         when v_lic_path is not null
                                         then now()
                                         else public.contractor_profiles.license_last_verified_at
                                       end,
      license_next_review_at         = case
                                         when v_lic_path is not null
                                         then now() + interval '1 year'
                                         else public.contractor_profiles.license_next_review_at
                                       end;

    delete from public.contractor_areas         where contractor_id = v_uid;
    delete from public.contractor_project_types where contractor_id = v_uid;

    for elem in select jsonb_array_elements_text(coalesce(d->'areasOfOperation','[]'::jsonb)) loop
      insert into public.contractor_areas (contractor_id, area_slug)
      select v_uid, a.slug from public.areas a where a.name = elem
      on conflict do nothing;
    end loop;

    for elem in select jsonb_array_elements_text(coalesce(d->'projectTypes','[]'::jsonb)) loop
      insert into public.contractor_project_types (contractor_id, project_type_slug)
      select v_uid, t.slug from public.project_types t where t.name = elem
      on conflict do nothing;
    end loop;
  end if;

  if r.status <> 'approved' then
    v_from := r.status;
    update public.registrations set
      status           = 'approved',
      processed_at      = now(),
      processed_by      = p_actor_id,
      approved_at       = now(),
      approval_message  = p_message,
      created_user_id   = v_uid
    where id = r.id;

    insert into public.registration_status_events
      (registration_id, from_status, to_status, reason, message, actor_id)
    values (r.id, v_from, 'approved', 'approved', p_message, p_actor_id);
  else
    update public.registrations
      set created_user_id = coalesce(created_user_id, v_uid)
    where id = r.id;
  end if;

  return v_uid;
end;
$$;
revoke execute on function public.approve_registration(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.approve_registration(uuid, uuid, text, jsonb)
  to service_role;
