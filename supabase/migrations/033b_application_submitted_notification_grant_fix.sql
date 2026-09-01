-- =============================================================================
-- 033b · lock down applications_notify_contractor() execute grants
-- =============================================================================
-- Trigger functions in this project rely on the 011 bulk hardening
-- (`revoke execute on all functions in schema public from public/anon/authenticated`
-- + `alter default privileges ... revoke execute on routines from ...`) to stay
-- un-callable directly by any client role. That one-time bulk revoke does not
-- retroactively cover a function created later, which still picked up
-- Postgres's implicit CREATE FUNCTION grant to PUBLIC (confirmed live: the new
-- trigger function's ACL carried `=X/postgres`, i.e. PUBLIC execute — flagged
-- by the Security Advisor as `anon_security_definer_function_executable`,
-- something no other trigger function in this project exhibits).
--
-- Lock `applications_notify_contractor` down explicitly, exactly like
-- `public.notify()` (032) and every other server-only helper: no EXECUTE grant
-- to any client role. It only ever runs as the table owner via the
-- AFTER INSERT/UPDATE trigger on `public.applications` (033) — never directly.
-- No schema/RLS/behaviour change.
-- =============================================================================

revoke execute on function public.applications_notify_contractor()
  from public, anon, authenticated;
