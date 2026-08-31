-- =============================================================================
-- 015 · restore the standard service_role grants on schema public
-- =============================================================================
-- 008 granted DML to `authenticated` and revoked everything from `anon`, but
-- never (re)granted `service_role` — so `service_role` ended up with ZERO
-- select/insert/update/delete on all 35 public tables. That makes the entire
-- Edge Function pattern the schema was designed around unusable:
--
--   008 header:  "service_role bypasses RLS and is used only by Edge Functions"
--   reality:     Edge Function -> "permission denied for table user_identity"
--
-- This migration restores `service_role` to the normal Supabase baseline. It is
-- purely corrective:
--   • `anon` is NOT touched (stays fully revoked — see 008).
--   • `authenticated` is NOT touched (RLS is still the gate for end users).
--   • `service_role` already bypasses RLS by design and its key is a
--     server-side-only secret (Edge Function env), never shipped to the client.
--
-- No policy, table, function body or business rule changes.
-- =============================================================================

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                on all sequences in schema public to service_role;
grant execute                      on all routines  in schema public to service_role;

-- future objects created in `public` inherit the same (matches a fresh project)
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on routines to service_role;
