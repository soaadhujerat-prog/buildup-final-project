-- =============================================================================
-- 010 · Storage buckets + access policies
-- =============================================================================
-- All five buckets are PRIVATE (public = false). Identity documents and
-- contractor licences never get a public URL — access is via short-lived
-- signed URLs minted server-side (review plan §F).
--
-- NOTE: Supabase Storage does NOT strip EXIF/GPS automatically. Removing it
-- from worksite / avatar images requires a real image-processing step in the
-- upload pipeline and is tracked as a hardening enhancement, not an MVP
-- blocker (review decision #6).
-- =============================================================================

-- ---------- helper: does the caller own this registration folder? ----------
create or replace function public.storage_owns_registration(p_registration_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.registrations r
    where r.id::text = p_registration_id
      and r.auth_user_id = (select auth.uid())
  )
$$;
grant execute on function public.storage_owns_registration(text) to authenticated;

-- ---------- buckets (all private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('id-documents',        'id-documents',        false, 10485760, array['image/jpeg','image/png','image/heic','image/webp','application/pdf']),
  ('contractor-licenses', 'contractor-licenses', false, 10485760, array['image/jpeg','image/png','image/heic','image/webp','application/pdf']),
  ('worker-certificates', 'worker-certificates', false, 10485760, array['image/jpeg','image/png','image/heic','image/webp','application/pdf']),
  ('worksite-images',     'worksite-images',     false, 10485760, array['image/jpeg','image/png','image/heic','image/webp']),
  ('avatars',             'avatars',             false,  5242880, array['image/jpeg','image/png','image/heic','image/webp']);

-- =============================================================================
-- avatars — readable by any signed-in user; writable only in own {uid}/ folder
-- =============================================================================
create policy "avatars read (authenticated)" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================================
-- id-documents — PRIVATE. No client writes (service-role only, via register).
-- Read: the owning registration's user, or an admin.
-- =============================================================================
create policy "id-documents read (owner or admin)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'id-documents'
    and (
      public.is_admin()
      or public.storage_owns_registration((storage.foldername(name))[1])
    )
  );

-- =============================================================================
-- contractor-licenses — PRIVATE. Read: owner or admin. Write: own folder only
-- (a contractor attaches a new licence to an update request). Kept forever —
-- no update/delete policy.
-- =============================================================================
create policy "contractor-licenses read (owner or admin)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contractor-licenses'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "contractor-licenses insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contractor-licenses'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================================
-- worker-certificates — PRIVATE. Read: the worker, an admin, or a contractor
-- who has a relationship with that worker (can_view_profile). Write: own folder.
-- =============================================================================
create policy "worker-certificates read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'worker-certificates'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        and public.can_view_profile(((storage.foldername(name))[1])::uuid)
      )
    )
  );

create policy "worker-certificates insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worker-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "worker-certificates update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'worker-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'worker-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "worker-certificates delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'worker-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================================
-- worksite-images — PRIVATE (authenticated only). Read: anyone who may view
-- the job. Write / manage: the job's contractor.
-- =============================================================================
create policy "worksite-images read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'worksite-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.can_view_job(((storage.foldername(name))[1])::uuid)
  );

create policy "worksite-images insert (job owner)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worksite-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.job_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "worksite-images update (job owner)" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'worksite-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.job_owner(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'worksite-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.job_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "worksite-images delete (job owner)" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'worksite-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.job_owner(((storage.foldername(name))[1])::uuid)
  );
