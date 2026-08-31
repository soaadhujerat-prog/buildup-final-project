-- =============================================================================
-- 008 · authz helper functions + Row Level Security (default-deny) + grants
-- =============================================================================
-- Every helper is SECURITY DEFINER with a fixed empty search_path and reads
-- LIVE DB state (profiles.role / profiles.status) — never a JWT claim
-- (review decision #2). RLS is enabled on every table; a table with no policy
-- for `authenticated` is closed to end users (service_role bypasses RLS and
-- is used only by Edge Functions).
--
-- Staffing selector functions (occupied_slot_count / can_worker_apply / ...)
-- live here too because RLS policies depend on them. The derived
-- job_registration_state VIEW and the triggers/RPCs are in 009.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. authz helpers (live DB state)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'approved'
  )
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and profile_id = (select auth.uid())
  )
$$;

create or replace function public.job_owner(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs
    where id = p_job_id and contractor_id = (select auth.uid())
  )
$$;

create or replace function public.can_view_job(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and (
      j.status = 'open'
      or public.is_admin()
      or j.contractor_id = (select auth.uid())
      or exists (select 1 from public.applications a where a.job_id = j.id and a.worker_id = (select auth.uid()))
      or exists (select 1 from public.invitations i where i.job_id = j.id and i.worker_id = (select auth.uid()))
      or exists (select 1 from public.assignments s where s.job_id = j.id and s.worker_id = (select auth.uid()))
    )
  )
$$;

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
$$;

