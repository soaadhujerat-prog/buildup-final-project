-- =============================================================================
-- 038 · chat backend foundation (Phase 7A) — persistence + security, NO realtime
-- =============================================================================
-- The chat tables already exist (006): conversations (with a deterministic
-- `pair_key` + partial-unique index), conversation_participants (PK
-- (conversation_id, profile_id)), messages. RLS was enabled in 008 with
-- participant-scoped SELECT on all three, an UPDATE-own policy on
-- conversation_participants (Phase 7B last_read_at), and a direct
-- `messages_insert` policy.
--
-- Gaps this migration closes (confirmed against the live project):
--   1. No way for a client to CREATE a conversation (no INSERT policy) and no
--      RPC — chat could never start against the real backend.
--   2. `authenticated` still holds table-level INSERT/UPDATE/DELETE grants on
--      conversations + conversation_participants (RLS denies them today, but the
--      grants are loose). Messages could be inserted directly; the sender can't
--      be forged (WITH CHECK sender_id = auth.uid()) but empty / oversized
--      bodies were possible.
--   3. `can_view_profile()` does not treat a shared conversation as a reason to
--      resolve the other party's name/avatar, so the inbox would render blank
--      counterparts for a pure chat pair.
--
-- Approach mirrors 029 / 030 (applications / invitations): the client keeps a
-- SELECT-only surface; every write goes through a narrow SECURITY DEFINER RPC
-- that derives the caller from auth.uid(). Forward-only. No realtime, no
-- unread/read changes, no notifications, no email — all deferred to Phase 7B.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. direct-write lockdown — conversations/participants/messages are written
--    ONLY by the two RPCs below (SECURITY DEFINER runs as owner, so the RPCs
--    are unaffected). SELECT + participant UPDATE (last_read_at) are untouched.
-- ---------------------------------------------------------------------------
drop policy if exists messages_insert on public.messages;

revoke insert          on public.messages                  from authenticated;
revoke insert, update, delete on public.conversations       from authenticated;
revoke insert, delete  on public.conversation_participants  from authenticated;

-- ---------------------------------------------------------------------------
-- B. can_view_profile() — being the other participant of a conversation is a
--    valid reason to see a profile's basic identity (name / avatar). Additive:
--    every existing branch is preserved verbatim; this only widens visibility
--    for people you are actually chatting with.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_profile(p_target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    p_target = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.applications a
      join public.jobs j on j.id = a.job_id
      where (a.worker_id = (select auth.uid()) and j.contractor_id = p_target)
         or (a.worker_id = p_target             and j.contractor_id = (select auth.uid()))
    )
    or exists (
      select 1 from public.invitations i
      where (i.worker_id = (select auth.uid()) and i.contractor_id = p_target)
         or (i.worker_id = p_target             and i.contractor_id = (select auth.uid()))
    )
    or exists (
      select 1 from public.assignments s
      where (s.worker_id = (select auth.uid()) and s.contractor_id = p_target)
         or (s.worker_id = p_target             and s.contractor_id = (select auth.uid()))
    )
    or exists (
      select 1
      from public.profiles me
      join public.worker_profiles wp on wp.profile_id = p_target
      where me.id = (select auth.uid()) and me.role = 'contractor' and wp.is_available = true
    )
    or exists (
      select 1
      from public.conversation_participants me
      join public.conversation_participants them
        on them.conversation_id = me.conversation_id
      where me.profile_id = (select auth.uid())
        and them.profile_id = p_target
    )
$$;

-- ---------------------------------------------------------------------------
-- C. get_or_create_direct_conversation — the ONLY way a 1:1 thread is created.
--    Caller is auth.uid(); target is the single argument. Enforces the BuildUp
--    product rule (worker <-> contractor only, both approved), forbids
--    self-chat, and is race-safe via the pair_key partial-unique index: a
--    concurrent create loses the INSERT and reuses the winner's row. When the
--    row is freshly created it seeds EXACTLY the two participant rows.
--      42501 not-authenticated / not-allowed   ·   P0001 bad request (self /
--      same-role / target not approved)         ·   P0002 target not found
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_direct_conversation(p_other uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_my_role     public.user_role;
  v_my_status   text;
  v_other_role  public.user_role;
  v_other_stat  text;
  v_pair        text;
  v_conv        public.conversations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_other is null then
    raise exception 'no target given' using errcode = 'P0001';
  end if;
  if p_other = v_uid then
    raise exception 'cannot start a conversation with yourself' using errcode = 'P0001';
  end if;

  select role, status into v_my_role, v_my_status
  from public.profiles where id = v_uid;
  if v_my_role is null then
    raise exception 'caller has no profile' using errcode = '42501';
  end if;
  if v_my_status <> 'approved' or v_my_role not in ('worker', 'contractor') then
    raise exception 'caller not allowed to chat' using errcode = '42501';
  end if;

  select role, status into v_other_role, v_other_stat
  from public.profiles where id = p_other;
  if v_other_role is null then
    raise exception 'target % not found', p_other using errcode = 'P0002';
  end if;
  if v_other_stat <> 'approved' or v_other_role not in ('worker', 'contractor') then
    raise exception 'target not available for chat' using errcode = 'P0001';
  end if;

  -- BuildUp product rule: a direct conversation is worker <-> contractor only.
  if v_my_role = v_other_role then
    raise exception 'chat is only between a worker and a contractor' using errcode = 'P0001';
  end if;

  v_pair := least(v_uid::text, p_other::text) || ':' || greatest(v_uid::text, p_other::text);

  -- fast path
  select * into v_conv from public.conversations where pair_key = v_pair;
  if v_conv.id is not null then
    return v_conv;
  end if;

  -- create; a racing caller that already won makes this a no-op
  insert into public.conversations (is_group, pair_key)
  values (false, v_pair)
  on conflict (pair_key) where pair_key is not null do nothing
  returning * into v_conv;

  if v_conv.id is null then
    select * into v_conv from public.conversations where pair_key = v_pair;
    return v_conv;
  end if;

  insert into public.conversation_participants (conversation_id, profile_id)
  values (v_conv.id, v_uid), (v_conv.id, p_other);

  return v_conv;
end;
$$;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant  execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- D. send_message — the ONLY message write path. Server sets sender_id =
--    auth.uid() and created_at; the client supplies conversation_id + body.
--    Body is trimmed; empty is rejected; 4000-char ceiling. Caller must be an
--    approved worker/contractor AND a participant of the conversation.
--    Internal newlines and Hebrew text are preserved exactly (only outer
--    whitespace is stripped). The messages_touch_conversation trigger (009)
--    keeps conversations.last_message* current for inbox ordering.
--      42501 not-authenticated / not-approved / not-a-participant
--      P0001  empty or too-long body
-- ---------------------------------------------------------------------------
create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  -- trim ALL leading/trailing whitespace (space, tab, newline, CR); internal
  -- newlines are preserved. btrim() with no 2nd arg only strips spaces.
  v_body text := btrim(coalesce(p_body, ''), E' \t\n\r');
  v_msg  public.messages;
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

  return v_msg;
end;
$$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant  execute on function public.send_message(uuid, text) to authenticated;
