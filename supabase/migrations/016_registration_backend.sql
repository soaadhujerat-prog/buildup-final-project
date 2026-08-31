-- =============================================================================
-- 016 · registration backend (Phase 3A) — identity carry + server operations
-- =============================================================================
-- Real registration + admin approval, on top of the existing 001–015 schema.
-- No schema redesign: one new column on `registrations` (the identity HMAC that
-- has to survive from signup until approval materialises `user_identity`), plus
-- SECURITY DEFINER functions that do the server-authoritative work in ONE
-- transaction each.
--
-- Security model (unchanged from Phase 1/2):
--   • raw ID number / password NEVER touch the DB — only HMAC-SHA256(pepper).
--   • `registrations.data` carries no email and no password (review decision #3)
--     — the email lives on auth.users and is joined live for admin display.
--   • admin authority is read from LIVE `profiles` (role='admin' AND
--     status='approved'), never from a JWT claim.
--   • the write functions are service_role-only; `admin_list_registrations` is
--     the one authenticated-callable read and self-gates to admins.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) carry the identity HMAC on the pending registration
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column id_number_hash text;

create index registrations_id_number_hash_idx
  on public.registrations (id_number_hash);

-- at most one PENDING registration per identity (duplicate-signup guard)
create unique index registrations_pending_identity_uniq
  on public.registrations (id_number_hash)
  where status = 'pending' and id_number_hash is not null;

-- ---------------------------------------------------------------------------
-- (b) live-admin check (role + status from the DB, not a claim)
-- ---------------------------------------------------------------------------
create or replace function public.is_live_admin(p_uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_uid and role = 'admin' and status = 'approved'
  )
$$;
revoke execute on function public.is_live_admin(uuid) from public, anon, authenticated;
grant  execute on function public.is_live_admin(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (c) create a registration + its first audit event, atomically.
--     Called by the `register` Edge Function AFTER it has created the auth
--     user via GoTrue. p_data is already sanitised (no id/email/password).
-- ---------------------------------------------------------------------------
create or replace function public.create_registration(
  p_auth_user_id uuid,
  p_role         public.registration_role,
  p_id_hash      text,
  p_data         jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.registrations
    (auth_user_id, role, status, id_number_hash, data, external_checks)
  values
    (p_auth_user_id, p_role, 'pending', p_id_hash, coalesce(p_data, '{}'::jsonb), '{}'::jsonb)
  returning id into v_id;

  insert into public.registration_status_events
    (registration_id, from_status, to_status, reason, actor_id)
  values (v_id, 'pending', 'pending', 'submitted', null);

  return v_id;
end;
$$;
revoke execute on function public.create_registration(uuid, public.registration_role, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.create_registration(uuid, public.registration_role, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- (d) admin read: registrations + joined auth email + status events, as jsonb.
--     Self-gates: a non-admin caller gets an empty array, never an error/data.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_registrations()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row_json order by (row_json->>'submitted_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',               r.id,
      'role',             r.role,
      'status',           r.status,
      'submitted_at',     r.submitted_at,
      'processed_at',     r.processed_at,
      'processed_by',     r.processed_by,
      'rejection_reason', r.rejection_reason,
      'rejected_at',      r.rejected_at,
      'approved_at',      r.approved_at,
      'approval_message', r.approval_message,
      'created_user_id',  r.created_user_id,
      'external_checks',  r.external_checks,
      'data',             r.data,
      'email',            u.email,
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
-- (e) APPROVE — materialise profiles + role tables + user_identity, flip the
--     registration, append the audit event. One transaction. Idempotent:
--     re-running re-materialises via upsert / delete+insert and never appends
--     a second approval event.
-- ---------------------------------------------------------------------------
create or replace function public.approve_registration(
  p_registration_id uuid,
  p_actor_id        uuid,
  p_message         text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r          public.registrations%rowtype;
  v_uid      uuid;
  v_email    text;
  d          jsonb;
  v_cat_slug text;
  v_city_id  bigint;
  v_from     public.user_status;
  elem       text;
  is_first   boolean;
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

    for elem in
      select value->>'name' from jsonb_array_elements(coalesce(d->'certifications','[]'::jsonb))
    loop
      if elem is not null and length(btrim(elem)) > 0 then
        insert into public.worker_certifications (worker_id, name) values (v_uid, elem);
      end if;
    end loop;

    for elem in select jsonb_array_elements_text(coalesce(d->'preferredAreas','[]'::jsonb)) loop
      insert into public.worker_preferred_areas (worker_id, area_slug)
      select v_uid, a.slug from public.areas a where a.name = elem
      on conflict do nothing;
    end loop;

  else  -- contractor
    insert into public.contractor_profiles
      (profile_id, company_name, contractor_registration_number, license_details,
       bio, city_id, city_name, license_valid_until,
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
      'verified',
      now(),
      now() + interval '1 year'
    )
    on conflict (profile_id) do update set
      company_name                   = excluded.company_name,
      contractor_registration_number = excluded.contractor_registration_number,
      license_details                = excluded.license_details,
      bio                            = excluded.bio,
      city_id                        = excluded.city_id,
      city_name                      = excluded.city_name,
      license_valid_until            = excluded.license_valid_until,
      license_verification_status    = 'verified',
      license_last_verified_at       = now(),
      license_next_review_at         = now() + interval '1 year';

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
revoke execute on function public.approve_registration(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.approve_registration(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- (f) REJECT — status only; never materialises a role profile.
-- ---------------------------------------------------------------------------
create or replace function public.reject_registration(
  p_registration_id uuid,
  p_actor_id        uuid,
  p_reason          text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.registrations%rowtype;
begin
  if not public.is_live_admin(p_actor_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'rejection reason required' using errcode = 'P0001';
  end if;

  select * into r from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if r.status = 'approved' then
    raise exception 'registration already approved' using errcode = 'P0001';
  end if;
  if r.status = 'rejected' then
    return;  -- idempotent
  end if;

  update public.registrations set
    status           = 'rejected',
    processed_at      = now(),
    processed_by      = p_actor_id,
    rejected_at       = now(),
    rejection_reason  = p_reason
  where id = r.id;

  insert into public.registration_status_events
    (registration_id, from_status, to_status, reason, actor_id)
  values (r.id, r.status, 'rejected', p_reason, p_actor_id);
end;
$$;
revoke execute on function public.reject_registration(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.reject_registration(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- (g) REVERT a rejection back to pending (keeps the rejection history).
-- ---------------------------------------------------------------------------
create or replace function public.revert_registration_rejection(
  p_registration_id uuid,
  p_actor_id        uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.registrations%rowtype;
begin
  if not public.is_live_admin(p_actor_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into r from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if r.status <> 'rejected' then
    raise exception 'registration is not rejected' using errcode = 'P0001';
  end if;

  update public.registrations set
    status       = 'pending',
    processed_at  = null,
    processed_by  = null
  where id = r.id;

  insert into public.registration_status_events
    (registration_id, from_status, to_status, reason, actor_id)
  values (r.id, 'rejected', 'pending', 'reverted for re-review', p_actor_id);
end;
$$;
revoke execute on function public.revert_registration_rejection(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.revert_registration_rejection(uuid, uuid) to service_role;