-- ---------------------------------------------------------------------------
-- 2. staffing selectors (assignments are the source of truth)
--    "effective" = latest assignment row per (worker, job).
-- ---------------------------------------------------------------------------
create or replace function public.occupied_slot_count(p_job_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  with eff as (
    select distinct on (a.worker_id) a.worker_id, a.status
    from public.assignments a
    where a.job_id = p_job_id
    order by a.worker_id, a.updated_at desc, a.created_at desc
  )
  select coalesce(count(*) filter (where status in ('active', 'completed')), 0)::int from eff
$$;

create or replace function public.active_assignment_count(p_job_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  with eff as (
    select distinct on (a.worker_id) a.worker_id, a.status
    from public.assignments a
    where a.job_id = p_job_id
    order by a.worker_id, a.updated_at desc, a.created_at desc
  )
  select coalesce(count(*) filter (where status = 'active'), 0)::int from eff
$$;

create or replace function public.is_job_fully_staffed(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.occupied_slot_count(p_job_id)
       >= coalesce((select workers_needed from public.jobs where id = p_job_id), 0)
$$;

create or replace function public.can_worker_apply(p_job_id uuid, p_worker_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    exists (
      select 1 from public.jobs j
      where j.id = p_job_id and j.status = 'open' and j.closed_manually = false
    )
    and not public.is_job_fully_staffed(p_job_id)
    -- decision #9: no free re-application after reject/accept/withdraw; only a
    -- new recruitment_cycle (explicit reopen) permits another row.
    and not exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.job_id = p_job_id
        and a.worker_id = p_worker_id
        and a.recruitment_cycle = j.recruitment_cycle
    )
$$;

create or replace function public.worker_contractor_relationship(p_worker_id uuid, p_contractor_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  with eff as (
    select distinct on (a.job_id) a.job_id, a.status
    from public.assignments a
    where a.worker_id = p_worker_id and a.contractor_id = p_contractor_id
    order by a.job_id, a.updated_at desc, a.created_at desc
  )
  select case
    when exists (select 1 from eff where status = 'active')    then 'current'
    when exists (select 1 from eff where status = 'completed') then 'past'
    else 'never'
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. guard triggers: privileged columns are server-side only
-- ---------------------------------------------------------------------------
create or replace function public.guard_profiles_privileged_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.role           is distinct from old.role
    or new.status         is distinct from old.status
    or new.blocked_reason is distinct from old.blocked_reason
    or new.blocked_at     is distinct from old.blocked_at
    or lower(new.email)   is distinct from lower(old.email)
    or new.email_verified is distinct from old.email_verified then
      raise exception 'profiles: role/status/block/email are managed server-side only';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profiles_privileged_columns();

create or replace function public.guard_contractor_license_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.contractor_registration_number is distinct from old.contractor_registration_number
    or new.license_verification_status    is distinct from old.license_verification_status
    or new.license_valid_from             is distinct from old.license_valid_from
    or new.license_valid_until            is distinct from old.license_valid_until
    or new.license_last_verified_at       is distinct from old.license_last_verified_at
    or new.license_next_review_at         is distinct from old.license_next_review_at
    or new.license_document_path          is distinct from old.license_document_path then
      raise exception 'contractor_profiles: licence columns change only via the review flow';
    end if;
  end if;
  return new;
end;
$$;
create trigger contractor_profiles_guard_license
  before update on public.contractor_profiles
  for each row execute function public.guard_contractor_license_columns();

create or replace function public.guard_notification_columns()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.user_id    is distinct from old.user_id
    or new.type       is distinct from old.type
    or new.title      is distinct from old.title
    or new.body       is distinct from old.body
    or new.related_id is distinct from old.related_id
    or new.dedupe_key is distinct from old.dedupe_key
    or new.created_at is distinct from old.created_at then
      raise exception 'notifications: end users may only toggle is_read';
    end if;
  end if;
  return new;
end;
$$;
create trigger notifications_guard_columns
  before update on public.notifications
  for each row execute function public.guard_notification_columns();

-- ---------------------------------------------------------------------------
-- 4. enable RLS on every table (default-deny)
-- ---------------------------------------------------------------------------
alter table public.profession_categories                enable row level security;
alter table public.professions                          enable row level security;
alter table public.areas                                enable row level security;
alter table public.project_types                        enable row level security;
alter table public.cities                               enable row level security;
alter table public.profiles                             enable row level security;
alter table public.user_identity                        enable row level security;
alter table public.admin_permissions                    enable row level security;
alter table public.worker_profiles                      enable row level security;
alter table public.contractor_profiles                  enable row level security;
alter table public.worker_professions                   enable row level security;
alter table public.worker_skills                        enable row level security;
alter table public.worker_certifications                enable row level security;
alter table public.worker_preferred_areas               enable row level security;
alter table public.contractor_areas                     enable row level security;
alter table public.contractor_project_types             enable row level security;
alter table public.registrations                        enable row level security;
alter table public.registration_status_events           enable row level security;
alter table public.jobs                                 enable row level security;
alter table public.job_professions                      enable row level security;
alter table public.job_required_certifications          enable row level security;
alter table public.job_requirements                     enable row level security;
alter table public.job_worksite_images                  enable row level security;
alter table public.applications                         enable row level security;
alter table public.invitations                          enable row level security;
alter table public.assignments                          enable row level security;
alter table public.conversations                        enable row level security;
alter table public.conversation_participants            enable row level security;
alter table public.messages                             enable row level security;
alter table public.notifications                        enable row level security;
alter table public.support_tickets                      enable row level security;
alter table public.support_ticket_messages              enable row level security;
alter table public.contractor_license_update_requests   enable row level security;
alter table public.contractor_favorite_workers          enable row level security;
alter table public.worker_favorite_contractors          enable row level security;

-- ---------------------------------------------------------------------------
-- 5. policies
-- ---------------------------------------------------------------------------

-- taxonomy: read-only reference data for any signed-in user
create policy taxonomy_read on public.profession_categories for select to authenticated using (true);
create policy taxonomy_read on public.professions           for select to authenticated using (true);
create policy taxonomy_read on public.areas                 for select to authenticated using (true);
create policy taxonomy_read on public.project_types         for select to authenticated using (true);
create policy taxonomy_read on public.cities                for select to authenticated using (true);

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated using (public.can_view_profile(id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- user_identity: self + admin only, read-only for clients
create policy user_identity_select on public.user_identity
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

-- admin_permissions
create policy admin_permissions_select on public.admin_permissions
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

-- worker_profiles / contractor_profiles
create policy worker_profiles_select on public.worker_profiles
  for select to authenticated using (public.can_view_profile(profile_id));
create policy worker_profiles_update on public.worker_profiles
  for update to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin())
  with check (profile_id = (select auth.uid()) or public.is_admin());

create policy contractor_profiles_select on public.contractor_profiles
  for select to authenticated using (public.can_view_profile(profile_id));
create policy contractor_profiles_update on public.contractor_profiles
  for update to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin())
  with check (profile_id = (select auth.uid()) or public.is_admin());

-- worker sub-collections
create policy worker_professions_select on public.worker_professions
  for select to authenticated using (public.can_view_profile(worker_id));
create policy worker_professions_write on public.worker_professions
  for all to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());

create policy worker_skills_select on public.worker_skills
  for select to authenticated using (public.can_view_profile(worker_id));
create policy worker_skills_write on public.worker_skills
  for all to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());

create policy worker_certifications_select on public.worker_certifications
  for select to authenticated using (public.can_view_profile(worker_id));
create policy worker_certifications_write on public.worker_certifications
  for all to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());

create policy worker_preferred_areas_select on public.worker_preferred_areas
  for select to authenticated using (public.can_view_profile(worker_id));
create policy worker_preferred_areas_write on public.worker_preferred_areas
  for all to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());

-- contractor sub-collections
create policy contractor_areas_select on public.contractor_areas
  for select to authenticated using (public.can_view_profile(contractor_id));
create policy contractor_areas_write on public.contractor_areas
  for all to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin())
  with check (contractor_id = (select auth.uid()) or public.is_admin());

create policy contractor_project_types_select on public.contractor_project_types
  for select to authenticated using (public.can_view_profile(contractor_id));
create policy contractor_project_types_write on public.contractor_project_types
  for all to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin())
  with check (contractor_id = (select auth.uid()) or public.is_admin());

