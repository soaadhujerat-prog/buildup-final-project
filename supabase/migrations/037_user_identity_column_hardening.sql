-- =============================================================================
-- 037 · user_identity — restrict client SELECT to non-sensitive columns
-- =============================================================================
-- 036 tried `REVOKE SELECT (id_number_hash, id_number_enc) ... FROM
-- authenticated`, but PostgreSQL does not let a column-level REVOKE carve a
-- column out of a table-wide `GRANT SELECT` — that grant kept covering every
-- column, so the REVOKE was inert. This migration does it the supported way:
-- drop the table-wide SELECT and re-grant SELECT on ONLY the non-sensitive
-- columns.
--
-- After this, for `anon` / `authenticated`:
--   • SELECT is allowed on: profile_id, id_document_path, created_at, updated_at
--   • SELECT on id_number_hash / id_number_enc is DENIED at the privilege layer
--     (independently of the RLS row policy, which is unchanged:
--      `user_identity_select` = profile_id = auth.uid() OR is_admin()).
-- `service_role` (the Edge Functions that HMAC / encrypt / decrypt) and the
-- table owner keep full access. RLS is not weakened — this only removes column
-- reach from client roles.
--
-- Verified before applying: the only client-side read of this table is
-- `adminUserService.loadUserDirectory` -> `select('profile_id')`. Nothing in the
-- app reads id_number_hash or id_number_enc.
--
-- Forward-only. No RLS-policy change, no historical migration edit.
-- =============================================================================

revoke select on public.user_identity from anon, authenticated;

grant select (profile_id, id_document_path, created_at, updated_at)
  on public.user_identity
  to authenticated;
