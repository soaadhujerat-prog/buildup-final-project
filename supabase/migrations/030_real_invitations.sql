-- =============================================================================
-- 030 · real invitations (Phase 5C-1) — send / accept / decline / cancel
--       + atomic assignment creation on accept
-- =============================================================================
-- Mirrors the Phase 5A/5B pattern for applications: the client keeps ONLY a
-- SELECT surface on `invitations`; every mutation goes through a narrow
-- SECURITY DEFINER RPC. `assignments` stays SELECT-only (008), so an
-- invitation-sourced assignment can be created ONLY by respond_to_invitation
-- here — exactly as respond_to_application (029) is the only path for an
-- application-sourced one.
--
-- HARDENING (confirmed holes in the 5C readiness audit):
--   • invitations_insert let a contractor INSERT arbitrary writable columns
--     (status / responded_at / response_message / cancelled_*).
--   • invitations_update let worker / contractor / admin run a generic UPDATE
--     with no column or transition constraint (forge status='accepted', forge
--     response fields) — the same class of hole 026/027 closed for applications.
--   Both policies are dropped and INSERT/UPDATE/DELETE are revoked from
--   `authenticated` (defense in depth on top of the absent policies), matching
--   what 008 already does for `assignments`. invitations_select is UNCHANGED.
--
-- SCOPE (explicitly deferred — do NOT add here):
--   • no recruitment_cycle column / semantics on invitations (Phase 5C-3)
--   • no new notification architecture — the ONLY staffing notification that
--     fires is the existing assignments_reconcile (009) capacity-full auto-
--     cancel of other pending invitations, which keeps working untouched
--   • no assignment lifecycle beyond creation (complete / cancel — Phase 5C-2)
--
-- SOURCE OF TRUTH — unchanged. Nothing here writes jobs.workers_needed /
-- jobs.status / jobs.closed_manually / jobs.recruitment_cycle or any derived
-- field. job_registration_state re-derives full / open / closure_reason from
-- the new assignment. A pending / declined / cancelled invitation consumes NO
-- slot (occupied_slot_count counts assignments only).
--
-- Security model = 022 / 025 / 029: SECURITY DEFINER, search_path '',
-- EXECUTE granted to `authenticated` only (revoked from public / anon).
-- auth.uid() is read live from the request JWT. No service_role, no Edge
-- Function. Forward-only — migrations 001–029 are left intact.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. remove the direct-client mutation surface on `invitations`
-- ---------------------------------------------------------------------------
drop policy if exists invitations_insert on public.invitations;
drop policy if exists invitations_update on public.invitations;

-- (intentionally no replacement policies — invitation mutation goes through the
--  SECURITY DEFINER RPCs below only. invitations_select stays as defined in 008.)
revoke insert, update, delete on public.invitations from authenticated;

-- ---------------------------------------------------------------------------
-- B. send_invitation — approved owning contractor invites an approved worker
--    to one of their own jobs. Server sets contractor_id (auth.uid()),
--    worker_id (validated), job_id (validated), status='pending' and all
--    timestamps. The client supplies only job_id + worker_id + message.
--    A pending invitation does NOT consume a slot.
-- ---------------------------------------------------------------------------
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
  v_uid uuid := (select auth.uid());
  v_job public.jobs;
  v_inv public.invitations;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- lock the job row for the whole send: the capacity check + the INSERT are
  -- serialized against concurrent accepts on the same job (Phase 5B pattern).
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

  -- target must be an approved worker
  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = p_worker_id
      and p.role = 'worker'
      and p.status = 'approved'
  ) then
    raise exception 'target is not an approved worker' using errcode = 'P0001';
  end if;

  -- job must still be open / eligible for staffing
  if v_job.status <> 'open' then
    raise exception 'job % is not open for staffing', p_job_id using errcode = 'P0001';
  end if;
  if v_job.closed_manually then
    raise exception 'job % is closed to registration', p_job_id using errcode = 'P0001';
  end if;

  -- job must not already be capacity-full
  if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
    raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
  end if;

  -- the existing one-live rule: at most one pending / accepted invitation per
  -- (job, worker). The invitations_one_live partial unique index is the
  -- last-resort guard; this pre-check gives a clean typed error.
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

  return v_inv;
end;
$$;
revoke execute on function public.send_invitation(uuid, uuid, text) from public, anon;
grant  execute on function public.send_invitation(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- C. respond_to_invitation — the invited worker accepts or declines.
--    ACCEPT is one atomic transaction: job-row lock -> capacity re-check ->
--    INSERT exactly one 'active' assignment (source='invitation') -> flip the
--    invitation pending -> accepted. If the assignment INSERT fails (capacity
--    guard / one-active unique index), the whole function aborts and the
--    invitation stays pending. DECLINE creates no assignment, capacity
--    untouched. responded_at is server time; response_message is the trimmed
--    input (or null). job_id / worker_id / contractor_id / status can never be
--    forged — they are read from the locked rows.
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
-- D. cancel_invitation — the owning approved contractor withdraws their own
--    STILL-PENDING invitation. pending -> cancelled, reason 'manual',
--    cancelled_at server time. No assignment, capacity untouched. A worker
--    cannot reach this (contractor_id check); an accepted / declined /
--    already-cancelled invitation is refused.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitations;
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

  return v_inv;
end;
$$;
revoke execute on function public.cancel_invitation(uuid) from public, anon;
grant  execute on function public.cancel_invitation(uuid) to authenticated;
