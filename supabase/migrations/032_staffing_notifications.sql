-- =============================================================================
-- 032 · real in-app notifications for staffing business events (Phase 6)
-- =============================================================================
-- The `notifications` table, `notification_type` enum, RLS (SELECT own / UPDATE
-- own `is_read` only) and the partial unique index
--   notifications_dedupe_uniq (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
-- already exist. This migration makes the AUTHORITATIVE staffing RPCs
-- (029/030/031) and the existing assignments_reconcile trigger (009) write the
-- notification row IN THE SAME TRANSACTION as the business action, via one tiny
-- SECURITY DEFINER helper `public.notify(...)` that does an idempotent
-- INSERT ... ON CONFLICT DO NOTHING keyed on the dedupe_key.
--
-- Guarantees:
--   • exactly one notification per successful action (dedupe_key)
--   • a rolled-back / stale / unauthorized RPC writes ZERO notifications
--     (the notify() call is reached only after the state transition succeeds,
--      and shares the RPC's transaction)
--   • clients still have NO INSERT on notifications (helper is SECURITY DEFINER,
--     EXECUTE revoked from public/anon/authenticated — only the owner-run RPCs
--     and the trigger call it). RLS unchanged.
--   • no sensitive data in the payload — only display name + job title.
--
-- Only the notification INSERT is added; every business rule, lock order,
-- capacity check, error code and return value of the six RPCs and the trigger
-- is byte-for-byte unchanged from 029 / 030 / 031 / 009.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- helper: idempotent notification insert (server-side only)
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_user_id    uuid,
  p_type       public.notification_type,
  p_title      text,
  p_body       text,
  p_related_id text,
  p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, related_id, dedupe_key)
  values (p_user_id, p_type, p_title, coalesce(p_body, ''), nullif(p_related_id, ''), p_dedupe_key)
  on conflict (user_id, dedupe_key) where (dedupe_key is not null) do nothing;
$$;
revoke execute on function public.notify(uuid, public.notification_type, text, text, text, text)
  from public, anon, authenticated;
-- called only from the SECURITY DEFINER RPCs / trigger below (same owner) — no grant.

-- =============================================================================
-- 029 · respond_to_application  (+ application_accepted / application_rejected)
-- =============================================================================
create or replace function public.respond_to_application(
  p_application_id uuid,
  p_accept         boolean,
  p_response       text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_app  public.applications;
  v_job  public.jobs;
  v_resp text := nullif(btrim(coalesce(p_response, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs where id = v_app.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.contractor_id <> v_uid then
    raise exception 'not authorized for this job' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'application is % and cannot be responded to', v_app.status
      using errcode = 'P0001';
  end if;
  if v_app.recruitment_cycle <> v_job.recruitment_cycle then
    raise exception 'application belongs to a past recruitment cycle'
      using errcode = 'P0001';
  end if;

  if p_accept then
    if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
      raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
    end if;

    insert into public.assignments (job_id, contractor_id, worker_id, source, source_id, status)
    values (v_job.id, v_uid, v_app.worker_id, 'application', v_app.id, 'active');

    update public.applications set
      status              = 'accepted',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;

    perform public.notify(
      v_app.worker_id, 'application_accepted',
      'הבקשה שלך אושרה',
      'הבקשה שלך למשרה "' || coalesce(v_job.title, '') || '" אושרה ושובצת למשרה.'
        || case when v_resp is not null then E'\nהודעת הקבלן: "' || v_resp || '"' else '' end,
      v_job.id::text, 'app_accepted:' || v_app.id::text
    );
  else
    update public.applications set
      status              = 'rejected',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;

    perform public.notify(
      v_app.worker_id, 'application_rejected',
      'הבקשה שלך נדחתה',
      'התקבלה החלטה לגבי הבקשה שלך למשרה "' || coalesce(v_job.title, '') || '".'
        || case when v_resp is not null then E'\nהודעת הקבלן: "' || v_resp || '"' else '' end,
      v_job.id::text, 'app_rejected:' || v_app.id::text
    );
  end if;

  return v_app;
end;
$$;
revoke execute on function public.respond_to_application(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_application(uuid, boolean, text) to authenticated;

-- =============================================================================
-- 030 · send_invitation  (+ invitation_received)
-- =============================================================================
create or replace function public.send_invitation(
  p_job_id    uuid,
  p_worker_id uuid,
  p_message   text
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_job     public.jobs;
  v_inv     public.invitations;
  v_msg     text := nullif(btrim(coalesce(p_message, '')), '');
  v_company text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  if v_job.contractor_id <> v_uid then
    raise exception 'not authorized for this job' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = p_worker_id
      and p.role = 'worker'
      and p.status = 'approved'
  ) then
    raise exception 'target is not an approved worker' using errcode = 'P0001';
  end if;

  if v_job.status <> 'open' then
    raise exception 'job % is not open for staffing', p_job_id using errcode = 'P0001';
  end if;
  if v_job.closed_manually then
    raise exception 'job % is closed to registration', p_job_id using errcode = 'P0001';
  end if;

  if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
    raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.invitations
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'an active invitation for this worker and job already exists'
      using errcode = 'unique_violation';
  end if;

  insert into public.invitations (job_id, contractor_id, worker_id, message, status)
  values (p_job_id, v_uid, p_worker_id, v_msg, 'pending')
  returning * into v_inv;

  select company_name into v_company from public.contractor_profiles where profile_id = v_uid;
  perform public.notify(
    p_worker_id, 'invitation_received',
    'הזמנה חדשה לעבודה',
    coalesce(nullif(btrim(v_company), ''), 'קבלן')
      || ' הזמין אותך לפרויקט "' || coalesce(v_job.title, '') || '".',
    v_job.id::text, 'inv_received:' || v_inv.id::text
  );

  return v_inv;
end;
$$;
revoke execute on function public.send_invitation(uuid, uuid, text) from public, anon;
grant  execute on function public.send_invitation(uuid, uuid, text) to authenticated;

-- =============================================================================
-- 030 · respond_to_invitation  (+ invitation_accepted / invitation_declined)
-- =============================================================================
create or replace function public.respond_to_invitation(
  p_invitation_id     uuid,
  p_accept            boolean,
  p_response_message  text
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_inv   public.invitations;
  v_job   public.jobs;
  v_resp  text := nullif(btrim(coalesce(p_response_message, '')), '');
  v_wname text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id using errcode = 'P0002';
  end if;

  if v_inv.worker_id <> v_uid then
    raise exception 'not your invitation' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved worker' using errcode = '42501';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation is % and cannot be responded to', v_inv.status
      using errcode = 'P0001';
  end if;

  select * into v_job from public.jobs where id = v_inv.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  select full_name into v_wname from public.profiles where id = v_inv.worker_id;

  if p_accept then
    if v_job.status <> 'open' then
      raise exception 'job % is not open for staffing', v_job.id using errcode = 'P0001';
    end if;

    if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
      raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
    end if;

    insert into public.assignments (job_id, contractor_id, worker_id, source, source_id, status)
    values (v_job.id, v_job.contractor_id, v_inv.worker_id, 'invitation', v_inv.id, 'active');

    update public.invitations set
      status           = 'accepted',
      responded_at     = now(),
      response_message = v_resp
    where id = p_invitation_id
    returning * into v_inv;

    perform public.notify(
      v_inv.contractor_id, 'invitation_accepted',
      'הזמנתך אושרה',
      coalesce(nullif(btrim(v_wname), ''), 'העובד')
        || ' אישר את ההזמנה למשרה "' || coalesce(v_job.title, '') || '".'
        || case when v_resp is not null then E'\nהודעת העובד: "' || v_resp || '"' else '' end,
      v_job.id::text, 'inv_accepted:' || v_inv.id::text
    );
  else
    update public.invitations set
      status           = 'declined',
      responded_at     = now(),
      response_message = v_resp
    where id = p_invitation_id
    returning * into v_inv;

    perform public.notify(
      v_inv.contractor_id, 'invitation_declined',
      'הזמנתך נדחתה',
      coalesce(nullif(btrim(v_wname), ''), 'העובד')
        || ' דחה את ההזמנה למשרה "' || coalesce(v_job.title, '') || '".'
        || case when v_resp is not null then E'\nהודעת העובד: "' || v_resp || '"' else '' end,
      v_job.id::text, 'inv_declined:' || v_inv.id::text
    );
  end if;

  return v_inv;
end;
$$;
revoke execute on function public.respond_to_invitation(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_invitation(uuid, boolean, text) to authenticated;

-- =============================================================================
-- 030 · cancel_invitation  (+ invitation_cancelled  — manual)
-- =============================================================================
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_inv    public.invitations;
  v_jtitle text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id using errcode = 'P0002';
  end if;

  if v_inv.contractor_id <> v_uid then
    raise exception 'not your invitation' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'only a pending invitation can be cancelled' using errcode = 'P0001';
  end if;

  update public.invitations set
    status              = 'cancelled',
    cancelled_at        = now(),
    cancellation_reason = 'manual'
  where id = p_invitation_id
  returning * into v_inv;

  select title into v_jtitle from public.jobs where id = v_inv.job_id;
  perform public.notify(
    v_inv.worker_id, 'invitation_cancelled',
    'הזמנה בוטלה',
    'ההזמנה למשרה "' || coalesce(v_jtitle, '') || '" בוטלה על ידי הקבלן.',
    v_inv.job_id::text, 'inv_cancelled_manual:' || v_inv.id::text
  );

  return v_inv;
end;
$$;
revoke execute on function public.cancel_invitation(uuid) from public, anon;
grant  execute on function public.cancel_invitation(uuid) to authenticated;

-- =============================================================================
-- 031 · cancel_assignment  (+ assignment_cancelled  — to the OTHER party)
-- =============================================================================
create or replace function public.cancel_assignment(
  p_assignment_id uuid,
  p_message       text
)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_asg    public.assignments;
  v_job    public.jobs;
  v_actor  public.assignment_actor;
  v_status public.assignment_status;
  v_msg    text := nullif(btrim(coalesce(p_message, '')), '');
  v_wname  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_asg from public.assignments where id = p_assignment_id;
  if v_asg.id is null then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs where id = v_asg.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_uid = v_asg.worker_id then
    v_actor := 'worker';
  elsif v_uid = v_job.contractor_id then
    if not exists (
      select 1 from public.contractor_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where cp.profile_id = v_uid and p.status = 'approved'
    ) then
      raise exception 'not an approved contractor' using errcode = '42501';
    end if;
    v_actor := 'contractor';
  else
    raise exception 'not authorized for this assignment' using errcode = '42501';
  end if;

  select status into v_status from public.assignments where id = p_assignment_id;
  if v_status <> 'active' then
    raise exception 'assignment is % and cannot be cancelled', v_status
      using errcode = 'P0001';
  end if;

  update public.assignments set
    status               = 'cancelled',
    cancelled_at         = now(),
    cancelled_by         = v_actor,
    cancellation_message = v_msg
  where id = p_assignment_id and status = 'active'
  returning * into v_asg;

  if v_asg.id is null then
    raise exception 'assignment is no longer active' using errcode = 'P0001';
  end if;

  if v_actor = 'contractor' then
    perform public.notify(
      v_asg.worker_id, 'assignment_cancelled',
      'השיבוץ שלך בוטל',
      'השיבוץ שלך למשרה "' || coalesce(v_job.title, '') || '" בוטל על ידי הקבלן.'
        || case when v_msg is not null then E'\nהודעת הקבלן: "' || v_msg || '"' else '' end,
      v_job.id::text, 'asg_cancelled:' || v_asg.id::text
    );
  else
    select full_name into v_wname from public.profiles where id = v_asg.worker_id;
    perform public.notify(
      v_job.contractor_id, 'assignment_cancelled',
      'עובד ויתר על השיבוץ',
      coalesce(nullif(btrim(v_wname), ''), 'עובד')
        || ' ויתר/ה על השיבוץ למשרה "' || coalesce(v_job.title, '') || '".'
        || case when v_msg is not null then E'\nהודעת העובד: "' || v_msg || '"' else '' end,
      v_job.id::text, 'asg_cancelled:' || v_asg.id::text
    );
  end if;

  return v_asg;
end;
$$;
revoke execute on function public.cancel_assignment(uuid, text) from public, anon;
grant  execute on function public.cancel_assignment(uuid, text) to authenticated;

-- =============================================================================
-- 031 · complete_assignment  (+ assignment_completed  — to the worker)
-- =============================================================================
create or replace function public.complete_assignment(p_assignment_id uuid)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_asg    public.assignments;
  v_job    public.jobs;
  v_status public.assignment_status;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_asg from public.assignments where id = p_assignment_id;
  if v_asg.id is null then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs where id = v_asg.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_job.contractor_id then
    raise exception 'not authorized for this assignment' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  select status into v_status from public.assignments where id = p_assignment_id;
  if v_status <> 'active' then
    raise exception 'assignment is % and cannot be completed', v_status
      using errcode = 'P0001';
  end if;

  update public.assignments set
    status       = 'completed',
    completed_at = now()
  where id = p_assignment_id and status = 'active'
  returning * into v_asg;

  if v_asg.id is null then
    raise exception 'assignment is no longer active' using errcode = 'P0001';
  end if;

  perform public.notify(
    v_asg.worker_id, 'assignment_completed',
    'העבודה שלך במשרה הסתיימה',
    'הקבלן סימן שסיימת את עבודתך במשרה "' || coalesce(v_job.title, '')
      || '". השיבוץ נשמר בהיסטוריית העבודות שלך.',
    v_job.id::text, 'asg_completed:' || v_asg.id::text
  );

  return v_asg;
end;
$$;
revoke execute on function public.complete_assignment(uuid) from public, anon;
grant  execute on function public.complete_assignment(uuid) to authenticated;

-- =============================================================================
-- 009 · assignments_reconcile  — preserve capacity-full auto-cancel + notify,
--        add a dedupe_key so a re-fire can never duplicate the row.
-- =============================================================================
create or replace function public.assignments_reconcile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  inv   record;
begin
  select * into v_job from public.jobs where id = coalesce(new.job_id, old.job_id);
  if v_job.id is null then
    return coalesce(new, old);
  end if;

  if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
    for inv in
      select * from public.invitations
      where job_id = v_job.id and status = 'pending'
    loop
      update public.invitations
        set status              = 'cancelled',
            cancelled_at        = now(),
            cancellation_reason = 'capacity_full'
        where id = inv.id;

      perform public.notify(
        inv.worker_id,
        'invitation_cancelled',
        'ההזמנה למשרה נסגרה',
        'המשרה "' || coalesce(v_job.title, '') || '" אוישה במלואה ולכן ההזמנה אינה פעילה עוד.',
        inv.id::text,
        'inv_cancelled_full:' || inv.id::text
      );
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;
