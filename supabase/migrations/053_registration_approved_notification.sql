-- =============================================================================
-- 053 · in-app notification on registration approval  (audit follow-up)
-- =============================================================================
-- Read-only audit (this session) confirmed:
--   • approve_registration() / reject_registration() have NEVER written a
--     `public.notifications` row — the `registration_approved` /
--     `registration_rejected` enum values (001) and the frontend's icon
--     mapping (NotificationsScreen) were always ready for this; only the
--     backend insert was missing. DESIGN GAP, not a runtime bug.
--   • The registration-approval/-rejection EMAILS are unaffected and
--     unchanged — they are still sent directly by approve-registration /
--     reject-registration (Edge Functions), never through notify-email's
--     EMAIL_TYPES mirror. This migration adds NO email type, touches no
--     Edge Function, no secret, no Resend config.
--
-- APPROVAL — implemented here.
--   One `public.notify(...)` call, added to the SAME branch that already
--   guards against a retry: `if r.status <> 'approved' then ... end if`
--   (051). On a genuine pending/rejected -> approved transition this fires
--   once; on a retry of an already-approved registration this branch does
--   not run at all, so no second call is even attempted. A `dedupe_key`
--   ('reg_approved:<registration id>') is ALSO set, matching the existing
--   notify() idempotency pattern elsewhere (032/033/040/042) as
--   defense-in-depth against the same registration ever producing two rows.
--
-- REJECTION — intentionally NOT implemented.
--   `public.notifications.user_id` is `not null references public.profiles(id)
--   on delete cascade` (007). A rejected registration's applicant has NO
--   `profiles` row by design (register / login-by-id / the whole rejected-
--   confined-session model, migration 052, all depend on that being true).
--   Calling notify(auth_user_id, 'registration_rejected', ...) for that user
--   would violate this FK and fail — inside the SAME transaction as
--   reject_registration() itself, which would roll back the rejection.
--   The only ways around it would be weakening the FK/RLS or creating a
--   fake profiles row for a rejected user — both explicitly forbidden.
--   reject_registration() is therefore left completely unchanged by this
--   migration. (The rejected user already gets their outcome via the
--   dedicated confined RejectedView + the direct rejection email — this
--   migration does not touch either of those paths.)
--
-- 051's signature (uuid, uuid, text, jsonb) is unchanged — no drop needed.
-- =============================================================================

create or replace function public.approve_registration(
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

    -- 053: real in-app notification for the newly-approved applicant. Same
    -- branch as the status flip above, so a retry on an already-approved
    -- registration never re-enters here; dedupe_key is defense-in-depth on
    -- top of that. In-app only — no email type is added anywhere here.
    perform public.notify(
      v_uid, 'registration_approved',
      'הרישום אושר',
      'הבקשה שלך אושרה. שמחים לצרף אותך ל-BuildUp!',
      r.id::text,
      'reg_approved:' || r.id::text
    );
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
