-- =============================================================================
-- 050 · Final frontend/backend consistency hardening (audit fixes H-1, H-2,
--       M-1/M-2, M-3). Safe-mode: no business rule changed, no data touched,
--       no RPC signature changed. Forward-only; migrations 001-049 untouched.
-- =============================================================================
-- H-1  applications: a worker-created application must ALWAYS begin
--      status='pending' with no response fields. The applications_insert RLS
--      policy never constrained `status`, so a hand-crafted REST INSERT could
--      create a fake `accepted`/`rejected` row (no assignment, immutable). The
--      pending -> accepted/rejected/withdrawn transitions stay RPC-only (there
--      is NO update policy on applications). A BEFORE INSERT trigger normalizes
--      the row — same pattern as applications_set_cycle / guard_* triggers.
--      The compliant app path (applyToJobBackend inserts only
--      job_id/worker_id/recruitment_cycle/message) is unaffected.
--
-- M-3  contractor_license_update_requests: same class — INSERT never
--      constrained `status`/review fields. Same BEFORE INSERT normalization.
--      Admin review is an UPDATE via review_contractor_license_update (a
--      BEFORE INSERT trigger never sees it), so the review workflow and the
--      real contractor_profiles licence columns are untouched.
--
-- M-1  send_invitation: also refuse when the worker already has a LIVE
--      (pending/accepted) APPLICATION for the same job — the contractor should
--      respond to the application, not open a parallel invitation path. Body
--      reproduced VERBATIM from the deployed version (migration 030 lineage);
--      only one `if exists (...)` block is added, right after the existing
--      one-live-invitation check. Signature, locking, capacity check,
--      notification and dedupe key are unchanged.
--
-- H-2  jobs: revoke the direct INSERT/UPDATE table privilege from
--      `authenticated`. Every sanctioned job write already goes through a
--      SECURITY DEFINER RPC owned by `postgres` (create_job / update_job /
--      set_job_closed_manually / jobs_apply_child_collections) or the
--      service-role delete-job Edge Function, none of which depend on this
--      grant. The jobs_insert / jobs_update RLS policies are left in place
--      (now inert, fully reversible). DELETE is left as-is (trigger-guarded,
--      Edge-Function-only in practice). No ownership / capacity / recruitment
--      cycle / staffing / UI change.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- H-1 · applications initial-state guard
-- ---------------------------------------------------------------------------
create or replace function public.applications_force_initial_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only normalize inserts made by an end user (RLS applications_insert already
  -- forces worker_id = auth.uid()). A pure service / SQL context (auth.uid()
  -- null — migrations, seed, admin tooling) is left untouched, exactly like
  -- guard_profiles_privileged_columns / guard_notification_columns.
  if (select auth.uid()) is not null then
    new.status              := 'pending';
    new.responded_at        := null;
    new.contractor_response := null;
    new.withdrawn_at        := null;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_force_initial_state_before_insert on public.applications;
create trigger applications_force_initial_state_before_insert
  before insert on public.applications
  for each row execute function public.applications_force_initial_state();


-- ---------------------------------------------------------------------------
-- M-3 · contractor_license_update_requests initial-state guard
-- ---------------------------------------------------------------------------
create or replace function public.license_request_force_initial_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.status           := 'pending';
    new.reviewed_at      := null;
    new.reviewed_by      := null;
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists license_request_force_initial_state_before_insert
  on public.contractor_license_update_requests;
create trigger license_request_force_initial_state_before_insert
  before insert on public.contractor_license_update_requests
  for each row execute function public.license_request_force_initial_state();


-- ---------------------------------------------------------------------------
-- M-1 · send_invitation — reject when a live application already exists
--       (verbatim from the deployed function + one added block)
-- ---------------------------------------------------------------------------
create or replace function public.send_invitation(p_job_id uuid, p_worker_id uuid, p_message text)
returns invitations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_job     public.jobs;
  v_inv     public.invitations;
  v_msg     text := nullif(btrim(coalesce(p_message, '')), '');
  v_company text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

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

  if not exists (
    select 1 from public.worker_profiles wp
    join public.profiles p on p.id = wp.profile_id
    where wp.profile_id = p_worker_id
      and p.role = 'worker'
      and p.status = 'approved'
  ) then
    raise exception 'target is not an approved worker' using errcode = 'P0001';
  end if;

  if v_job.status <> 'open' then
    raise exception 'job % is not open for staffing', p_job_id using errcode = 'P0001';
  end if;
  if v_job.closed_manually then
    raise exception 'job % is closed to registration', p_job_id using errcode = 'P0001';
  end if;

  if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
    raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.invitations
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'an active invitation for this worker and job already exists'
      using errcode = 'unique_violation';
  end if;

  -- NEW (050 · M-1): a worker who already has a LIVE application (pending or
  -- accepted) for this job is already in the recruitment pipeline — the
  -- contractor responds to that application instead of opening a parallel
  -- invitation. Mirrors the frontend invite-surface exclusion. A withdrawn /
  -- rejected application does NOT block a fresh invitation.
  if exists (
    select 1 from public.applications
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'worker already has a live application for job %', p_job_id
      using errcode = 'P0001';
  end if;

  insert into public.invitations (job_id, contractor_id, worker_id, message, status)
  values (p_job_id, v_uid, p_worker_id, v_msg, 'pending')
  returning * into v_inv;

  select company_name into v_company from public.contractor_profiles where profile_id = v_uid;
  perform public.notify(
    p_worker_id, 'invitation_received',
    'הזמנה חדשה לעבודה',
    coalesce(nullif(btrim(v_company), ''), 'קבלן')
      || ' הזמין אותך לפרויקט "' || coalesce(v_job.title, '') || '".',
    v_job.id::text, 'inv_received:' || v_inv.id::text
  );

  return v_inv;
end;
$function$;


-- ---------------------------------------------------------------------------
-- H-2 · revoke direct authenticated write privilege on public.jobs
-- ---------------------------------------------------------------------------
revoke insert, update on public.jobs from authenticated;
