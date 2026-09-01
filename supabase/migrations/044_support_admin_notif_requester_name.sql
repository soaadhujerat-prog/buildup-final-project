-- =============================================================================
-- 044 · Support notifications TO ADMINS now name the requester (profiles.full_name)
-- =============================================================================
-- UX fix only. The two Support notifications that go REQUESTER -> ADMIN used
-- generic wording:
--   • create_support_ticket (042)        body: '<subject> — עובד|קבלן'
--   • reply_to_support_ticket else-branch title: 'המשתמש הגיב לפניית תמיכה'
--                                        (043)  body:  '<subject> — <msg preview>'
-- Admins could not tell WHO opened / replied at a glance.
--
-- This migration CREATE OR REPLACEs those two functions with ONLY the
-- requester->admin notification text changed, plus one extra column read
-- (profiles.full_name for the authenticated requester, id = auth.uid()):
--   • new ticket:      body  -> 'פנייה חדשה מאת <full_name> — <subject>'
--   • requester reply: title -> 'תגובה חדשה מאת <full_name>'
--                      body  -> '<subject>'   (ticket context; no message body)
--
-- The name is server-derived from auth.uid(); the client never sends it. It is
-- trimmed and falls back to 'משתמש' when empty/missing so the Support
-- transaction never fails on a blank name. No national ID / email / phone /
-- role / auth data in the wording.
--
-- UNCHANGED, byte-for-byte:
--   • every ADMIN -> REQUESTER notification (reply / status / close / reopen)
--   • titles/related_id/dedupe_key of BOTH admin-facing notifications
--     (support_new:<ticket>:<admin> , support_msg:<msgid>:<admin>) — one event
--     still yields exactly one notification per admin
--   • set_support_ticket_closed (not touched)
--   • all validation, ownership, admin-authz, status logic, RLS, Realtime,
--     the notify-email allowlist (still NO support email)
-- Forward-only; 042 / 043 are not edited.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- create_support_ticket — requester -> admin "new ticket" wording
-- ---------------------------------------------------------------------------
create or replace function public.create_support_ticket(
  p_type        public.support_ticket_type,
  p_subject     text,
  p_description text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_urole   public.user_role;
  v_name    text;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_ticket  public.support_tickets;
  v_admin   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select role, coalesce(nullif(btrim(full_name), ''), 'משתמש')
    into v_urole, v_name
  from public.profiles where id = v_uid;
  if v_urole is null or v_urole not in ('worker', 'contractor') then
    raise exception 'only workers and contractors can open support tickets'
      using errcode = '42501';
  end if;

  if p_type is null then
    raise exception 'type is required' using errcode = 'P0001';
  end if;
  if v_subject = '' then
    raise exception 'subject is required' using errcode = 'P0001';
  end if;
  if char_length(v_subject) > 120 then
    raise exception 'subject too long' using errcode = 'P0001';
  end if;
  if char_length(v_desc) < 10 then
    raise exception 'description too short' using errcode = 'P0001';
  end if;
  if char_length(v_desc) > 5000 then
    raise exception 'description too long' using errcode = 'P0001';
  end if;

  insert into public.support_tickets (user_id, user_role, type, subject, description, status)
  values (
    v_uid,
    v_urole::text::public.registration_role,
    p_type,
    v_subject,
    v_desc,
    'open'
  )
  returning * into v_ticket;

  for v_admin in
    select id from public.profiles where role = 'admin' and status = 'approved'
  loop
    perform public.notify(
      v_admin,
      'new_support_ticket',
      'פנייה חדשה לתמיכה',
      'פנייה חדשה מאת ' || v_name || ' — ' || v_subject,
      v_ticket.id::text,
      'support_new:' || v_ticket.id::text || ':' || v_admin::text
    );
  end loop;

  return v_ticket;
end;
$$;
revoke execute on function public.create_support_ticket(public.support_ticket_type, text, text) from public, anon;
grant  execute on function public.create_support_ticket(public.support_ticket_type, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- reply_to_support_ticket — requester -> admin "new reply" wording (else branch
-- only). The admin -> requester branch above it is byte-for-byte unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_support_ticket(
  p_ticket_id uuid,
  p_message   text,
  p_status    public.support_ticket_status default null
)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_is_admin    boolean := public.is_approved_admin();
  v_urole       public.user_role;
  v_name        text;
  v_ticket      public.support_tickets;
  v_msg         text := btrim(coalesce(p_message, ''));
  v_sender_role public.support_sender_role;
  v_apply       public.support_ticket_status := null;
  v_new_msg     public.support_ticket_messages;
  v_admin       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if v_ticket.id is null then
    raise exception 'support ticket not found' using errcode = 'P0001';
  end if;

  if not (v_is_admin or v_ticket.user_id = v_uid) then
    raise exception 'not allowed for this ticket' using errcode = '42501';
  end if;

  if v_ticket.is_closed then
    raise exception 'support ticket is closed' using errcode = 'P0001';
  end if;

  if v_msg = '' then
    raise exception 'message is required' using errcode = 'P0001';
  end if;
  if char_length(v_msg) > 5000 then
    raise exception 'message too long' using errcode = 'P0001';
  end if;

  if v_is_admin then
    v_sender_role := 'admin';
  else
    select role, coalesce(nullif(btrim(full_name), ''), 'משתמש')
      into v_urole, v_name
    from public.profiles where id = v_uid;
    v_sender_role := v_urole::text::public.support_sender_role;
  end if;

  if v_is_admin
     and p_status is not null
     and p_status <> v_ticket.status
     and p_status in ('open', 'in_progress', 'resolved') then
    v_apply := p_status;
  end if;

  insert into public.support_ticket_messages
    (ticket_id, sender_id, sender_role, message, status_change)
  values
    (p_ticket_id, v_uid, v_sender_role, v_msg, v_apply)
  returning * into v_new_msg;

  update public.support_tickets
     set updated_at        = now(),
         assigned_admin_id = case when v_is_admin then v_uid else assigned_admin_id end,
         status            = coalesce(v_apply, status),
         resolved_at       = case when v_apply = 'resolved' then now() else resolved_at end
   where id = p_ticket_id;

  if v_is_admin then
    if v_apply is not null then
      perform public.notify(
        v_ticket.user_id,
        'support_response',
        'סטטוס פניית התמיכה שלך עודכן',
        'הפנייה "' || v_ticket.subject || '" עודכנה. מנהל המערכת כתב: ' || left(v_msg, 140),
        p_ticket_id::text,
        'support_msg:' || v_new_msg.id::text
      );
    else
      perform public.notify(
        v_ticket.user_id,
        'support_response',
        'תגובה חדשה לפנייה שלך',
        left(v_msg, 140),
        p_ticket_id::text,
        'support_msg:' || v_new_msg.id::text
      );
    end if;
  else
    for v_admin in
      select id from public.profiles where role = 'admin' and status = 'approved'
    loop
      perform public.notify(
        v_admin,
        'support_response',
        'תגובה חדשה מאת ' || v_name,
        v_ticket.subject,
        p_ticket_id::text,
        'support_msg:' || v_new_msg.id::text || ':' || v_admin::text
      );
    end loop;
  end if;

  return v_new_msg;
end;
$$;
revoke execute on function public.reply_to_support_ticket(uuid, text, public.support_ticket_status) from public, anon;
grant  execute on function public.reply_to_support_ticket(uuid, text, public.support_ticket_status) to authenticated;
