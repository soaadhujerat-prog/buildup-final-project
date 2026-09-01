-- =============================================================================
-- 039 · chat realtime + read/unread (Phase 7B)
-- =============================================================================
-- Builds read/unread on top of the EXISTING `conversation_participants.last_read_at`
-- (NOT NULL default now(), seeded at conversation creation by
-- get_or_create_direct_conversation). No new columns.
--
-- Three changes:
--   1. Harden the read-state write path. 008 shipped a GENERIC
--      `conversation_participants_update_self` UPDATE policy (USING/CHECK
--      profile_id = auth.uid()) with no column guard — a client could
--      `UPDATE conversation_participants SET conversation_id = <someone-elses>
--      WHERE profile_id = auth.uid()` and thereby make itself a member of an
--      unrelated conversation (is_conversation_member would then pass → read
--      access). Drop that policy + revoke UPDATE from `authenticated`; read
--      state now moves ONLY through mark_conversation_read().
--   2. mark_conversation_read(p_conversation_id) — SECURITY DEFINER, sets
--      last_read_at = now() on the CALLER'S OWN participant row only.
--   3. list_my_conversations() — SECURITY DEFINER, one round trip returning
--      each of the caller's conversations with the caller's last_read_at, a
--      server-computed unread_count (messages from the OTHER party newer than
--      last_read_at), and the other participant's profile id. Replaces the
--      two-select inbox read in chatService (no N+1 unread queries).
--   4. Add `public.messages` to the `supabase_realtime` publication so the
--      client can subscribe to INSERTs. RLS (messages_select =
--      is_conversation_member) stays the privacy boundary for Realtime — a
--      subscriber only receives rows for conversations it belongs to. RLS is
--      NOT weakened or disabled anywhere.
--
-- NOT in this phase: typing/presence, read receipts, push, chat emails, rows
-- in public.notifications for chat. Forward-only; 038 and earlier untouched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. remove the unguarded direct UPDATE surface on conversation_participants
-- ---------------------------------------------------------------------------
drop policy if exists conversation_participants_update_self on public.conversation_participants;
revoke update on public.conversation_participants from authenticated;
-- (SELECT policy conversation_participants_select is unchanged; INSERT/DELETE
--  were already revoked in 038.)

-- ---------------------------------------------------------------------------
-- 2. mark_conversation_read — caller marks THEIR OWN row read, server time
--    42501  not authenticated / not a participant of this conversation
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and profile_id = v_uid;

  if not found then
    raise exception 'not a participant of this conversation' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant  execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. list_my_conversations — one-shot inbox read for the caller
--    Row per conversation the caller participates in, newest activity first.
--    unread_count = messages in that conversation from the OTHER participant
--    with created_at > the caller's last_read_at.
-- ---------------------------------------------------------------------------
create or replace function public.list_my_conversations()
returns table (
  id                uuid,
  last_message      text,
  last_message_at   timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,
  last_read_at      timestamptz,
  unread_count      integer,
  other_profile_id  uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.last_message,
    c.last_message_at,
    c.created_at,
    c.updated_at,
    me.last_read_at,
    (
      select count(*)::int
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> (select auth.uid())
        and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
    ) as unread_count,
    other.profile_id as other_profile_id
  from public.conversation_participants me
  join public.conversations c
    on c.id = me.conversation_id
  left join public.conversation_participants other
    on other.conversation_id = c.id
   and other.profile_id <> me.profile_id
  where me.profile_id = (select auth.uid())
  order by c.last_message_at desc nulls last, c.created_at desc
$$;
revoke execute on function public.list_my_conversations() from public, anon;
grant  execute on function public.list_my_conversations() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. expose messages INSERTs to Realtime (RLS still enforced per subscriber)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