-- registrations (read-only for clients; written by Edge Functions)
create policy registrations_select on public.registrations
  for select to authenticated
  using (auth_user_id = (select auth.uid()) or public.is_admin());
create policy registration_status_events_select on public.registration_status_events
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.id = registration_id and r.auth_user_id = (select auth.uid())
    )
  );

-- jobs
create policy jobs_select on public.jobs
  for select to authenticated using (public.can_view_job(id));
create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (contractor_id = (select auth.uid()) and public.is_active_user());
create policy jobs_update on public.jobs
  for update to authenticated
  using (public.job_owner(id) or public.is_admin())
  with check (public.job_owner(id) or public.is_admin());
create policy jobs_delete on public.jobs
  for delete to authenticated
  using (public.job_owner(id) or public.is_admin());

-- job sub-collections
create policy job_professions_select on public.job_professions
  for select to authenticated using (public.can_view_job(job_id));
create policy job_professions_write on public.job_professions
  for all to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());

create policy job_required_certifications_select on public.job_required_certifications
  for select to authenticated using (public.can_view_job(job_id));
create policy job_required_certifications_write on public.job_required_certifications
  for all to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());

create policy job_requirements_select on public.job_requirements
  for select to authenticated using (public.can_view_job(job_id));
create policy job_requirements_write on public.job_requirements
  for all to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());

create policy job_worksite_images_select on public.job_worksite_images
  for select to authenticated using (public.can_view_job(job_id));
create policy job_worksite_images_write on public.job_worksite_images
  for all to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());

-- applications
create policy applications_select on public.applications
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or public.is_admin()
    or public.job_owner(job_id)
  );
create policy applications_insert on public.applications
  for insert to authenticated
  with check (
    worker_id = (select auth.uid())
    and public.is_active_user()
    and public.can_worker_apply(job_id, worker_id)
  );
create policy applications_update on public.applications
  for update to authenticated
  using (
    worker_id = (select auth.uid())
    or public.job_owner(job_id)
    or public.is_admin()
  )
  with check (
    worker_id = (select auth.uid())
    or public.job_owner(job_id)
    or public.is_admin()
  );

-- invitations
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or contractor_id = (select auth.uid())
    or public.is_admin()
  );
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    contractor_id = (select auth.uid())
    and public.job_owner(job_id)
    and public.is_active_user()
    and not public.is_job_fully_staffed(job_id)
  );
create policy invitations_update on public.invitations
  for update to authenticated
  using (
    worker_id = (select auth.uid())
    or contractor_id = (select auth.uid())
    or public.is_admin()
  )
  with check (
    worker_id = (select auth.uid())
    or contractor_id = (select auth.uid())
    or public.is_admin()
  );

-- assignments: read-only for clients. All writes go through SECURITY DEFINER
-- RPCs / Edge Functions (Phase 5) — never a direct client insert/update.
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    worker_id = (select auth.uid())
    or contractor_id = (select auth.uid())
    or public.is_admin()
  );

-- chat
create policy conversations_select on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

create policy conversation_participants_select on public.conversation_participants
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy conversation_participants_update_self on public.conversation_participants
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy messages_select on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and public.is_active_user()
  );

-- notifications: recipient reads; recipient may only toggle is_read (guard trigger)
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_self on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- support: reachable even by blocked users (role check, not is_active_user)
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_user_role() in ('worker', 'contractor')
  );
create policy support_tickets_update_admin on public.support_tickets
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = (select auth.uid())
    )
  );
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      public.is_admin()
      or exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.user_id = (select auth.uid())
      )
    )
  );

-- contractor licence-update requests
create policy license_requests_select on public.contractor_license_update_requests
  for select to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin());
create policy license_requests_insert on public.contractor_license_update_requests
  for insert to authenticated
  with check (contractor_id = (select auth.uid()) and public.is_active_user());
create policy license_requests_update_admin on public.contractor_license_update_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- favorites (viewer-specific)
create policy contractor_favorite_workers_select on public.contractor_favorite_workers
  for select to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin());
create policy contractor_favorite_workers_write on public.contractor_favorite_workers
  for all to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));

create policy worker_favorite_contractors_select on public.worker_favorite_contractors
  for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_favorite_contractors_write on public.worker_favorite_contractors
  for all to authenticated
  using (worker_id = (select auth.uid()))
  with check (worker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. grants (RLS is the gate; anon gets nothing)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables    in schema public from anon;
revoke all on all routines  in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all routines in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on routines to authenticated;

-- append-only tables: no UPDATE/DELETE for clients (defense in depth on top of
-- the absent policies).
revoke update, delete on public.messages                    from authenticated;
revoke update, delete on public.registration_status_events  from authenticated;
revoke update, delete on public.support_ticket_messages     from authenticated;
revoke insert, delete on public.notifications               from authenticated;
revoke delete on public.support_tickets                     from authenticated;
revoke insert, update, delete on public.assignments         from authenticated;
revoke insert, update, delete on public.registrations       from authenticated;
revoke insert on public.registration_status_events          from authenticated;
