-- =============================================================================
-- 007 · notifications, support tickets, licence-update requests, favorites
-- =============================================================================
-- notifications.dedupe_key gives idempotency (partial UNIQUE).
-- support_tickets has NO admin_response column — the latest admin reply is
-- derived from support_ticket_messages. `is_closed` is deliberately separate
-- from `status` (a "done" ticket can still be open for follow-up).
-- favorites are viewer-specific (per contractor / per worker).
-- =============================================================================

-- ---------- notifications ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text not null default '',
  is_read    boolean not null default false,
  related_id text,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe_uniq
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ---------- support tickets ----------
create table public.support_tickets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  user_role         public.registration_role not null,
  type              public.support_ticket_type not null,
  subject           text not null,
  description       text not null,
  status            public.support_ticket_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id),
  resolved_at       timestamptz,
  is_closed         boolean not null default false,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ---------- support ticket messages (append-only thread) ----------
create table public.support_ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets(id) on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  sender_role   public.support_sender_role not null,
  message       text not null,
  status_change public.support_ticket_status,
  created_at    timestamptz not null default now()
);
create index support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at);

-- ---------- contractor licence-update requests ----------
create table public.contractor_license_update_requests (
  id                        uuid primary key default gen_random_uuid(),
  contractor_id             uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  new_registration_number   text,
  new_license_details       text,
  new_license_document_path text,
  proposed_valid_from       date,
  proposed_valid_until      date,
  status                    public.license_request_status not null default 'pending',
  reviewed_at               timestamptz,
  reviewed_by               uuid references public.profiles(id),
  rejection_reason          text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
-- only one open request per contractor at a time
create unique index contractor_license_requests_one_pending
  on public.contractor_license_update_requests (contractor_id) where status = 'pending';
create index contractor_license_requests_contractor_idx
  on public.contractor_license_update_requests (contractor_id, created_at desc);

create trigger contractor_license_update_requests_set_updated_at
  before update on public.contractor_license_update_requests
  for each row execute function public.set_updated_at();

-- ---------- favorites (viewer-specific) ----------
create table public.contractor_favorite_workers (
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  worker_id     uuid not null references public.worker_profiles(profile_id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (contractor_id, worker_id)
);
create index contractor_favorite_workers_worker_idx
  on public.contractor_favorite_workers (worker_id);

create table public.worker_favorite_contractors (
  worker_id     uuid not null references public.worker_profiles(profile_id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (worker_id, contractor_id)
);
create index worker_favorite_contractors_contractor_idx
  on public.worker_favorite_contractors (contractor_id);
