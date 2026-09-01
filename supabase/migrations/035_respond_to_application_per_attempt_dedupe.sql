-- =============================================================================
-- 035 · respond_to_application: per-ATTEMPT notification dedupe key (Phase 6 fix)
-- =============================================================================
-- BUG. Migration 032 keyed the accept/reject notifications on the application
-- id alone:
--     'app_accepted:' || application_id
--     'app_rejected:' || application_id
-- That was fine while an application row was answered at most once. But
-- `reapply_to_job` (028) and `reapply_after_cancellation` (034) REACTIVATE the
-- SAME row for a new candidacy, so a second legitimate acceptance/rejection of
-- that row produced the identical key and `public.notify`'s
-- `ON CONFLICT (user_id, dedupe_key) DO NOTHING` (032) silently dropped it — no
-- new in-app notification, and therefore no new acceptance/rejection email from
-- the notify-email webhook.
--
-- FIX (minimal). Add a per-attempt identifier to the key:
--     'app_accepted:' || application_id || ':' || epoch(applied_at)
--     'app_rejected:' || application_id || ':' || epoch(applied_at)
-- `applications.applied_at` is the right attempt identifier:
--   • server-controlled — DB default now() on INSERT; reset to now() by
--     reapply_to_job (028) and reapply_after_cancellation (034). Never client
--     supplied.
--   • changes on every legitimate reapply (both RPCs refresh it).
--   • STABLE during a duplicate / stale response to the same attempt —
--     respond_to_application writes only status / responded_at /
--     contractor_response, never applied_at. A rapid second accept also hits
--     `status <> 'pending'` and raises P0001 before reaching notify(), so the
--     idempotency is belt-and-suspenders.
-- This is exactly the scheme migrations 033 (`app_submitted:<id>:<epoch>`) and
-- 034 already use — all three application-event keys are now consistent.
--
-- The notify-email webhook never inspects dedupe_key (it fires per INSERT on
-- notifications, filters on `type`), so a new distinct key => new row => new
-- email, with no webhook change.
--
-- EVERYTHING ELSE in respond_to_application is byte-for-byte unchanged from
-- 029/032: same business rules, same job-row FOR UPDATE lock, same capacity
-- check, same assignment INSERT, same error codes, same return value. Only the
-- two dedupe_key string literals change. The notifications unique constraint is
-- untouched. Forward-only.
-- =============================================================================

create or replace function public.respond_to_application(
  p_application_id uuid,
  p_accept         boolean,
  p_response       text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_app  public.applications;
  v_job  public.jobs;
  v_resp text := nullif(btrim(coalesce(p_response, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if v_app.id is null then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs where id = v_app.job_id for update;
  if v_job.id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.contractor_id <> v_uid then
    raise exception 'not authorized for this job' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contractor_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where cp.profile_id = v_uid and p.status = 'approved'
  ) then
    raise exception 'not an approved contractor' using errcode = '42501';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'application is % and cannot be responded to', v_app.status
      using errcode = 'P0001';
  end if;
  if v_app.recruitment_cycle <> v_job.recruitment_cycle then
    raise exception 'application belongs to a past recruitment cycle'
      using errcode = 'P0001';
  end if;

  if p_accept then
    if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
      raise exception 'job % is fully staffed', v_job.id using errcode = 'check_violation';
    end if;

    insert into public.assignments (job_id, contractor_id, worker_id, source, source_id, status)
    values (v_job.id, v_uid, v_app.worker_id, 'application', v_app.id, 'active');

    update public.applications set
      status              = 'accepted',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;

    perform public.notify(
      v_app.worker_id, 'application_accepted',
      'הבקשה שלך אושרה',
      'הבקשה שלך למשרה "' || coalesce(v_job.title, '') || '" אושרה ושובצת למשרה.'
        || case when v_resp is not null then E'\nהודעת הקבלן: "' || v_resp || '"' else '' end,
      v_job.id::text,
      'app_accepted:' || v_app.id::text || ':' || extract(epoch from v_app.applied_at)::text
    );
  else
    update public.applications set
      status              = 'rejected',
      responded_at        = now(),
      contractor_response = v_resp
    where id = p_application_id
    returning * into v_app;

    perform public.notify(
      v_app.worker_id, 'application_rejected',
      'הבקשה שלך נדחתה',
      'התקבלה החלטה לגבי הבקשה שלך למשרה "' || coalesce(v_job.title, '') || '".'
        || case when v_resp is not null then E'\nהודעת הקבלן: "' || v_resp || '"' else '' end,
      v_job.id::text,
      'app_rejected:' || v_app.id::text || ':' || extract(epoch from v_app.applied_at)::text
    );
  end if;

  return v_app;
end;
$$;
revoke execute on function public.respond_to_application(uuid, boolean, text) from public, anon;
grant  execute on function public.respond_to_application(uuid, boolean, text) to authenticated;
