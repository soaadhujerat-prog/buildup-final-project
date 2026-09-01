-- =============================================================================
-- 036 · identity completeness — encrypted-ID hardening + legacy backfill
-- =============================================================================
-- Context (audit): `public.user_identity(profile_id, id_number_hash,
-- id_number_enc, id_document_path, ...)`. RLS SELECT policy `user_identity_select`
-- is `profile_id = auth.uid() OR is_admin()`. There is NO INSERT/UPDATE/DELETE
-- policy, so clients can only ever SELECT. `id_number_enc` is an AES-256-GCM
-- ciphertext produced by the `register` Edge Function; it is decrypted ONLY by
-- the `admin-reveal-id` / `reveal-my-id` Edge Functions (service_role, key in
-- the function env — never in the app bundle).
--
-- Two forward-only changes, no RLS-policy change, no historical migration edit:
--
-- 1. DEFENCE-IN-DEPTH — stop the encrypted / hashed identity material from
--    flowing to any client role at all. The RLS row policy still lets the owner
--    (and an admin) read their `user_identity` row, but a column-level REVOKE
--    removes `id_number_hash` / `id_number_enc` from that read for `anon` /
--    `authenticated`. Verified: the only client SELECT on this table is
--    `adminUserService.loadUserDirectory` -> `select('profile_id')`; nothing
--    reads the hash or the ciphertext. `service_role` (Edge Functions) and the
--    table owner keep full access. This STRENGTHENS the posture — RLS is not
--    weakened anywhere.
--
-- 2. LEGACY BACKFILL from an already-encrypted source. Some `user_identity`
--    rows created before the encrypting `register` flow (or seeded directly)
--    have `id_number_enc IS NULL`, which makes admin ID-reveal fail with
--    "unavailable". Where a `registrations` row with the SAME `id_number_hash`
--    still carries a good `id_number_enc`, copy it in. Idempotent (fills NULLs
--    only, never overwrites). An HMAC hash is NOT reversible, so a row with no
--    encrypted copy anywhere is NOT touched here — it self-heals on the user's
--    next successful `login-by-id` (ID + password), which encrypts the
--    just-verified ID server-side. No user is asked to re-register.
-- =============================================================================

-- 1. column-level hardening -----------------------------------------------------
revoke select (id_number_hash, id_number_enc)
  on public.user_identity
  from anon, authenticated;

-- 2. one-time backfill from an encrypted registration copy --------------------
update public.user_identity ui
set id_number_enc = (
      select r.id_number_enc
      from public.registrations r
      where r.id_number_hash = ui.id_number_hash
        and r.id_number_enc is not null
      order by (r.status = 'approved') desc, r.created_at desc
      limit 1
    ),
    updated_at = now()
where ui.id_number_enc is null
  and exists (
    select 1 from public.registrations r
    where r.id_number_hash = ui.id_number_hash
      and r.id_number_enc is not null
  );
