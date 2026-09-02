-- =============================================================================
-- 046 · blocked-user lifecycle hardening
-- =============================================================================
-- PRODUCT PRINCIPLE (unchanged): blocking a worker/contractor is an ACCOUNT
-- STATUS change, never data deletion. Every historical row — jobs, applications,
-- invitations, assignments, messages, favorites, notifications — is left
-- EXACTLY as it is. This migration ONLY adds "is the relevant account still
-- approved?" guards to the paths that would otherwise let a blocked user (or a
-- job whose owner is blocked) re-enter NEW marketplace discovery / create a NEW
-- assignment.
--
-- The Final Backend Audit's Blocked-User Lifecycle pass found these server-side
-- holes (UI already hid most of them, but UI hiding is not sufficient):
--   • job_registration_state.open_for_applications ignored the owning
--     contractor's status  -> a blocked contractor's open job kept showing as a
--     normal available/applicable marketplace opportunity (Available Jobs,
--     Nearby Jobs, JobDetails apply button, Smart Match job picker).
--   • can_worker_apply() ignored the owning contractor's status  -> the
--     applications_insert RLS policy + reapply_to_job (028) +
--     reapply_after_cancellation (034) all let a worker file a NEW application
--     against a blocked contractor's job.
--   • respond_to_application() (035) did not re-check the APPLICANT worker's
--     live status  -> a contractor could ACCEPT an application from a worker who
--     was blocked after applying, creating a NEW active assignment.
--   • respond_to_invitation() (030) did not re-check the JOB OWNER contractor's
--     live status  -> a worker could ACCEPT a pending invitation from a
--     contractor who was blocked after sending it, creating a NEW assignment.
--   • can_view_profile()'s "available worker" DISCOVERY branch (038) ignored the
--     target's status  -> a blocked worker who still has is_available = true
--     stayed readable/discoverable to every contractor (block does not touch
--     is_available).
--   • send_message() (038) only checked the SENDER's status  -> messaging a
--     blocked counterpart continued as normal.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   • no row is deleted, cancelled, completed, or otherwise mutated;
--   • no automatic assignment cancellation — a blocked worker's active
--     assignment KEEPS its slot occupied (occupied_slot_count counts it); the
--     contractor may still use the existing cancel_assignment (031) lifecycle
--     action if they choose;
--   • no RLS policy is created or dropped (only helper functions / one view /
--     three RPCs are recreated, signatures unchanged);
--   • no schema change.
--
-- REVERSIBILITY: every guard reads LIVE public.profiles.status. admin_unblock_user
-- (020) sets status back to 'approved' and normal eligibility returns with no
-- stored flag to reset — exactly as the audit brief requires.
--
-- Forward-only. Objects recreated:
--   1. public.job_owner_is_active(uuid)                  NEW SECURITY DEFINER helper
--   2. public.job_registration_state  VIEW               + owner-active in open_for_applications
--   3. public.can_worker_apply(uuid, uuid)               + owner-active (from 028)
--   4. public.can_view_profile(uuid)                     + target-approved on the
--                                                          "available worker" branch only (from 038)
--   5. public.respond_to_application(uuid,boolean,text)  + applicant approved before assignment (from 035)
--   6. public.respond_to_invitation(uuid,boolean,text)   + job owner approved before assignment (from 030)
--   7. public.send_message(uuid, text)                   + other participant approved (from 038)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. job_owner_is_active — "is the contractor that owns this job still
--    approved?" SECURITY DEFINER so it can read profiles.status regardless of
--    the caller's RLS view (a worker browsing an open job cannot SELECT the
--    owner's profiles row). Same pattern as occupied_slot_count used by the
--    job_registration_state view.
-- ---------------------------------------------------------------------------
create or replace function public.job_owner_is_active(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    join public.profiles p on p.id = j.contractor_id
    where j.id = p_job_id and p.status = 'approved'
  )
