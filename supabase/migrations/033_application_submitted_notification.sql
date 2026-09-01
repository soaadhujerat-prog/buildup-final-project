-- =============================================================================
-- 033 · contractor notification on a new application (Phase 6 parity fix)
-- =============================================================================
-- CONFIRMED GAP: a worker's apply is a plain client INSERT gated by RLS
-- (`applications_insert`, 008) + the `applications_set_cycle` BEFORE INSERT
-- trigger (009) — there is NO SECURITY DEFINER RPC in the fresh-apply path to
-- hang a `perform public.notify(...)` off of (unlike accept/reject/invite,
-- which are all RPCs — migration 032). The authoritative, transactional place
-- to notify the owning contractor is therefore a new AFTER INSERT OR UPDATE
-- trigger on `applications` itself — the same architecture 009 already uses
-- for `applications_set_cycle` / `assignments_reconcile`. It runs in the SAME
-- transaction as the client's INSERT (or the `reapply_to_job` RPC's UPDATE),
-- so a rolled-back apply produces zero notifications.
--
-- Fires the notification for exactly two transitions:
--   • INSERT of a 'pending' row            — a fresh apply (025).
--   • UPDATE 'withdrawn' -> 'pending'      — a successful reapply
--     (`reapply_to_job`, 028) reactivating the SAME row; the contractor's
--     pending queue gains this candidate again, so it is treated as a new
--     candidate event just like a fresh apply.
-- Every other UPDATE on `applications` (pending->accepted/rejected via
-- respond_to_application 029/032, pending->withdrawn via withdraw_application
-- 025) is explicitly ignored — no extra notification.
--
-- IDEMPOTENCY: `public.notify` (032) is INSERT ... ON CONFLICT (user_id,
-- dedupe_key) DO NOTHING. dedupe_key includes `applied_at` (server-stamped,
-- refreshed by reapply_to_job) so a fresh apply and a later reapply of the
-- SAME row get two DIFFERENT keys (two real events) while any accidental
-- re-fire of the identical event collapses to one row. A duplicate/blocked
-- apply attempt never reaches INSERT (RLS `can_worker_apply` / the UNIQUE
-- index refuse it first) — the trigger never runs, so zero notifications.
--
-- PRIVACY: only the worker's `full_name` and the job's `title` are read; no
-- ID/contact data. No schema change, no RLS change, no new client permission —
-- `notifications` stays INSERT-blocked for `authenticated` (008); this trigger
-- is SECURITY DEFINER like `assignments_reconcile`, and `public.notify` itself
-- is still EXECUTE-revoked from every client role (032).
-- =============================================================================

create or replace function public.applications_notify_contractor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job   public.jobs%rowtype;
  v_wname text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if not (old.status = 'withdrawn' and new.status = 'pending') then
      return new;
    end if;
  else
    return new;
  end if;

  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  select full_name into v_wname from public.profiles where id = new.worker_id;

  perform public.notify(
    v_job.contractor_id,
    'job_application',
    'מועמדות חדשה התקבלה',
    coalesce(nullif(btrim(v_wname), ''), 'עובד')
      || ' הגיש/ה מועמדות למשרה "' || coalesce(v_job.title, '') || '".',
    v_job.id::text,
    'app_submitted:' || new.id::text || ':' || extract(epoch from new.applied_at)::text
  );

  return new;
end;
$$;

create trigger applications_notify_contractor_after_change
  after insert or update on public.applications
  for each row execute function public.applications_notify_contractor();
