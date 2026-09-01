-- =============================================================================
-- 043 · Support admin surface must require a LIVE APPROVED admin
-- =============================================================================
-- Audit finding: public.is_admin() (live def, 012) checks ONLY
--   role = 'admin'
-- with NO status check. A blocked / rejected / pending admin therefore still
-- passes it. Migration 042 gated the whole Support admin surface on
-- public.is_admin() alone, so a de-activated admin could:
--   • SELECT every ticket + message (support_tickets_select /
--     support_ticket_messages_select RLS)
--   • reply as admin / change status  (reply_to_support_ticket)
--   • close / reopen tickets          (set_support_ticket_closed)
--
-- is_admin() is used project-wide, so it is NOT changed here. Instead this
-- migration hardens ONLY the Support surface with a narrow, forward-only fix:
-- a new helper public.is_approved_admin() = role = 'admin' AND status =
-- 'approved', reusing the exact profiles.role / profiles.status semantics of
-- the existing is_admin() / is_active_user() helpers (012). It is SECURITY
-- INVOKER (reads only the caller's own profile row, which self-RLS already
-- exposes), so it adds no privilege surface and no new advisor category.
--
-- Requester self-access is untouched (user_id = auth.uid() branch). A blocked
-- worker / contractor can still open + read + reply to their OWN ticket
-- (BlockedAccount flow) — create_support_ticket stays role-only and is not
-- touched. Forward-only; 042 is not edited.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. helper: live approved admin (role = 'admin' AND status = 'approved')
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'approved'
  )
$$;
revoke execute on function public.is_approved_admin() from public, anon;
grant  execute on function public.is_approved_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- B. SELECT RLS — admin branch now requires an approved admin. The requester
--    self branch (user_id = auth.uid()) is byte-for-byte unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_approved_admin());

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    public.is_approved_admin()
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- C. reply_to_support_ticket — the "acting as admin" flag (admin reply,
--    sender_role='admin', status change, requester-facing notification) now
--    demands an approved admin. A de-activated admin is neither an approved
--    admin nor the ticket owner, so the ownership check raises 42501 before
--    any write. Body is 042's verbatim, with ONLY the v_is_admin source changed.
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
-- D. set_support_ticket_closed — approved-admin only. Body is 042's verbatim,
--    with ONLY the gate changed from public.is_admin() to
--    public.is_approved_admin().
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
  if not public.is_approved_admin() then
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

  return v_ticket;
end;
$$;
revoke execute on function public.set_support_ticket_closed(uuid, boolean) from public, anon;
grant  execute on function public.set_support_ticket_closed(uuid, boolean) to authenticated;