$$;
revoke execute on function public.job_owner_is_active(uuid) from public, anon;
grant  execute on function public.job_owner_is_active(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. job_registration_state — marketplace eligibility now derives from JOB
--    STATE *and* OWNER ACCOUNT STATE. Column list / order unchanged (CREATE OR
--    REPLACE VIEW compatible). closure_reason is deliberately NOT extended for
--    the owner-blocked case: open_for_applications = false is enough for the
--    existing "סגורה להרשמה" UI and it never leaks WHY the owner is inactive.
-- ---------------------------------------------------------------------------
create or replace view public.job_registration_state
with (security_invoker = true) as
select
  j.id                                          as job_id,
  j.workers_needed,
  j.closed_manually,
  j.recruitment_cycle,
  c.filled_count,
  greatest(j.workers_needed - c.filled_count, 0) as remaining_slots,
  (c.filled_count >= j.workers_needed)           as is_full,
  (
    j.status = 'open'
    and not j.closed_manually
    and c.filled_count < j.workers_needed
    and public.job_owner_is_active(j.id)
  )                                             as open_for_applications,
  case
    when j.closed_manually                     then 'manual'::public.job_closure_reason
    when c.filled_count >= j.workers_needed     then 'capacity'::public.job_closure_reason
    else null
  end                                          as closure_reason
from public.jobs j
cross join lateral (select public.occupied_slot_count(j.id) as filled_count) c;

grant select on public.job_registration_state to authenticated;


-- ---------------------------------------------------------------------------
-- 3. can_worker_apply — from 028, plus "owning contractor still approved".
--    Gates the applications_insert RLS policy (008) and the reapply_to_job (028)
--    / reapply_after_cancellation (034) RPCs, so a worker cannot file OR
--    reactivate an application against a blocked contractor's job.
-- ---------------------------------------------------------------------------
create or replace function public.can_worker_apply(p_job_id uuid, p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- a caller may only ask this about themselves
    p_worker_id = (select auth.uid())
    and exists (
      select 1
      from public.jobs j
      join public.profiles op on op.id = j.contractor_id
      where j.id = p_job_id
        and j.status = 'open'
        and j.closed_manually = false
        and op.status = 'approved'          -- NEW: owning contractor still active
    )
    and not public.is_job_fully_staffed(p_job_id)
    -- decision #9: in the current cycle a pending / accepted / rejected row
    -- blocks a new application; a WITHDRAWN row does not (it is reactivated
    -- in place by reapply_to_job, never duplicated).
    and not exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.job_id = p_job_id
        and a.worker_id = p_worker_id
        and a.recruitment_cycle = j.recruitment_cycle
        and a.status in ('pending', 'accepted', 'rejected')
    )
$$;
-- (grants unchanged: 012 granted execute to authenticated)


-- ---------------------------------------------------------------------------
-- 4. can_view_profile — from 038. Every legitimate-RELATIONSHIP branch (self,
--    admin, shared application / invitation / assignment, shared conversation)
--    is preserved VERBATIM so an existing counterpart can still resolve a
--    now-blocked user's identity for the "חשבון חסום" badge. ONLY the pure
--    DISCOVERY branch — "a contractor may see any is_available worker" — now
--    also requires that worker to be approved, so a blocked worker is no longer
--    broadly discoverable at the data layer (not just hidden in the UI).
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
      join public.profiles tp        on tp.id         = p_target
      where me.id = (select auth.uid())
        and me.role = 'contractor'
        and wp.is_available = true
        and tp.status = 'approved'          -- NEW: blocked worker not discoverable
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
-- (grants unchanged: 012 granted execute to authenticated)


-- ---------------------------------------------------------------------------
-- 5. respond_to_application — from 035, byte-for-byte, PLUS one guard on the
--    ACCEPT branch: the applicant's live account must still be approved before
--    a NEW assignment is created. REJECT is unchanged and always available
--    (a blocked applicant can still be rejected — history is preserved either
--    way). Dedupe keys, job-row lock, capacity check, notifications: unchanged.
-- ---------------------------------------------------------------------------
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
    -- NEW (046): never place a worker whose live account is no longer active.
    if not exists (
      select 1 from public.profiles
      where id = v_app.worker_id and status = 'approved'
    ) then
      raise exception 'applicant account is not active' using errcode = 'P0001';
    end if;

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
      v_job.id::text,
      'app_accepted:' || v_app.id::text || ':' || extract(epoch from v_app.applied_at)::text
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
      v_job.id::text,
      'app_rejected:' || v_app.id::text || ':' || extract(epoch from v_app.applied_at)::text
    );
  end if;

  return v_app;
end;
$$;
revoke execute on function public.respond_to_application(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_application(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. respond_to_invitation — from 030, byte-for-byte, PLUS one guard on the
--    ACCEPT branch: the job owner's live account must still be approved before
--    a NEW assignment is created. DECLINE is unchanged and always available.
--    A blocked WORKER already cannot reach accept/decline here (the existing
--    "not an approved worker" check on the caller). Cancel (contractor) is
--    unchanged in cancel_invitation (030).
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
  v_uid  uuid := (select auth.uid());
  v_inv  public.invitations;
  v_job  public.jobs;
  v_resp text := nullif(btrim(coalesce(p_response_message, '')), '');
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

  if p_accept then
    if v_job.status <> 'open' then
      raise exception 'job % is not open for staffing', v_job.id using errcode = 'P0001';
    end if;

    -- NEW (046): never create an assignment on a job whose owning contractor's
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
  else
    update public.invitations set
      status           = 'declined',
      responded_at     = now(),
      response_message = v_resp
    where id = p_invitation_id
    returning * into v_inv;
  end if;

  return v_inv;
end;
$$;
revoke execute on function public.respond_to_invitation(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_invitation(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. send_message — from 038, byte-for-byte, PLUS one guard: the OTHER
--    participant's live account must still be approved. Historical messages
--    stay readable (messages_select is participant-only, unchanged); only NEW
--    sends into a thread with a blocked counterpart are refused. Same signature,
--    same return type, same happy path — the client already surfaces a send
--    failure. Participant RLS is untouched.
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

  -- NEW (046): the conversation counterpart must still be active. Blocking is
  -- not data deletion — the thread stays readable — but new messaging with a
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

  return v_msg;
end;
$$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant  execute on function public.send_message(uuid, text) to authenticated;
