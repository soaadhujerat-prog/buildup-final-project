// =============================================================================
// BuildUp – Applications service (Phase 5A · real job-application layer)
// =============================================================================
// Real Supabase reads/writes for the APPLICATION domain when USE_BACKEND=true.
// The mock path (AppContext + MOCK_APPLICATIONS) is untouched.
//
// SECURITY MODEL — all server-authoritative, nothing re-implemented here:
//   • submit  = plain INSERT. RLS `applications_insert` enforces
//       worker_id = auth.uid() + is_active_user() + can_worker_apply(job,worker)
//       (job open, not full, no row already in the current recruitment_cycle);
//       the `applications_set_cycle` BEFORE INSERT trigger stamps
//       recruitment_cycle from the job; the UNIQUE (job,worker,cycle) index is
//       the last-resort duplicate guard. The client only supplies job_id +
//       message; worker_id is auth.uid() and recruitment_cycle is a placeholder
//       the trigger overwrites — neither can be forged.
//   • read    = plain SELECT. RLS `applications_select` scopes rows to
//       worker_id = auth.uid()  OR  job_owner(job_id)  OR  is_admin().
//   • withdraw = withdraw_application RPC (025) — the only sanctioned
//       worker-side status transition (pending -> withdrawn, own row only).
// No privileged column (status / recruitment_cycle / responded_at /
// contractor_response) is ever written from the client.
// =============================================================================

import type { Application, ApplicationStatus } from '../types';

import { getSupabase } from './supabaseClient';

interface ApplicationRow {
  id: string;
  job_id: string;
  worker_id: string;
  message: string | null;
  applied_at: string;
  responded_at: string | null;
  withdrawn_at: string | null;
  contractor_response: string | null;
  status: ApplicationStatus;
}

const APPLICATION_SELECT =
  'id, job_id, worker_id, message, applied_at, responded_at, withdrawn_at, ' +
  'contractor_response, status';

export function mapApplicationRow(r: ApplicationRow): Application {
  return {
    id: r.id,
    jobId: r.job_id,
    workerId: r.worker_id,
    message: r.message ?? undefined,
    appliedAt: r.applied_at,
    respondedAt: r.responded_at ?? undefined,
    withdrawnAt: r.withdrawn_at ?? undefined,
    contractorResponse: r.contractor_response ?? undefined,
    status: r.status,
  };
}

/** Typed failure for the apply / withdraw flows so the UI can show a clean
 *  Hebrew message per case instead of a raw Postgres/RLS error. */
export type ApplicationErrorCode =
  | 'duplicate' // already applied in the current recruitment cycle
  | 'ineligible' // job closed / full / not an active worker (RLS refused)
  | 'unauthorized' // not signed in / not the owning worker
  | 'not_pending'; // withdraw attempted on a non-pending application

export class ApplicationError extends Error {
  code: ApplicationErrorCode;
  constructor(code: ApplicationErrorCode) {
    super(code);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

/**
 * Every application row the current user is allowed to see (RLS decides):
 *   • worker  → their own applications, all jobs / all cycles
 *   • contractor → applications on jobs they own
 *   • admin   → all
 * One flat list; AppContext keeps it in the same `applications` array the
 * screens already read, so every existing selector/derivation keeps working.
 */
export async function listVisibleApplications(): Promise<Application[]> {
  const { data, error } = await getSupabase()
    .from('applications')
    .select(APPLICATION_SELECT);
  if (error) throw error;
  return ((data as unknown as ApplicationRow[] | null) ?? []).map(mapApplicationRow);
}

/**
 * Submit an application for the authenticated worker. `recruitment_cycle` is a
 * placeholder overwritten by the DB trigger. Returns the persisted row.
 */
export async function applyToJobBackend(
  jobId: string,
  message?: string
): Promise<Application> {
  const sb = getSupabase();
  const { data: authData } = await sb.auth.getUser();
  const uid = authData.user?.id;
  if (!uid) throw new ApplicationError('unauthorized');

  const trimmed = (message ?? '').trim();
  const { data, error } = await sb
    .from('applications')
    .insert({
      job_id: jobId,
      worker_id: uid,
      recruitment_cycle: 0, // placeholder — applications_set_cycle trigger sets the real value
      message: trimmed ? trimmed : null,
    })
    .select(APPLICATION_SELECT)
    .single();

  if (error) {
    // The applications_insert policy runs can_worker_apply() inside its
    // WITH CHECK, so "already applied in the current cycle" (a pending, or a
    // withdrawn/rejected row — review decision #9) surfaces as an RLS refusal
    // (42501), not as the unique-index 23505. Disambiguate by reading the
    // worker's own rows (always readable) against the job's current cycle.
    if (error.code === '42501' || error.code === '23505') {
      const [{ data: mine }, { data: jobRow }] = await Promise.all([
        sb.from('applications').select('recruitment_cycle').eq('job_id', jobId).eq('worker_id', uid),
        sb.from('jobs').select('recruitment_cycle').eq('id', jobId).maybeSingle(),
      ]);
      const cycle = (jobRow as { recruitment_cycle: number } | null)?.recruitment_cycle;
      const alreadyThisCycle = ((mine as Array<{ recruitment_cycle: number }> | null) ?? []).some(
        (r) => r.recruitment_cycle === cycle
      );
      throw new ApplicationError(alreadyThisCycle ? 'duplicate' : 'ineligible');
    }
    throw error;
  }
  return mapApplicationRow(data as unknown as ApplicationRow);
}

/**
 * Reactivate the worker's OWN current-cycle `withdrawn` application (028 RPC) —
 * the same row flips back to 'pending' with a fresh `applied_at` and the newly
 * submitted message; recruitment_cycle / worker_id / job_id are untouched and
 * no second row is created. The RPC re-checks eligibility, so a job that
 * closed or filled meanwhile still rejects. Returns the reactivated row.
 */
export async function reapplyToJobBackend(
  jobId: string,
  message?: string
): Promise<Application> {
  const trimmed = (message ?? '').trim();
  const { data, error } = await getSupabase().rpc('reapply_to_job', {
    p_job_id: jobId,
    p_message: trimmed ? trimmed : null,
  });
  if (error) {
    // P0001 = row not withdrawn · P0002 = no current-cycle row · 42501 = job
    // closed/full/worker not active. All surface as "can't apply right now".
    if (['P0001', 'P0002', '42501'].includes(error.code ?? '')) {
      throw new ApplicationError('ineligible');
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return mapApplicationRow(row as unknown as ApplicationRow);
}

/**
 * Withdraw the worker's own still-`pending` application (025 RPC). History is
 * preserved — the row flips to 'withdrawn', it is never deleted.
 */
export async function withdrawApplicationBackend(
  applicationId: string
): Promise<void> {
  const { error } = await getSupabase().rpc('withdraw_application', {
    p_application_id: applicationId,
  });
  if (error) {
    if (error.code === 'P0001') throw new ApplicationError('not_pending');
    if (error.code === '42501') throw new ApplicationError('unauthorized');
    throw error;
  }
}
