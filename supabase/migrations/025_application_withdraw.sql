-- =============================================================================
-- 025 · worker withdraw application (Phase 5A)
-- =============================================================================
-- Phase 5A moves the APPLICATION domain to real Supabase. Submitting is a plain
-- RLS-checked client INSERT (policy `applications_insert` already enforces
-- worker_id = auth.uid() + is_active_user() + can_worker_apply(); the
-- `applications_set_cycle` BEFORE INSERT trigger stamps recruitment_cycle from
-- the job; the UNIQUE (job_id, worker_id, recruitment_cycle) index blocks a
-- second application in the same cycle). No new function is needed for apply.
--
-- WITHDRAW is different: the existing `applications_update` policy allows the
-- owning worker to UPDATE their row but does NOT constrain which column or which
-- status transition — a raw client update could set status='accepted'. This
-- narrow SECURITY DEFINER RPC is the ONLY sanctioned worker-side transition: it
-- verifies ownership + that the row is still 'pending', then flips it to
-- 'withdrawn' (history preserved, never deleted — review decision in 005). It
-- touches only status + withdrawn_at.
--
-- No schema / RLS / trigger change. No capacity or recruitment_cycle write.
-- Security model = 022/023: SECURITY DEFINER, search_path '', EXECUTE to
-- `authenticated` only.
-- =============================================================================

create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_worker uuid;
  v_status public.application_status;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select worker_id, status into v_worker, v_status
  from public.applications where id = p_application_id;

  if v_worker is null then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;
  if v_worker <> v_uid then
    raise exception 'not your application' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'only a pending application can be withdrawn' using errcode = 'P0001';
  end if;

  update public.applications
     set status = 'withdrawn', withdrawn_at = now()
   where id = p_application_id;
end;
$$;
revoke execute on function public.withdraw_application(uuid) from public, anon;
grant  execute on function public.withdraw_application(uuid) to authenticated;
