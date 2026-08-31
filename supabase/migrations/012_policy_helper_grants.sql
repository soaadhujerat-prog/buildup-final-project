-- =============================================================================
-- 012 · restore EXECUTE for the helpers that RLS policies / the view call
--        directly (011 was too broad)
-- =============================================================================
-- A function referenced DIRECTLY inside an RLS policy (or inside a
-- security_invoker view) is executed as the invoking role, so `authenticated`
-- must hold EXECUTE on it. A function called only from *within* another
-- SECURITY DEFINER function, or only from a trigger, does not need any grant
-- and stays locked (011).
--
-- is_admin / is_active_user / current_user_role only ever read the caller's
-- own profile row (which the self-RLS policy already exposes), so they are
-- switched to SECURITY INVOKER — no privilege escalation surface, and they
-- drop off the "security definer function" advisor.
-- The remaining granted helpers (can_view_profile / can_view_job /
-- is_conversation_member / job_owner / can_worker_apply / is_job_fully_staffed
-- / occupied_slot_count / storage_owns_registration) MUST stay SECURITY
-- DEFINER because they intentionally bypass RLS on other tables; the advisor
-- will still flag them for `authenticated` and that is expected for RLS
-- helpers. None of them are callable by `anon`.
-- =============================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql stable security invoker set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  )
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and status = 'approved'
  )
$$;

grant execute on function public.current_user_role()                              to authenticated;
grant execute on function public.is_admin()                                       to authenticated;
grant execute on function public.is_active_user()                                 to authenticated;
grant execute on function public.is_conversation_member(uuid)                     to authenticated;
grant execute on function public.job_owner(uuid)                                  to authenticated;
grant execute on function public.can_view_job(uuid)                               to authenticated;
grant execute on function public.can_view_profile(uuid)                           to authenticated;
grant execute on function public.can_worker_apply(uuid, uuid)                     to authenticated;
grant execute on function public.is_job_fully_staffed(uuid)                       to authenticated;
grant execute on function public.occupied_slot_count(uuid)                        to authenticated;
grant execute on function public.storage_owns_registration(text)                  to authenticated;
