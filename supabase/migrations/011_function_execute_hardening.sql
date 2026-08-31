-- =============================================================================
-- 011 · lock down function EXECUTE (clears the security advisor)
-- =============================================================================
-- Every helper in `public` is either a trigger function or a helper referenced
-- only inside RLS policies. None of them should be reachable as a PostgREST
-- RPC (`/rest/v1/rpc/...`). RLS policies still evaluate SECURITY DEFINER
-- helpers even when the invoking role has no EXECUTE grant (verified), so
-- revoking EXECUTE is safe here.
--
-- Later phases will `grant execute` narrowly to `authenticated` for the
-- specific RPCs the client actually calls (get_or_create_conversation,
-- apply_to_job, staffing_progress, ...).
-- =============================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- neutralise the permissive default set in 008 — future functions must be
-- granted explicitly, not auto-exposed.
alter default privileges in schema public revoke execute on routines from public;
alter default privileges in schema public revoke execute on routines from anon;
alter default privileges in schema public revoke execute on routines from authenticated;
