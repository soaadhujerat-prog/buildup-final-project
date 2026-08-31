-- =============================================================================
-- 020 · admin user management + contractor licence review (Phase 3B)
-- =============================================================================
-- Server-authoritative admin operations. Every function here:
--   • is SECURITY DEFINER, search_path '' , and EXECUTE is granted to
--     service_role ONLY — they are reachable exclusively through the
--     `admin-user-action` / `review-license-update` Edge Functions, which
--     verify_jwt=true and re-check the caller against LIVE `profiles`
--     (role='admin' AND status='approved') before calling.
--   • re-checks live admin authority itself (is_live_admin) as defence in
--     depth, and — for block/unblock — the specific admin_permissions row.
--   • writes the notifications row itself (end users cannot INSERT
--     notifications — 008), so a state change and its notification are one
--     transaction.
--   • never performs an arbitrary column update — each function touches a
--     fixed, named set of columns for one specific operation.
--
-- Also adds a trigger so a contractor submitting a licence-update request
-- (a plain RLS-checked client INSERT) still produces the admin notifications.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- helper: does an admin hold a specific permission?
-- ---------------------------------------------------------------------------
create or replace function public.admin_has_permission(p_uid uuid, p_perm public.admin_permission)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_live_admin(p_uid)
     and exists (
       select 1 from public.admin_permissions
       where profile_id = p_uid and permission = p_perm
     )
$$;
revoke execute on function public.admin_has_permission(uuid, public.admin_permission)
  from public, anon, authenticated;
grant  execute on function public.admin_has_permission(uuid, public.admin_permission)
  to service_role;

-- ---------------------------------------------------------------------------
-- block user  (needs the 'block_users' permission)
-- ---------------------------------------------------------------------------
create or replace function public.admin_block_user(
  p_actor  uuid,
  p_user   uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.profiles%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.admin_has_permission(p_actor, 'block_users') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user % not found', p_user using errcode = 'P0002';
  end if;
  if v_row.role = 'admin' then
    raise exception 'cannot block an admin' using errcode = 'P0001';
  end if;
  if v_row.status = 'blocked' then
    return;  -- idempotent, no duplicate notification
  end if;

  update public.profiles set
    status         = 'blocked',
    blocked_reason = v_reason,
    blocked_at     = now()
  where id = p_user;

  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    p_user, 'account_blocked', 'החשבון שלך נחסם',
    coalesce(v_reason, 'החשבון שלך נחסם על ידי מנהל המערכת.'), p_user::text
  );
