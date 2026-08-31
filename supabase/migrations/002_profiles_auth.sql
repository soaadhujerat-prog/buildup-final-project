-- =============================================================================
-- 002 · profiles & auth-linked identity
-- =============================================================================
-- profiles.role + profiles.status are the DB source of truth for authz
-- (review decision #2). id_number is NEVER stored on profiles — only its
-- server-side HMAC + an encrypted copy live on user_identity (decision #1).
-- No RLS here (008); no app wiring.
-- =============================================================================

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            public.user_role   not null,
  full_name       text               not null,
  phone           text               not null,
  email           text               not null,
  email_verified  boolean            not null default false,
  avatar_path     text,
  status          public.user_status not null default 'pending',
  blocked_reason  text,
  blocked_at      timestamptz,
  created_at      timestamptz        not null default now(),
  updated_at      timestamptz        not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_role_idx   on public.profiles (role);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- user_identity (sensitive — self + admin only, later) ----------
-- id_number_hash = HMAC-SHA256(id_number, server-side pepper), computed ONLY
-- in an Edge Function. id_number_enc = encrypted copy at rest. Plaintext ID
-- never returns to the client and is never stored on profiles (decision #1).
create table public.user_identity (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  id_number_hash    text not null unique,
  id_number_enc     text,
  id_document_path  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger user_identity_set_updated_at
  before update on public.user_identity
  for each row execute function public.set_updated_at();

-- ---------- admin permissions ----------
create table public.admin_permissions (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  permission  public.admin_permission not null,
  primary key (profile_id, permission)
);

-- ---------- worker_profiles ----------
create table public.worker_profiles (
  profile_id               uuid primary key references public.profiles(id) on delete cascade,
  profession_category_slug text not null references public.profession_categories(slug),
  experience_years         int  not null default 0 check (experience_years >= 0),
  is_available             boolean not null default true,
  available_from           date,
  hourly_rate              numeric(10,2) not null check (hourly_rate >= 0),
  daily_rate               numeric(10,2) not null check (daily_rate  >= 0),
  bio                      text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index worker_profiles_category_idx  on public.worker_profiles (profession_category_slug);
create index worker_profiles_available_idx on public.worker_profiles (is_available);

create trigger worker_profiles_set_updated_at
  before update on public.worker_profiles
  for each row execute function public.set_updated_at();

-- ---------- contractor_profiles ----------
-- License verification status: only the human-decided state is stored
-- (pending_review / verified / rejected). expired / expiring_soon / review_due
-- are derived from the dates at read time (decision #6).
create table public.contractor_profiles (
  profile_id                     uuid primary key references public.profiles(id) on delete cascade,
  company_name                   text not null,
  contractor_registration_number text not null unique,
  license_details                text not null default '',
  bio                            text,
  license_document_path          text,
  license_valid_from             date,
  license_valid_until            date,
  license_verification_status    public.contractor_license_status not null default 'pending_review',
  license_last_verified_at       timestamptz,
  license_next_review_at         timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);
create trigger contractor_profiles_set_updated_at
  before update on public.contractor_profiles
  for each row execute function public.set_updated_at();

-- ---------- worker child collections (replace the embedded arrays) ----------
create table public.worker_professions (
  worker_id       uuid not null references public.worker_profiles(profile_id) on delete cascade,
  profession_slug text not null references public.professions(slug),
  is_primary      boolean not null default false,
  primary key (worker_id, profession_slug)
);
-- exactly one primary trade per worker
create unique index worker_professions_one_primary
  on public.worker_professions (worker_id) where is_primary;

create table public.worker_skills (
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  skill     text not null,
  primary key (worker_id, skill)
);

create table public.worker_certifications (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references public.worker_profiles(profile_id) on delete cascade,
  name           text not null,
  document_path  text,
  created_at     timestamptz not null default now()
);
create index worker_certifications_worker_idx on public.worker_certifications (worker_id);

create table public.worker_preferred_areas (
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  area_slug text not null references public.areas(slug),
  primary key (worker_id, area_slug)
);

-- ---------- contractor child collections ----------
create table public.contractor_areas (
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  area_slug     text not null references public.areas(slug),
  primary key (contractor_id, area_slug)
);

create table public.contractor_project_types (
  contractor_id     uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  project_type_slug text not null references public.project_types(slug),
  primary key (contractor_id, project_type_slug)
);
