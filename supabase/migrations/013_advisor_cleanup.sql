-- =============================================================================
-- 013 · performance-advisor cleanup
-- =============================================================================
-- (a) covering indexes for every foreign key the linter flagged
-- (b) replace the FOR ALL "_write" policies with explicit INSERT/UPDATE/DELETE
--     policies, so each table has exactly one SELECT policy for `authenticated`
--     (clears "multiple permissive policies").
-- The "unused_index" notices are expected on a brand-new empty schema and are
-- left as-is — those indexes are intentional and start being used once real
-- rows/queries exist.
-- =============================================================================

-- ---------- (a) covering indexes for flagged foreign keys ----------
create index contractor_areas_area_slug_idx            on public.contractor_areas (area_slug);
create index contractor_license_requests_reviewed_by_idx on public.contractor_license_update_requests (reviewed_by);
create index contractor_profiles_city_idx              on public.contractor_profiles (city_id);
create index contractor_project_types_slug_idx         on public.contractor_project_types (project_type_slug);
create index job_professions_slug_idx                  on public.job_professions (profession_slug);
create index messages_sender_idx                       on public.messages (sender_id);
create index registration_status_events_actor_idx      on public.registration_status_events (actor_id);
create index registrations_processed_by_idx            on public.registrations (processed_by);
create index support_ticket_messages_sender_idx        on public.support_ticket_messages (sender_id);
create index support_tickets_assigned_admin_idx        on public.support_tickets (assigned_admin_id);
create index support_tickets_closed_by_idx             on public.support_tickets (closed_by);
create index worker_preferred_areas_slug_idx           on public.worker_preferred_areas (area_slug);
create index worker_professions_slug_idx               on public.worker_professions (profession_slug);
create index worker_profiles_city_idx                  on public.worker_profiles (city_id);

-- ---------- (b) split FOR ALL "_write" policies into INSERT/UPDATE/DELETE ----------

-- worker sub-collections (owner = worker_id, or admin)
drop policy worker_professions_write on public.worker_professions;
create policy worker_professions_insert on public.worker_professions for insert to authenticated
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_professions_update on public.worker_professions for update to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_professions_delete on public.worker_professions for delete to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

drop policy worker_skills_write on public.worker_skills;
create policy worker_skills_insert on public.worker_skills for insert to authenticated
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_skills_update on public.worker_skills for update to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_skills_delete on public.worker_skills for delete to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

drop policy worker_certifications_write on public.worker_certifications;
create policy worker_certifications_insert on public.worker_certifications for insert to authenticated
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_certifications_update on public.worker_certifications for update to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_certifications_delete on public.worker_certifications for delete to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

drop policy worker_preferred_areas_write on public.worker_preferred_areas;
create policy worker_preferred_areas_insert on public.worker_preferred_areas for insert to authenticated
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_preferred_areas_update on public.worker_preferred_areas for update to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin())
  with check (worker_id = (select auth.uid()) or public.is_admin());
create policy worker_preferred_areas_delete on public.worker_preferred_areas for delete to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

-- contractor sub-collections (owner = contractor_id, or admin)
drop policy contractor_areas_write on public.contractor_areas;
create policy contractor_areas_insert on public.contractor_areas for insert to authenticated
  with check (contractor_id = (select auth.uid()) or public.is_admin());
create policy contractor_areas_update on public.contractor_areas for update to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin())
  with check (contractor_id = (select auth.uid()) or public.is_admin());
create policy contractor_areas_delete on public.contractor_areas for delete to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin());

drop policy contractor_project_types_write on public.contractor_project_types;
create policy contractor_project_types_insert on public.contractor_project_types for insert to authenticated
  with check (contractor_id = (select auth.uid()) or public.is_admin());
create policy contractor_project_types_update on public.contractor_project_types for update to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin())
  with check (contractor_id = (select auth.uid()) or public.is_admin());
create policy contractor_project_types_delete on public.contractor_project_types for delete to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin());

-- job sub-collections (owner = job's contractor, or admin)
drop policy job_professions_write on public.job_professions;
create policy job_professions_insert on public.job_professions for insert to authenticated
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_professions_update on public.job_professions for update to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_professions_delete on public.job_professions for delete to authenticated
  using (public.job_owner(job_id) or public.is_admin());

drop policy job_required_certifications_write on public.job_required_certifications;
create policy job_required_certifications_insert on public.job_required_certifications for insert to authenticated
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_required_certifications_update on public.job_required_certifications for update to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_required_certifications_delete on public.job_required_certifications for delete to authenticated
  using (public.job_owner(job_id) or public.is_admin());

drop policy job_requirements_write on public.job_requirements;
create policy job_requirements_insert on public.job_requirements for insert to authenticated
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_requirements_update on public.job_requirements for update to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_requirements_delete on public.job_requirements for delete to authenticated
  using (public.job_owner(job_id) or public.is_admin());

drop policy job_worksite_images_write on public.job_worksite_images;
create policy job_worksite_images_insert on public.job_worksite_images for insert to authenticated
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_worksite_images_update on public.job_worksite_images for update to authenticated
  using (public.job_owner(job_id) or public.is_admin())
  with check (public.job_owner(job_id) or public.is_admin());
create policy job_worksite_images_delete on public.job_worksite_images for delete to authenticated
  using (public.job_owner(job_id) or public.is_admin());

-- favorites (viewer-specific, no admin write)
drop policy contractor_favorite_workers_write on public.contractor_favorite_workers;
create policy contractor_favorite_workers_insert on public.contractor_favorite_workers for insert to authenticated
  with check (contractor_id = (select auth.uid()));
create policy contractor_favorite_workers_delete on public.contractor_favorite_workers for delete to authenticated
  using (contractor_id = (select auth.uid()));

drop policy worker_favorite_contractors_write on public.worker_favorite_contractors;
create policy worker_favorite_contractors_insert on public.worker_favorite_contractors for insert to authenticated
  with check (worker_id = (select auth.uid()));
create policy worker_favorite_contractors_delete on public.worker_favorite_contractors for delete to authenticated
  using (worker_id = (select auth.uid()));