end;
$$;
revoke execute on function public.admin_block_user(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_block_user(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- unblock user  (needs the 'unblock_users' permission)
-- ---------------------------------------------------------------------------
create or replace function public.admin_unblock_user(p_actor uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.profiles%rowtype;
begin
  if not public.admin_has_permission(p_actor, 'unblock_users') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user % not found', p_user using errcode = 'P0002';
  end if;
  if v_row.status <> 'blocked' then
    return;  -- idempotent
  end if;

  update public.profiles set
    status         = 'approved',
    blocked_reason = null,
    blocked_at     = null
  where id = p_user;

  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    p_user, 'account_unblocked', 'החשבון שלך שוחרר',
    'החשבון שלך פעיל שוב. ברוך שובך!', p_user::text
  );
end;
$$;
revoke execute on function public.admin_unblock_user(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.admin_unblock_user(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- set contractor registration number  (manual admin edit, external check)
--   gated on live-admin; no dedicated enum permission exists for this.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_contractor_registration_number(
  p_actor      uuid,
  p_contractor uuid,
  p_number     text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_cur  text;
  v_next text := nullif(btrim(coalesce(p_number, '')), '');
begin
  if not public.is_live_admin(p_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_next is null then
    raise exception 'registration number required' using errcode = 'P0001';
  end if;

  select contractor_registration_number into v_cur
  from public.contractor_profiles where profile_id = p_contractor for update;
  if not found then
    raise exception 'contractor % not found', p_contractor using errcode = 'P0002';
  end if;
  if v_cur = v_next then
    return;  -- no real change -> no write, no notification
  end if;

  begin
    update public.contractor_profiles
      set contractor_registration_number = v_next
      where profile_id = p_contractor;
  exception when unique_violation then
    raise exception 'registration number already in use' using errcode = 'P0001';
  end;

  insert into public.notifications (user_id, type, title, body, related_id)
  values (
    p_contractor, 'contractor_registration_number_updated',
    'מספר רישום הקבלן עודכן',
    'מספר רישום הקבלן בחשבונך עודכן על ידי מנהל המערכת. ניתן לצפות בפרטים המעודכנים בפרופיל שלך.',
    p_contractor::text
  );
end;
$$;
revoke execute on function public.admin_set_contractor_registration_number(uuid, uuid, text)
  from public, anon, authenticated;
grant  execute on function public.admin_set_contractor_registration_number(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- grant / revoke an admin permission on another admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_admin_permission(
  p_actor      uuid,
  p_target     uuid,
  p_permission public.admin_permission,
  p_grant      boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_live_admin(p_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target and role = 'admin') then
    raise exception 'target % is not an admin', p_target using errcode = 'P0001';
  end if;

  if p_grant then
    insert into public.admin_permissions (profile_id, permission)
    values (p_target, p_permission)
    on conflict do nothing;
  else
    delete from public.admin_permissions
    where profile_id = p_target and permission = p_permission;
  end if;
end;
$$;
revoke execute on function public.admin_set_admin_permission(uuid, uuid, public.admin_permission, boolean)
  from public, anon, authenticated;
grant  execute on function public.admin_set_admin_permission(uuid, uuid, public.admin_permission, boolean)
  to service_role;

-- =============================================================================
-- contractor licence review
-- =============================================================================

-- ---- notify admins when a contractor files a licence-update request ----
create or replace function public.notify_admins_license_request()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_company text;
begin
  select company_name into v_company
  from public.contractor_profiles where profile_id = new.contractor_id;

  insert into public.notifications (user_id, type, title, body, related_id)
  select p.id, 'license_update_submitted', 'בקשת עדכון רישיון חדשה',
         coalesce(v_company, 'קבלן') || ' הגיש בקשה לעדכון רישיון הקבלן לבדיקה.',
         new.contractor_id::text
  from public.profiles p
  where p.role = 'admin' and p.status = 'approved';

  return new;
end;
$$;
-- trigger function only — never a PostgREST RPC
revoke execute on function public.notify_admins_license_request() from public, anon, authenticated;

create trigger contractor_license_request_notify
  after insert on public.contractor_license_update_requests
  for each row execute function public.notify_admins_license_request();

-- ---- review (approve / reject) a pending licence-update request ----
create or replace function public.review_contractor_license_update(
  p_actor   uuid,
  p_request uuid,
  p_approve boolean,
  p_reason  text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r      public.contractor_license_update_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_live_admin(p_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into r from public.contractor_license_update_requests
    where id = p_request for update;
  if not found then
    raise exception 'request % not found', p_request using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'request already reviewed' using errcode = 'P0001';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'rejection reason required' using errcode = 'P0001';
  end if;

  if p_approve then
    update public.contractor_profiles set
      contractor_registration_number = coalesce(
        nullif(btrim(coalesce(r.new_registration_number, '')), ''),
        contractor_registration_number),
      license_details = coalesce(
        nullif(btrim(coalesce(r.new_license_details, '')), ''), license_details),
      license_document_path = coalesce(
        nullif(r.new_license_document_path, ''), license_document_path),
      license_valid_from  = coalesce(r.proposed_valid_from, license_valid_from),
      license_valid_until = coalesce(r.proposed_valid_until, license_valid_until),
      license_verification_status = 'verified',
      license_last_verified_at = now(),
      license_next_review_at   = now() + interval '1 year'
    where profile_id = r.contractor_id;

    update public.contractor_license_update_requests set
      status = 'approved', reviewed_at = now(), reviewed_by = p_actor,
      rejection_reason = null
    where id = r.id;

    insert into public.notifications (user_id, type, title, body, related_id)
    values (
      r.contractor_id, 'license_update_approved', 'בקשת עדכון הרישיון אושרה',
      'הרישיון החדש עודכן ואומת. הוא מוצג כעת בפרופיל שלך.', r.contractor_id::text
    );
  else
    update public.contractor_license_update_requests set
      status = 'rejected', reviewed_at = now(), reviewed_by = p_actor,
      rejection_reason = v_reason
    where id = r.id;

    insert into public.notifications (user_id, type, title, body, related_id)
    values (
      r.contractor_id, 'license_update_rejected', 'בקשת עדכון הרישיון נדחתה',
      'הבקשה נדחתה: ' || v_reason || '. הרישיון הקודם נשאר בתוקף.',
      r.contractor_id::text
    );
  end if;
end;
$$;
revoke execute on function public.review_contractor_license_update(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant  execute on function public.review_contractor_license_update(uuid, uuid, boolean, text)
  to service_role;

-- ---- periodic verification stamp (no document / date change, no notification) ----
create or replace function public.verify_contractor_license(p_actor uuid, p_contractor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_live_admin(p_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.contractor_profiles set
    license_verification_status = 'verified',
    license_last_verified_at = now(),
    license_next_review_at   = now() + interval '1 year'
  where profile_id = p_contractor;
  if not found then
    raise exception 'contractor % not found', p_contractor using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.verify_contractor_license(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.verify_contractor_license(uuid, uuid) to service_role;

-- ---- ask a contractor to upload a renewed licence (notification only) ----
create or replace function public.request_contractor_license_renewal(p_actor uuid, p_contractor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_until date;
  v_key   text;
begin
  if not public.is_live_admin(p_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select license_valid_until into v_until
  from public.contractor_profiles where profile_id = p_contractor;
  if not found then
    raise exception 'contractor % not found', p_contractor using errcode = 'P0002';
  end if;

  v_key := 'lic-renewal:' || p_contractor::text || ':' || coalesce(v_until::text, '');
  insert into public.notifications (user_id, type, title, body, related_id, dedupe_key)
  values (
    p_contractor, 'license_renewal_requested', 'נדרש חידוש רישיון קבלן',
    'יש להעלות מסמך רישיון קבלן מעודכן ותאריך תוקף חדש לצורך בדיקת מנהל המערכת.',
    p_contractor::text, v_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
revoke execute on function public.request_contractor_license_renewal(uuid, uuid)
  from public, anon, authenticated;
grant  execute on function public.request_contractor_license_renewal(uuid, uuid)
  to service_role;
