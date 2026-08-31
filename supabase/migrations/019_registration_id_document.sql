-- =============================================================================
-- 019 · registration ID-document storage flow (Phase 3B)
-- =============================================================================
-- The ID document picked at sign-up becomes a real private Storage object in
-- id-documents/{registrationId}/... . Because sign-up is UNauthenticated, the
-- client cannot write to that bucket directly (010: "service-role only, via
-- register"). The flow is:
--
--   1. client -> Edge Function `register-upload-url`  (no JWT)
--        reserves a fresh registrationId (uuid) + path, returns a short-lived
--        signed upload token (createSignedUploadUrl, service-role).
--   2. client uploads the file bytes straight to Storage with that token.
--   3. client -> Edge Function `register` with { reservedRegistrationId,
--        idDocumentPath, ... }. `register` VERIFIES the object exists, then
--        calls create_registration() with the SAME id so the row id matches
--        the storage folder (the id-documents RLS read policy keys on
--        (storage.foldername(name))[1] = registrations.id).
--
-- A registration therefore only ever carries id_document_path AFTER the object
-- is confirmed present; a failed upload leaves no such claim.
--
-- This migration:
--   (a) replaces create_registration with a version that takes the caller
--       reserved registration id + the confirmed document path.
--   (b) exposes id_document_path in admin_list_registrations so an authorised
--       admin can mint a signed read URL for it on RegistrationDetails.
-- No RLS / bucket / policy change (010 already covers id-documents reads).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) create_registration — now id-reserving + document-aware
-- ---------------------------------------------------------------------------
drop function if exists public.create_registration(uuid, public.registration_role, text, text, jsonb);

create function public.create_registration(
  p_registration_id  uuid,
  p_auth_user_id     uuid,
  p_role             public.registration_role,
  p_id_hash          text,
  p_id_enc           text,
  p_id_document_path text,
  p_data             jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_registration_id, gen_random_uuid());
begin
  insert into public.registrations
    (id, auth_user_id, role, status, id_number_hash, id_number_enc,
     id_document_path, data, external_checks)
  values
    (v_id, p_auth_user_id, p_role, 'pending', p_id_hash, p_id_enc,
     nullif(p_id_document_path, ''), coalesce(p_data, '{}'::jsonb), '{}'::jsonb)
  returning id into v_id;

  insert into public.registration_status_events
    (registration_id, from_status, to_status, reason, actor_id)
  values (v_id, 'pending', 'pending', 'submitted', null);

  return v_id;
end;
$$;

revoke execute on function
  public.create_registration(uuid, uuid, public.registration_role, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function
  public.create_registration(uuid, uuid, public.registration_role, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- (b) admin_list_registrations — add id_document_path to each row
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_registrations()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(row_json order by (row_json->>'submitted_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',               r.id,
      'role',             r.role,
      'status',           r.status,
      'submitted_at',     r.submitted_at,
      'processed_at',     r.processed_at,
      'processed_by',     r.processed_by,
      'rejection_reason', r.rejection_reason,
      'rejected_at',      r.rejected_at,
      'approved_at',      r.approved_at,
      'approval_message', r.approval_message,
      'created_user_id',  r.created_user_id,
      'external_checks',  r.external_checks,
      'id_document_path', r.id_document_path,
      'data',             r.data,
      'email',            u.email,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',             e.id,
          'registrationId', e.registration_id,
          'fromStatus',     e.from_status,
          'toStatus',       e.to_status,
          'reason',         e.reason,
          'message',        e.message,
          'actorId',        e.actor_id,
          'createdAt',      e.created_at
        ) order by e.created_at)
        from public.registration_status_events e
        where e.registration_id = r.id
      ), '[]'::jsonb)
    ) as row_json
    from public.registrations r
    left join auth.users u on u.id = r.auth_user_id
    where public.is_live_admin((select auth.uid()))
  ) s
$$;
revoke execute on function public.admin_list_registrations() from public, anon;
grant  execute on function public.admin_list_registrations() to authenticated, service_role;
