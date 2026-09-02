-- =============================================================================
-- 047 · restore notification hooks lost when 046 recreated two functions
-- =============================================================================
-- ROOT CAUSE
--   Migration 046 (blocked-user lifecycle hardening) recreated several
--   functions to add "is the relevant account still approved?" guards. Two of
--   them were recreated from an OLDER body and thereby silently dropped
--   notification behaviour that a LATER migration had already added:
--
--     • public.send_message(...)          — 046 rebuilt it from the 038 body,
--       dropping the 'new_message' notification added in migration 040.
--     • public.respond_to_invitation(...) — 046 rebuilt it from the 030 body,
--       dropping the 'invitation_accepted' / 'invitation_declined'
--       notifications added in migration 032.
--
--   (Audited the other four functions 046 recreated — respond_to_application,
--    can_worker_apply, can_view_profile, and the job_registration_state view —
--    against every later migration that existed before 046. Those three
--    functions + the view kept all later behaviour: respond_to_application
--    still carries the 032 notifications with the 035 per-attempt dedupe key;
--    can_worker_apply still has the 014 self-guard + the 028 "withdrawn does
--    not block" relaxation; can_view_profile keeps every 038 branch verbatim.
--    No further regression found — nothing else is touched here.)
--
-- WHAT THIS MIGRATION DOES
--   Recreates ONLY send_message and respond_to_invitation, each as the union of
--   the LATEST intended behaviour from every relevant migration:
--     send_message          = 038 base + 046 blocked-counterpart guard
--                                       + 040 'new_message' notification
--     respond_to_invitation = 030 base + 046 blocked-job-owner guard
--                                       + 032 accept/decline notifications
--
--   Notification contracts are reproduced EXACTLY from 040 / 032:
--     • new_message        → recipient = the single OTHER participant,
--       related_id = conversation_id, dedupe_key = 'chat_message:' || message_id
--     • invitation_accepted / invitation_declined → recipient = contractor,
--       related_id = job_id, dedupe_key = 'inv_accepted:' / 'inv_declined:'
--       || invitation_id
--   public.notify (032) is still the only writer and is still
--   INSERT ... ON CONFLICT (user_id, dedupe_key) DO NOTHING → at most one row
--   per event, sender never notified, no email path touched, Realtime untouched.
--
-- No schema change. No RLS change. No trigger change. No change to invitation
-- or chat business semantics. Forward-only; migration 046 is NOT edited.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- send_message — 046 guards + 040 'new_message' notification
-- ---------------------------------------------------------------------------
create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  -- trim ALL leading/trailing whitespace (space, tab, newline, CR); internal
  -- newlines are preserved. btrim() with no 2nd arg only strips spaces.
  v_body      text := btrim(coalesce(p_body, ''), E' \t\n\r');
  v_msg       public.messages;
  v_others    uuid[];
  v_recipient uuid;
  v_sender    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'message is empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'message too long' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_uid and status = 'approved' and role in ('worker', 'contractor')
  ) then
    raise exception 'sender not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and profile_id = v_uid
  ) then
    raise exception 'not a participant of this conversation' using errcode = '42501';
  end if;

  -- 046: the conversation counterpart must still be active. Blocking is not
  -- data deletion — the thread stays readable — but new messaging with a
  -- blocked account does not continue as normal.
  if exists (
    select 1
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = p_conversation_id
      and cp.profile_id <> v_uid
      and p.status <> 'approved'
  ) then
    raise exception 'the other account is not active' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation_id, v_uid, v_body)
  returning * into v_msg;

  -- 040: in-app notification for the OTHER participant only, in the SAME
  -- transaction as the message INSERT, AFTER every check + the INSERT.
  --   • dedupe_key = 'chat_message:' || message_id → one notification per
  --     (recipient, message), ever; Realtime echo / client retries never touch
  --     the notifications table.
  --   • the sender is never the recipient (profile_id <> auth.uid()).
  --   • 0 or >1 "other" participants → skip the notification, still deliver the
  --     message (fail safe; the product only creates 1:1 direct threads).
  -- Body carries only profiles.full_name — no ID / email / phone / message text.
  -- 'new_message' is NOT in notify-email's allowlist → no transactional email.
  select array_agg(profile_id) into v_others
  from public.conversation_participants
  where conversation_id = p_conversation_id
    and profile_id <> v_uid;

  if v_others is not null and array_length(v_others, 1) = 1 then
    v_recipient := v_others[1];
    select coalesce(nullif(btrim(full_name), ''), 'משתמש')
      into v_sender
    from public.profiles
    where id = v_uid;

    perform public.notify(
      v_recipient,
      'new_message',
      'הודעה חדשה',
      'קיבלת הודעה חדשה מ־' || v_sender,
      p_conversation_id::text,               -- related_id → conversation to open
      'chat_message:' || v_msg.id::text      -- one notification per message, ever
    );
  end if;

  return v_msg;
end;
$$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant  execute on function public.send_message(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- respond_to_invitation — 046 guards + 032 accept/decline notifications
-- ---------------------------------------------------------------------------
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
  v_wname text;   -- 032: worker display name for the contractor notification
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

  -- lock the job row for the whole response: serializes concurrent ACCEPTs
  -- (invitation vs invitation, invitation vs application) on the same job.
  select * into v_job from public.jobs where id = v_inv.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  select full_name into v_wname from public.profiles where id = v_inv.worker_id;

  if p_accept then
    if v_job.status <> 'open' then
      raise exception 'job % is not open for staffing', v_job.id using errcode = 'P0001';
    end if;

    -- 046: never create an assignment on a job whose owning contractor's
    -- live account is no longer active.
    if not exists (
      select 1 from public.profiles
      where id = v_job.contractor_id and status = 'approved'
    ) then
      raise exception 'job owner account is not active' using errcode = 'P0001';
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

    -- 032: exactly one 'invitation_accepted' notification to the contractor,
    -- related_id = job id, dedupe_key = 'inv_accepted:' || invitation id.
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

    -- 032: exactly one 'invitation_declined' notification to the contractor,
    -- related_id = job id, dedupe_key = 'inv_declined:' || invitation id.
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
