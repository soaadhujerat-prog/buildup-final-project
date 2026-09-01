-- =============================================================================
-- 031 · assignment lifecycle — cancel / complete (Phase 5C-2)
-- =============================================================================
-- Phase 5B/5C-1 create `active` assignments (respond_to_application 029 /
-- respond_to_invitation 030). This adds the only two post-creation transitions:
--   active -> cancelled   (frees the slot)
--   active -> completed   (KEEPS the slot — occupied_slot_count counts
--                          active + completed, unchanged here)
--
-- The client has NO write on `assignments` (008: SELECT-only policy,
-- INSERT/UPDATE/DELETE revoked from `authenticated`). These SECURITY DEFINER
-- RPCs are the sole mutation path, exactly like 029/030. NO schema change, NO
-- RLS change, NO new policy, NO trigger change. Forward-only.
--
-- LOCKING — identical order to the accept RPCs: `SELECT ... FROM public.jobs
-- WHERE id = <assignment.job_id> FOR UPDATE` is taken FIRST, before the
-- assignment row is transitioned. A cancel racing a concurrent
-- respond_to_application / respond_to_invitation on the same job therefore
-- serializes on the one job row (single, consistent lock target -> no
-- deadlock). A cancel only ever DECREASES occupied_slot_count, so it can never
-- push capacity above workers_needed; the accept side re-checks capacity under
-- the same lock. Two concurrent cancels / a cancel + complete on the same
-- assignment serialize too: the loser re-reads status <> 'active' and aborts.
--
-- SOURCE ROWS UNTOUCHED — the accepted application / accepted invitation that
-- produced the assignment stays `accepted` (history). Neither RPC writes
-- applications / invitations / jobs.* / recruitment_cycle. Capacity + open
-- state stay 100% derived: assignments -> occupied_slot_count ->
-- job_registration_state (a freed slot reopens the job ONLY when it is still
-- status='open' AND closed_manually=false; a manually-closed job stays closed
-- with closure_reason 'manual').
--
-- NOTIFICATIONS — none added. The existing assignments_reconcile (009) AFTER
-- INSERT OR UPDATE trigger still runs; on a cancel it sees occupied drop below
-- workers_needed and does nothing, on a complete it sees no change — behaviour
-- preserved, not extended.
--
-- Security model = 029/030: SECURITY DEFINER, search_path '', EXECUTE granted
-- to `authenticated` only (revoked from public / anon). auth.uid() live from
-- the request JWT. No admin path (the UIs are worker- / owning-contractor-only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- cancel_assignment — the assigned worker OR the owning approved contractor
--   turns an `active` assignment into `cancelled`. cancelled_by is derived
--   from the verified caller; cancellation_message is the trimmed input.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_assignment(
  p_assignment_id uuid,
  p_message       text
)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_asg    public.assignments;
  v_job    public.jobs;
  v_actor  public.assignment_actor;
  v_status public.assignment_status;
  v_msg    text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_asg from public.assignments where id = p_assignment_id;
  if v_asg.id is null then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  -- lock the job row first (same order as respond_to_application / _invitation)
  select * into v_job from public.jobs where id = v_asg.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  -- authorize + derive the actor
  if v_uid = v_asg.worker_id then
    v_actor := 'worker';
  elsif v_uid = v_job.contractor_id then
    if not exists (
      select 1 from public.contractor_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where cp.profile_id = v_uid and p.status = 'approved'
    ) then
      raise exception 'not an approved contractor' using errcode = '42501';
    end if;
    v_actor := 'contractor';
  else
    raise exception 'not authorized for this assignment' using errcode = '42501';
  end if;

  -- re-read status under the job lock (a concurrent cancel/complete may have
  -- moved it since the first select)
  select status into v_status from public.assignments where id = p_assignment_id;
  if v_status <> 'active' then
    raise exception 'assignment is % and cannot be cancelled', v_status
      using errcode = 'P0001';
  end if;

  update public.assignments set
    status               = 'cancelled',
    cancelled_at         = now(),
    cancelled_by         = v_actor,
    cancellation_message = v_msg
  where id = p_assignment_id and status = 'active'
  returning * into v_asg;

  if v_asg.id is null then
    raise exception 'assignment is no longer active' using errcode = 'P0001';
  end if;

  return v_asg;
end;
$$;
revoke execute on function public.cancel_assignment(uuid, text) from public, anon;
grant  execute on function public.cancel_assignment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_assignment — the owning approved contractor marks an `active`
--   assignment as `completed` (worker finished normally). The slot STAYS
--   occupied (occupied_slot_count counts active + completed) — no capacity
--   change, no reopen. No cancellation fields are written.
-- ---------------------------------------------------------------------------
create or replace function public.complete_assignment(p_assignment_id uuid)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_asg    public.assignments;
  v_job    public.jobs;
  v_status public.assignment_status;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_asg from public.assignments where id = p_assignment_id;
  if v_asg.id is null then
    raise exception 'assignment % not found', p_assignment_id using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs where id = v_asg.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_job.contractor_id then
    raise exception 'not authorized for this assignment' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  select status into v_status from public.assignments where id = p_assignment_id;
  if v_status <> 'active' then
    raise exception 'assignment is % and cannot be completed', v_status
      using errcode = 'P0001';
  end if;

  update public.assignments set
    status       = 'completed',
    completed_at = now()
  where id = p_assignment_id and status = 'active'
  returning * into v_asg;

  if v_asg.id is null then
    raise exception 'assignment is no longer active' using errcode = 'P0001';
  end if;

  return v_asg;
end;
$$;
revoke execute on function public.complete_assignment(uuid) from public, anon;
grant  execute on function public.complete_assignment(uuid) to authenticated;
