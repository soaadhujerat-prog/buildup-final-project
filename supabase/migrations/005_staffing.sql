-- =============================================================================
-- 005 · applications, invitations, assignments (staffing)
-- =============================================================================
-- assignments are the single source of truth for "who is staffed right now"
-- and for staffing history. Application / Invitation describe "how the worker
-- got here" and are never deleted — they move to withdrawn / declined /
-- cancelled. `completed` keeps its slot; only `cancelled` frees one.
--
-- The overbooking + re-application guards are functions/triggers in 009; the
-- UNIQUE indexes here are the last-resort safety net (review decisions #4/#9).
-- =============================================================================

-- ---------- applications (worker -> job) ----------
create table public.applications (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  worker_id           uuid not null references public.worker_profiles(profile_id) on delete cascade,
  recruitment_cycle   int  not null,
  message             text,
  applied_at          timestamptz not null default now(),
  responded_at        timestamptz,
  withdrawn_at        timestamptz,
  contractor_response text,
  status              public.application_status not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- one application per worker per job per recruitment cycle
  unique (job_id, worker_id, recruitment_cycle)
);
create index applications_job_idx    on public.applications (job_id);
create index applications_worker_idx on public.applications (worker_id);
create index applications_status_idx on public.applications (status);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------- invitations (contractor -> worker) ----------
create table public.invitations (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  contractor_id       uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  worker_id           uuid not null references public.worker_profiles(profile_id) on delete cascade,
  message             text,
  sent_at             timestamptz not null default now(),
  responded_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason public.invitation_cancel_reason,
  response_message    text,
  status              public.invitation_status not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- at most one still-live invitation per (job, worker)
create unique index invitations_one_live
  on public.invitations (job_id, worker_id)
  where status in ('pending', 'accepted');
create index invitations_job_idx        on public.invitations (job_id);
create index invitations_worker_idx     on public.invitations (worker_id);
create index invitations_contractor_idx on public.invitations (contractor_id);
create index invitations_status_idx     on public.invitations (status);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ---------- assignments (real staffing / history) ----------
create table public.assignments (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references public.jobs(id) on delete cascade,
  contractor_id        uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  worker_id            uuid not null references public.worker_profiles(profile_id) on delete cascade,
  source               public.assignment_source not null,
  source_id            uuid,  -- the application or invitation id (no cross-table FK)
  status               public.assignment_status not null default 'active',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         public.assignment_actor,
  cancellation_message text
);
-- a worker can hold at most one ACTIVE assignment per job
create unique index assignments_one_active
  on public.assignments (job_id, worker_id)
  where status = 'active';
create index assignments_job_idx        on public.assignments (job_id);
create index assignments_worker_idx     on public.assignments (worker_id);
create index assignments_contractor_idx on public.assignments (contractor_id);
create index assignments_status_idx     on public.assignments (status);
-- supports the "effective (latest) assignment per (worker, job)" lookups
create index assignments_effective_idx
  on public.assignments (job_id, worker_id, updated_at desc, created_at desc);

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();
