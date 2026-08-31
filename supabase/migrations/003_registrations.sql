-- =============================================================================
-- 003 · registrations (pre-approval pipeline)
-- =============================================================================
-- The link to the real user is the FK auth_user_id (-> auth.users) and, once
-- approved, created_user_id (-> profiles) — NEVER an email inside `data`
-- (review decision #3). `data` is a frozen historical snapshot and must not
-- contain a password. status history is append-only (enforced in 008).
-- =============================================================================

create table public.registrations (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null references auth.users(id) on delete cascade,
  role             public.registration_role not null,
  status           public.user_status not null default 'pending',
  submitted_at     timestamptz not null default now(),
  processed_at     timestamptz,
  processed_by     uuid references public.profiles(id),
  rejection_reason text,
  rejected_at      timestamptz,
  approved_at      timestamptz,
  approval_message text,
  created_user_id  uuid references public.profiles(id),
  external_checks  jsonb not null default '{}'::jsonb,
  data             jsonb not null,
  id_document_path text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index registrations_auth_user_idx on public.registrations (auth_user_id);
create index registrations_status_idx    on public.registrations (status);
create index registrations_created_user_idx on public.registrations (created_user_id);

create trigger registrations_set_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();

-- ---------- append-only status audit trail ----------
create table public.registration_status_events (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  from_status     public.user_status not null,
  to_status       public.user_status not null,
  reason          text,
  message         text,
  actor_id        uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index registration_status_events_reg_idx
  on public.registration_status_events (registration_id, created_at);
