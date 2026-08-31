-- =============================================================================
-- 009 · derived view, staffing progress, pair-key helper, triggers
-- =============================================================================
-- job_registration_state is the ONLY source for "is this job open for
-- applications" — it is computed, never stored (review decision #4). Triggers
-- keep invitations / conversations / notifications consistent but never write
-- an "accepting applications" flag.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- derived registration state (no stored boolean; decision #4)
-- ---------------------------------------------------------------------------
create view public.job_registration_state
with (security_invoker = true) as
select
  j.id                                          as job_id,
  j.workers_needed,
  j.closed_manually,
  j.recruitment_cycle,
  c.filled_count,
  greatest(j.workers_needed - c.filled_count, 0) as remaining_slots,
  (c.filled_count >= j.workers_needed)           as is_full,
  (
    j.status = 'open'
    and not j.closed_manually
    and c.filled_count < j.workers_needed
  )                                             as open_for_applications,
  case
    when j.closed_manually                     then 'manual'::public.job_closure_reason
    when c.filled_count >= j.workers_needed     then 'capacity'::public.job_closure_reason
    else null
  end                                          as closure_reason
from public.jobs j
cross join lateral (select public.occupied_slot_count(j.id) as filled_count) c;

grant select on public.job_registration_state to authenticated;

-- ---------------------------------------------------------------------------
-- staffing progress (X of Y + status), from assignments only
-- ---------------------------------------------------------------------------
create or replace function public.staffing_progress(p_job_id uuid)
returns table (
  filled    int,
  needed    int,
  active    int,
  completed int,
  missing   int,
  percent   int,
  status    text
)
language sql stable security definer set search_path = ''
as $$
  with j as (
    select coalesce((select workers_needed from public.jobs where id = p_job_id), 0) as needed
  ),
  eff as (
    select distinct on (a.worker_id) a.worker_id, a.status
    from public.assignments a
    where a.job_id = p_job_id
    order by a.worker_id, a.updated_at desc, a.created_at desc
  ),
  c as (
    select
      coalesce(count(*) filter (where status = 'active'), 0)::int    as active,
      coalesce(count(*) filter (where status = 'completed'), 0)::int as completed
    from eff
  )
  select
    (c.active + c.completed)                                                as filled,
    j.needed                                                                as needed,
    c.active,
    c.completed,
    greatest(j.needed - (c.active + c.completed), 0)                        as missing,
    case when j.needed > 0
         then least(100, round((c.active + c.completed)::numeric / j.needed * 100))::int
         else 0 end                                                        as percent,
    case
      when j.needed > 0 and (c.active + c.completed) >= j.needed then 'completed'
      when (c.active + c.completed) > 0                          then 'in_progress'
      else 'not_started'
    end                                                                    as status
  from c, j
$$;

grant execute on function public.staffing_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- deterministic 1:1 conversation key (used by the Phase 8 RPC)
-- ---------------------------------------------------------------------------
create or replace function public.conversation_pair_key(a uuid, b uuid)
returns text
language sql immutable set search_path = ''
as $$
  select least(a::text, b::text) || ':' || greatest(a::text, b::text)
$$;

grant execute on function public.conversation_pair_key(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- trigger: applications.recruitment_cycle always follows the job's cycle
-- ---------------------------------------------------------------------------
create or replace function public.applications_set_cycle()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.recruitment_cycle := coalesce(
    (select recruitment_cycle from public.jobs where id = new.job_id), 1
  );
  return new;
end;
$$;
create trigger applications_set_cycle_before_insert
  before insert on public.applications
  for each row execute function public.applications_set_cycle();

-- ---------------------------------------------------------------------------
-- trigger: overbooking guard on new active assignments (decision #4)
-- ---------------------------------------------------------------------------
create or replace function public.assignments_capacity_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_needed int;
begin
  if new.status = 'active' then
    select workers_needed into v_needed from public.jobs where id = new.job_id;
    if not exists (
      select 1 from public.assignments a
      where a.job_id = new.job_id
        and a.worker_id = new.worker_id
        and a.status in ('active', 'completed')
    )
    and public.occupied_slot_count(new.job_id) >= coalesce(v_needed, 0) then
      raise exception 'assignment rejected: job % is fully staffed', new.job_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger assignments_capacity_guard_before_insert
  before insert on public.assignments
  for each row execute function public.assignments_capacity_guard();

-- ---------------------------------------------------------------------------
-- trigger: when a job fills up, auto-cancel its pending invitations + notify.
-- Never writes any "open for applications" flag (decision #4).
-- ---------------------------------------------------------------------------
create or replace function public.assignments_reconcile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  inv   record;
begin
  select * into v_job from public.jobs where id = coalesce(new.job_id, old.job_id);
  if v_job.id is null then
    return coalesce(new, old);
  end if;

  if public.occupied_slot_count(v_job.id) >= v_job.workers_needed then
    for inv in
      select * from public.invitations
      where job_id = v_job.id and status = 'pending'
    loop
      update public.invitations
        set status              = 'cancelled',
            cancelled_at        = now(),
            cancellation_reason = 'capacity_full'
        where id = inv.id;

      insert into public.notifications (user_id, type, title, body, related_id)
      values (
        inv.worker_id,
        'invitation_cancelled',
        'ההזמנה למשרה נסגרה',
        'המשרה "' || coalesce(v_job.title, '') || '" אוישה במלואה ולכן ההזמנה אינה פעילה עוד.',
        inv.id::text
      );
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;
create trigger assignments_reconcile_after_change
  after insert or update on public.assignments
  for each row execute function public.assignments_reconcile();

-- ---------------------------------------------------------------------------
-- trigger: keep conversations.last_message* current (inbox ordering only)
-- ---------------------------------------------------------------------------
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations
    set last_message    = new.content,
        last_message_at = new.created_at,
        updated_at      = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_touch_conversation_after_insert
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ---------------------------------------------------------------------------
-- trigger: a closed support ticket accepts no more messages
-- ---------------------------------------------------------------------------
create or replace function public.support_messages_block_when_closed()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.support_tickets t
    where t.id = new.ticket_id and t.is_closed
  ) then
    raise exception 'support ticket % is closed to new messages', new.ticket_id;
  end if;
  return new;
end;
$$;
create trigger support_messages_block_when_closed_before_insert
  before insert on public.support_ticket_messages
  for each row execute function public.support_messages_block_when_closed();

-- ---------------------------------------------------------------------------
-- trigger: a job may be hard-deleted only when it has zero activity
-- ---------------------------------------------------------------------------
create or replace function public.jobs_block_delete_with_activity()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.applications where job_id = old.id)
  or exists (select 1 from public.invitations  where job_id = old.id)
  or exists (select 1 from public.assignments  where job_id = old.id) then
    raise exception 'job % has activity and cannot be deleted (close registration instead)', old.id;
  end if;
  return old;
end;
$$;
create trigger jobs_block_delete_with_activity_before_delete
  before delete on public.jobs
  for each row execute function public.jobs_block_delete_with_activity();
