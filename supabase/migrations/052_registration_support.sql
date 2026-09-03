-- =============================================================================
-- 052 · rejected-registration support island
-- =============================================================================
-- A password-verified user whose registration was REJECTED has an auth.users
-- row but NO public.profiles / public.user_identity row, so the normal Support
-- backend (support_tickets.user_id -> profiles) cannot serve them.
--
-- This migration adds a SEPARATE, self-contained support island that never
-- touches public.support_tickets / public.support_ticket_messages, their RLS,
-- or their RPCs — the blocked-user support flow is provably unaffected.
--
-- Authorization is derived SERVER-SIDE only, on:
--     registrations.auth_user_id = auth.uid()  AND  registrations.status = 'rejected'
-- The client never supplies a registration id.
--
-- Admin access reuses the already-hardened public.is_approved_admin() (043).
-- Notifications reuse the existing 'new_support_ticket' / 'support_response'
-- notification types (already wired in the app + Realtime); admins have real
-- profiles so public.notify() works normally. A rejected requester has no
-- notifications inbox, so admin replies raise NO owner notification.
--
-- Forward-only. 001/007/008/042/043 untouched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- helper: does the caller own this registration AND is it rejected?
-- SECURITY DEFINER so the RLS policies below don't need direct SELECT on
-- registrations; it only ever reads rows keyed to the caller's own auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.owns_rejected_registration(p_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registrations r
    where r.id = p_registration_id
      and r.auth_user_id = (select auth.uid())
      and r.status = 'rejected'
  )
$$;
revoke execute on function public.owns_rejected_registration(uuid) from public, anon;
grant  execute on function public.owns_rejected_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A. tables
-- ---------------------------------------------------------------------------
create table public.registration_support_tickets (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null references public.registrations(id) on delete cascade,
  type              public.support_ticket_type   not null,
  subject           text   not null,
  description       text   not null,
  status            public.support_ticket_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id),
  resolved_at       timestamptz,
  is_closed         boolean not null default false,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index registration_support_tickets_reg_idx
  on public.registration_support_tickets (registration_id, created_at desc);
create index registration_support_tickets_status_idx
  on public.registration_support_tickets (status);

create trigger registration_support_tickets_set_updated_at
  before update on public.registration_support_tickets
  for each row execute function public.set_updated_at();

create table public.registration_support_ticket_messages (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.registration_support_tickets(id) on delete cascade,
  sender_is_admin boolean not null,
  sender_id       uuid references public.profiles(id),   -- null for the applicant, set for an admin
  message         text not null,
  status_change   public.support_ticket_status,
  created_at      timestamptz not null default now()
);
create index registration_support_ticket_messages_ticket_idx
  on public.registration_support_ticket_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- B. lockdown — SELECT-only client surface; all writes via the RPCs (C-E).
-- ---------------------------------------------------------------------------
alter table public.registration_support_tickets         enable row level security;
alter table public.registration_support_ticket_messages enable row level security;

revoke all    on public.registration_support_tickets         from anon;
revoke all    on public.registration_support_ticket_messages from anon;
revoke insert, update, delete on public.registration_support_tickets         from authenticated;
revoke insert, update, delete on public.registration_support_ticket_messages from authenticated;

create policy registration_support_tickets_select on public.registration_support_tickets
  for select to authenticated
  using (
    public.is_approved_admin()
    or public.owns_rejected_registration(registration_id)
  );

create policy registration_support_ticket_messages_select on public.registration_support_ticket_messages
  for select to authenticated
  using (
    public.is_approved_admin()
    or exists (
      select 1 from public.registration_support_tickets t
      where t.id = ticket_id
        and public.owns_rejected_registration(t.registration_id)
    )
  );

-- ---------------------------------------------------------------------------
-- C. create_registration_support_ticket — the rejected registrant opens a
--    ticket for THEMSELVES. registration_id is derived from auth.uid(); there
--    is NO client-supplied id. Same text limits as 042 §B.
-- ---------------------------------------------------------------------------
create or replace function public.create_registration_support_ticket(
  p_type        public.support_ticket_type,
  p_subject     text,
  p_description text
)
returns public.registration_support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_reg_id  uuid;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_ticket  public.registration_support_tickets;
  v_admin   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select r.id into v_reg_id
  from public.registrations r
  where r.auth_user_id = v_uid
    and r.status = 'rejected'
  order by r.created_at desc
  limit 1;

  if v_reg_id is null then
    raise exception 'no rejected registration for caller' using errcode = '42501';
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

  insert into public.registration_support_tickets (registration_id, type, subject, description, status)
  values (v_reg_id, p_type, v_subject, v_desc, 'open')
  returning * into v_ticket;

  for v_admin in
    select id from public.profiles where role = 'admin' and status = 'approved'
  loop
    perform public.notify(
      v_admin,
      'new_support_ticket',
      'פנייה חדשה לתמיכה — רישום שנדחה',
      v_subject || ' — פנייה מהרשמה שנדחתה',
      v_ticket.id::text,
      'regsupport_new:' || v_ticket.id::text || ':' || v_admin::text
    );
  end loop;

  return v_ticket;
