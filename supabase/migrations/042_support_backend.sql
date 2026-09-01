-- =============================================================================
-- 042 · real Support backend (tickets + conversation thread)
-- =============================================================================
-- The support tables already exist (007): public.support_tickets and
-- public.support_ticket_messages (append-only thread). RLS (008) already gives a
-- correct SELECT surface — a ticket and its messages are visible to the ticket
-- owner OR public.is_admin() — and that is left untouched.
--
-- The WRITE surface was loose:
--   • support_tickets_insert let the client pick status / user_role /
--     assigned_admin_id (only user_id + role were checked).
--   • support_ticket_messages_insert checked sender_id + ticket ownership but
--     NOT that sender_role matches the caller's real role, and did not stop a
--     requester from stamping status_change — a regular user could post a
--     message that renders as an admin reply and/or a status-change badge.
--   • support_tickets UPDATE was is_admin() via RLS with the client choosing
--     every column (assigned_admin_id, resolved_at, is_closed, closed_by, …).
--
-- Approach mirrors 038 / 040 (chat): lock the tables to a SELECT-only client
-- surface and route every write through a narrow SECURITY DEFINER RPC that
-- derives the caller from auth.uid(), forces the trusted columns server-side,
-- validates + trims text, and (in the SAME transaction) raises exactly one
-- idempotent notification via public.notify (032).
--
-- Notifications reuse the existing 'new_support_ticket' and 'support_response'
-- notification_type values (001) — already mapped by the frontend
-- (NotificationsScreen + navigateFromNotification → SupportTicketDetails) and
-- already delivered live by the generic notifications Realtime channel (041).
-- Neither value is in notify-email's EMAIL_TYPES allowlist → NO transactional
-- email (this migration does not touch the Edge Function). No schema change.
-- Forward-only; 007 / 008 untouched except the write lockdown in section A.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. direct-write lockdown — support_tickets / support_ticket_messages are
--    written ONLY by the RPCs in sections B-D (SECURITY DEFINER runs as owner,
--    so the RPCs are unaffected). The SELECT policies from 008
--    (support_tickets_select / support_ticket_messages_select: own OR is_admin)
--    are deliberately left in place.
-- ---------------------------------------------------------------------------
drop policy if exists support_tickets_insert        on public.support_tickets;
drop policy if exists support_tickets_update_admin  on public.support_tickets;
drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;

revoke insert, update, delete on public.support_tickets         from authenticated;
revoke insert, update, delete on public.support_ticket_messages from authenticated;

-- ---------------------------------------------------------------------------
-- B. create_support_ticket — a worker / contractor opens a ticket for THEMSELVES
--    user_id, user_role, status and timestamps are all server-authoritative.
--    Reachable by a blocked user too (parity with the old policy: the support
--    channel is a role check, never a status check — the BlockedAccount screen
--    depends on it).
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
  v_subject text := btrim(coalesce(p_subject, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_ticket  public.support_tickets;
  v_admin   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select role into v_urole from public.profiles where id = v_uid;
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
    v_urole::text::public.registration_role,   -- 'worker' | 'contractor'
    p_type,
    v_subject,
    v_desc,
    'open'
  )
  returning * into v_ticket;

  -- One notification per (admin, ticket) — idempotent on the dedupe key.
  for v_admin in
    select id from public.profiles where role = 'admin' and status = 'approved'
  loop
    perform public.notify(
      v_admin,
      'new_support_ticket',
      'פנייה חדשה לתמיכה',
      v_subject || ' — ' || case when v_urole = 'worker' then 'עובד' else 'קבלן' end,
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
-- C. reply_to_support_ticket — append ONE message to a ticket's thread.
--    Callable by the ticket owner OR an admin. sender_role is forced from the
--    caller's real identity (a requester can never post as 'admin'). p_status
--    is honoured ONLY for an admin and only as a real move to
--    open / in_progress / resolved (closing is a separate lifecycle action, D).
--    A closed ticket rejects every reply.
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
  v_is_admin    boolean := public.is_admin();
  v_urole       public.user_role;
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
    select role into v_urole from public.profiles where id = v_uid;
    v_sender_role := v_urole::text::public.support_sender_role;  -- 'worker' | 'contractor'
  end if;

  -- status change: admin only, must differ, never 'closed' through this path
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

  -- exactly one notification, keyed on the new message id (idempotent)
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
        'המשתמש הגיב לפניית תמיכה',
        v_ticket.subject || ' — ' || left(v_msg, 100),
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

-- ---------------------------------------------------------------------------
-- D. set_support_ticket_closed — admin-only conversation lifecycle. Separate
--    from `status` (a "resolved" ticket stays "resolved"). Idempotent: a call
--    that does not change is_closed is a no-op and raises NO notification.
-- ---------------------------------------------------------------------------
create or replace function public.set_support_ticket_closed(
  p_ticket_id uuid,
  p_closed    boolean
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_ticket public.support_tickets;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_closed is null then
    raise exception 'p_closed is required' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if v_ticket.id is null then
    raise exception 'support ticket not found' using errcode = 'P0001';
  end if;

  if p_closed and not v_ticket.is_closed then
    update public.support_tickets
       set is_closed  = true,
           closed_at  = now(),
           closed_by  = v_uid,
           updated_at = now()
     where id = p_ticket_id
     returning * into v_ticket;

    perform public.notify(
      v_ticket.user_id,
      'support_response',
      'הפנייה שלך נסגרה',
      'הטיפול בפנייה "' || v_ticket.subject || '" הסתיים והיא נסגרה. ניתן לצפות בהיסטוריית השיחה בכל עת.',
      p_ticket_id::text,
      'support_close:' || p_ticket_id::text || ':' || extract(epoch from v_ticket.closed_at)::text
    );

  elsif (not p_closed) and v_ticket.is_closed then
    update public.support_tickets
       set is_closed  = false,
           closed_at  = null,
           closed_by  = null,
           updated_at = now()
     where id = p_ticket_id
     returning * into v_ticket;

    perform public.notify(
      v_ticket.user_id,
      'support_response',
      'הפנייה שלך נפתחה מחדש',
      'הפנייה "' || v_ticket.subject || '" חזרה למצב פתוח וניתן להמשיך את השיחה.',
      p_ticket_id::text,
      'support_reopen:' || p_ticket_id::text || ':' || extract(epoch from v_ticket.updated_at)::text
    );
  end if;
  -- already in the requested state → no write, no notification

  return v_ticket;
end;
$$;
revoke execute on function public.set_support_ticket_closed(uuid, boolean) from public, anon;
grant  execute on function public.set_support_ticket_closed(uuid, boolean) to authenticated;
