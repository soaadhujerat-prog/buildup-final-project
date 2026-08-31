-- =============================================================================
-- 004 · jobs + child collections (+ location columns on profiles)
-- =============================================================================
-- There is NO stored `accepting_applications` boolean. Registration state is
-- DERIVED in 009 from jobs.closed_manually + jobs.workers_needed + the count
-- of active assignments (review decision #4).
-- `recruitment_cycle` exists so a rejected/withdrawn worker can only re-apply
-- after an explicit reopen (review decision #9 — enforced in 009).
--
-- Location: `city_id` (FK to the curated cities list) is nullable because the
-- current frontend stores a free-text city string that may not match; the
-- authoritative display value is `city_name`. lat/lon are seeded from the city
-- and are what Smart Match distance will use later.
-- The worker/contractor city columns conceptually belong to 002 but are added
-- here alongside the rest of the location modelling (see report §K).
-- =============================================================================

-- ---------- location columns on the profile tables (belong with 002) ----------
alter table public.worker_profiles
  add column city_id   bigint references public.cities(id),
  add column city_name text not null default '',
  add column lat       double precision,
  add column lon       double precision;

alter table public.contractor_profiles
  add column city_id   bigint references public.cities(id),
  add column city_name text not null default '',
  add column lat       double precision,
  add column lon       double precision;

-- ---------- jobs ----------
create table public.jobs (
  id                       uuid primary key default gen_random_uuid(),
  contractor_id            uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  title                    text not null,
  description              text not null default '',
  profession_category_slug text not null references public.profession_categories(slug),
  city_id                  bigint references public.cities(id),
  city_name                text not null,
  address                  text not null default '',
  lat                      double precision,
  lon                      double precision,
  start_date               date not null,
  end_date                 date,
  duration                 text not null default '',
  hourly_rate              numeric(10,2) check (hourly_rate >= 0),
  daily_rate               numeric(10,2) check (daily_rate  >= 0),
  workers_needed           int  not null check (workers_needed >= 1),
  status                   public.job_status not null default 'open',
  urgent                   boolean not null default false,
  posted_at                timestamptz not null default now(),
  updated_at               timestamptz,
  closed_manually          boolean not null default false,
  recruitment_cycle        int not null default 1 check (recruitment_cycle >= 1),
  created_at               timestamptz not null default now(),
  constraint jobs_has_a_rate check (hourly_rate is not null or daily_rate is not null)
);
create index jobs_contractor_idx on public.jobs (contractor_id);
create index jobs_status_idx     on public.jobs (status);
create index jobs_category_idx   on public.jobs (profession_category_slug);
create index jobs_city_idx       on public.jobs (city_id);
-- NOTE: no set_updated_at trigger — updated_at is stamped only by an explicit
-- content edit, never by a technical/operational change (matches updateJob).

-- ---------- job_professions ----------
create table public.job_professions (
  job_id          uuid not null references public.jobs(id) on delete cascade,
  profession_slug text not null references public.professions(slug),
  is_primary      boolean not null default false,
  primary key (job_id, profession_slug)
);
create unique index job_professions_one_primary
  on public.job_professions (job_id) where is_primary;

-- ---------- job_required_certifications ----------
create table public.job_required_certifications (
  job_id uuid not null references public.jobs(id) on delete cascade,
  name   text not null,
  primary key (job_id, name)
);

-- ---------- job_requirements (ordered free text) ----------
create table public.job_requirements (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  text       text not null,
  sort_order int  not null default 0
);
create index job_requirements_job_idx on public.job_requirements (job_id, sort_order);

-- ---------- job_worksite_images ----------
create table public.job_worksite_images (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  path       text not null,
  sort_order int  not null default 0
);
create index job_worksite_images_job_idx on public.job_worksite_images (job_id, sort_order);