end;
$$;
revoke execute on function public.create_registration_support_ticket(public.support_ticket_type, text, text) from public, anon;
grant  execute on function public.create_registration_support_ticket(public.support_ticket_type, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- D. reply_to_registration_support_ticket — one message onto the thread.
--    Owner rejected registrant OR approved admin. sender_is_admin is forced
--    from is_approved_admin() (a requester can never spoof admin). p_status is
--    honoured for an admin only. A closed ticket rejects every reply.
--    Admin reply -> NO owner notification (rejected requester has no inbox).
--    Requester reply -> notify approved admins.
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_registration_support_ticket(
  p_ticket_id uuid,
  p_message   text,
  p_status    public.support_ticket_status default null
)
returns public.registration_support_ticket_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_is_admin boolean := public.is_approved_admin();
  v_ticket   public.registration_support_tickets;
  v_msg      text := btrim(coalesce(p_message, ''));
  v_apply    public.support_ticket_status := null;
  v_new_msg  public.registration_support_ticket_messages;
  v_admin    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_ticket from public.registration_support_tickets where id = p_ticket_id;
  if v_ticket.id is null then
    raise exception 'registration support ticket not found' using errcode = 'P0001';
  end if;

  if not (v_is_admin or public.owns_rejected_registration(v_ticket.registration_id)) then
    raise exception 'not allowed for this ticket' using errcode = '42501';
  end if;

  if v_ticket.is_closed then
    raise exception 'registration support ticket is closed' using errcode = 'P0001';
  end if;

  if v_msg = '' then
    raise exception 'message is required' using errcode = 'P0001';
  end if;
  if char_length(v_msg) > 5000 then
    raise exception 'message too long' using errcode = 'P0001';
  end if;

  -- status change: admin only, must differ, never 'closed' through this path
  if v_is_admin
     and p_status is not null
     and p_status <> v_ticket.status
     and p_status in ('open', 'in_progress', 'resolved') then
    v_apply := p_status;
  end if;

  insert into public.registration_support_ticket_messages
    (ticket_id, sender_is_admin, sender_id, message, status_change)
  values
    (p_ticket_id, v_is_admin, case when v_is_admin then v_uid else null end, v_msg, v_apply)
  returning * into v_new_msg;

  update public.registration_support_tickets
     set updated_at        = now(),
         assigned_admin_id = case when v_is_admin then v_uid else assigned_admin_id end,
         status            = coalesce(v_apply, status),
         resolved_at       = case when v_apply = 'resolved' then now() else resolved_at end
   where id = p_ticket_id;

  if not v_is_admin then
    for v_admin in
      select id from public.profiles where role = 'admin' and status = 'approved'
    loop
      perform public.notify(
        v_admin,
        'support_response',
        'המשתמש הגיב לפניית תמיכה — רישום שנדחה',
        v_ticket.subject || ' — ' || left(v_msg, 100),
        p_ticket_id::text,
        'regsupport_msg:' || v_new_msg.id::text || ':' || v_admin::text
      );
    end loop;
  end if;
  -- admin reply: the rejected requester has no notifications inbox — nothing to raise.

  return v_new_msg;
end;
$$;
revoke execute on function public.reply_to_registration_support_ticket(uuid, text, public.support_ticket_status) from public, anon;
grant  execute on function public.reply_to_registration_support_ticket(uuid, text, public.support_ticket_status) to authenticated;

-- ---------------------------------------------------------------------------
-- E. set_registration_support_ticket_closed — approved-admin only, idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.set_registration_support_ticket_closed(
  p_ticket_id uuid,
  p_closed    boolean
)
returns public.registration_support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_ticket public.registration_support_tickets;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_approved_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_closed is null then
    raise exception 'p_closed is required' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.registration_support_tickets where id = p_ticket_id;
  if v_ticket.id is null then
    raise exception 'registration support ticket not found' using errcode = 'P0001';
  end if;

  if p_closed and not v_ticket.is_closed then
    update public.registration_support_tickets
       set is_closed  = true,
           closed_at  = now(),
           closed_by  = v_uid,
           updated_at = now()
     where id = p_ticket_id
     returning * into v_ticket;
  elsif (not p_closed) and v_ticket.is_closed then
    update public.registration_support_tickets
       set is_closed  = false,
           closed_at  = null,
           closed_by  = null,
           updated_at = now()
     where id = p_ticket_id
     returning * into v_ticket;
  end if;
  -- already in the requested state -> no write

  return v_ticket;
end;
$$;
revoke execute on function public.set_registration_support_ticket_closed(uuid, boolean) from public, anon;
grant  execute on function public.set_registration_support_ticket_closed(uuid, boolean) to authenticated;
