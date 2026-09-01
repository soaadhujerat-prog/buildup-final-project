-- =============================================================================
-- 040 · in-app notification for a new chat message (Phase 7C)
-- =============================================================================
-- Reuses the EXISTING notification infrastructure end-to-end — no schema change:
--   • `notification_type` enum already has 'new_message' (001).
--   • `public.notify(user_id, type, title, body, related_id, dedupe_key)` (032)
--     is the idempotent, server-only insert helper
--     (INSERT ... ON CONFLICT (user_id, dedupe_key) DO NOTHING; EXECUTE revoked
--      from public/anon/authenticated — only owner-run SECURITY DEFINER code).
--   • The frontend already maps `new_message` (icon in NotificationsScreen,
--     colour in NotificationItem) and `navigateFromNotification` already routes
--     `new_message` with `related_id = conversation_id` → open that ChatScreen.
--   • `notify-email`'s EMAIL_TYPES allowlist does NOT contain 'new_message', so
--     the notifications-INSERT webhook skips it → NO transactional email. (This
--     migration does not touch the Edge Function or the allowlist.)
--
-- The ONLY change: `send_message` (038) now calls `public.notify(...)` for the
-- OTHER participant, in the SAME transaction as the message INSERT, AFTER every
-- existing authorization check and the INSERT have succeeded. So:
--   • a rejected / rolled-back send writes ZERO notifications (blocked sender,
--     non-participant, empty/too-long body — all unchanged, all abort first);
--   • exactly one notification per successfully inserted message
--     (dedupe_key = 'chat_message:' || message_id → globally unique per
--      (recipient, message); Realtime echo / client retries never touch the
--      notifications table);
--   • the sender is never the recipient (recipient = the participant row whose
--     profile_id <> auth.uid());
--   • if the 1:1 invariant is somehow broken (0 or >1 "other" participants) the
--     notification is skipped and the message is still delivered — we never
--     notify an arbitrary account.
--
-- Body carries only `profiles.full_name` (authoritative display name) — no ID,
-- email, phone, or message text. Every other line of send_message (038) is
-- byte-for-byte unchanged. Forward-only; 038 and 039 untouched.
-- =============================================================================

create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
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

  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation_id, v_uid, v_body)
  returning * into v_msg;

  -- ---- Phase 7C: in-app notification for the OTHER participant only ----
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
  -- 0 or >1 "other" participants → skip the notification, still deliver the
  -- message (fail safe; the current product only creates 1:1 direct threads).

  return v_msg;
end;
$$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant  execute on function public.send_message(uuid, text) to authenticated;
