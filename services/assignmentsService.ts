// =============================================================================
// BuildUp – Assignments service (Phase 5B READ layer + Phase 5C-2 lifecycle)
// =============================================================================
// Reads `assignments` from Supabase when USE_BACKEND=true. The table has only a
// SELECT RLS policy (008) and INSERT/UPDATE/DELETE are revoked from
// `authenticated`, so a direct client mutation is impossible. Every write goes
// through a SECURITY DEFINER RPC:
//   • create   — respond_to_application (029) / respond_to_invitation (030)
//   • cancel   — cancel_assignment (031)   active -> cancelled  (frees the slot)
//   • complete — complete_assignment (031) active -> completed  (KEEPS the slot)
//
// RLS `assignments_select` scopes rows to:
//   worker_id = auth.uid()  OR  contractor_id = auth.uid()  OR  is_admin()
// AppContext keeps the result in the same `assignments` array the staffing
// helpers (getStaffingProgress / isJobFullyStaffed, computed client-side) and
// every screen already read, so real capacity/progress lights up automatically.
// =============================================================================

import type { Assignment, AssignmentSource, AssignmentStatus } from '../types';

import { getSupabase } from './supabaseClient';

interface AssignmentRow {
  id: string;
  job_id: string;
  contractor_id: string;
  worker_id: string;
  source: AssignmentSource;
  source_id: string | null;
  status: AssignmentStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'worker' | 'contractor' | null;
  cancellation_message: string | null;
}

const ASSIGNMENT_SELECT =
  'id, job_id, contractor_id, worker_id, source, source_id, status, ' +
  'created_at, updated_at, completed_at, cancelled_at, cancelled_by, cancellation_message';

export function mapAssignmentRow(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    jobId: r.job_id,
    contractorId: r.contractor_id,
    workerId: r.worker_id,
    source: r.source,
    sourceId: r.source_id ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    cancelledBy: r.cancelled_by ?? undefined,
    cancellationMessage: r.cancellation_message ?? undefined,
  };
}

/** Every assignment row the current user may see (RLS decides): a worker's own,
 *  a contractor's own jobs', all for an admin. One flat list for AppContext. */
export async function listVisibleAssignments(): Promise<Assignment[]> {
  const { data, error } = await getSupabase()
    .from('assignments')
    .select(ASSIGNMENT_SELECT);
  if (error) throw error;
  return ((data as unknown as AssignmentRow[] | null) ?? []).map(mapAssignmentRow);
}

// ---------------------------------------------------------------------------
// Phase 5C-2 — lifecycle mutations (SECURITY DEFINER RPCs, migration 031)
// ---------------------------------------------------------------------------

/** Typed failure so the UI can show a clean Hebrew line per case instead of a
 *  raw Postgres/RLS error. */
export type AssignmentErrorCode =
  | 'not_active' // the assignment is already completed / cancelled
  | 'unauthorized' // not signed in / not the assigned worker / not the owning contractor
  | 'gone'; // assignment (or its job) no longer exists

export class AssignmentError extends Error {
  code: AssignmentErrorCode;
  constructor(code: AssignmentErrorCode) {
    super(code);
    this.name = 'AssignmentError';
    this.code = code;
  }
}

function unwrap(data: unknown): AssignmentRow {
  return (Array.isArray(data) ? data[0] : data) as AssignmentRow;
}

/** Clean Hebrew message for a cancel / complete failure (backend path). */
export function assignmentErrorText(e: unknown): string {
  if (e instanceof AssignmentError) {
    switch (e.code) {
      case 'not_active':
        return 'לא ניתן לעדכן שיבוץ שכבר הסתיים או בוטל.';
      case 'unauthorized':
        return 'אין לך הרשאה לבצע פעולה זו על השיבוץ.';
      case 'gone':
        return 'השיבוץ כבר לא קיים.';
    }
  }
  return 'הפעולה נכשלה. בדוק/י את החיבור ונסה/י שוב.';
}

/**
 * Cancel an `active` assignment (cancel_assignment RPC — 031). Caller must be
 * the assigned worker OR the owning approved contractor; the RPC derives
 * `cancelled_by`, stamps `cancelled_at`, stores the trimmed message, and locks
 * the job row so a cancel racing an accept can't corrupt capacity. Freeing the
 * slot lets `job_registration_state` reopen the job automatically (unless it is
 * status<>'open' or `closed_manually`). Returns the updated row.
 *   P0001 -> 'not_active'   · P0002 -> 'gone'   · 42501 -> 'unauthorized'
 */
export async function cancelAssignmentBackend(
  assignmentId: string,
  message?: string
): Promise<Assignment> {
  const trimmed = (message ?? '').trim();
  const { data, error } = await getSupabase().rpc('cancel_assignment', {
    p_assignment_id: assignmentId,
    p_message: trimmed ? trimmed : null,
  });
  if (error) {
    if (error.code === 'P0001') throw new AssignmentError('not_active');
    if (error.code === 'P0002') throw new AssignmentError('gone');
    if (error.code === '42501') throw new AssignmentError('unauthorized');
    throw error;
  }
  return mapAssignmentRow(unwrap(data));
}

/**
 * Mark an `active` assignment as `completed` (complete_assignment RPC — 031).
 * Owning approved contractor only. The slot STAYS occupied
 * (occupied_slot_count counts active + completed) — no capacity change, no
 * reopen. Only `status` + `completed_at` are written. Returns the updated row.
 *   P0001 -> 'not_active'   · P0002 -> 'gone'   · 42501 -> 'unauthorized'
 */
export async function completeAssignmentBackend(
  assignmentId: string
): Promise<Assignment> {
  const { data, error } = await getSupabase().rpc('complete_assignment', {
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (error.code === 'P0001') throw new AssignmentError('not_active');
    if (error.code === 'P0002') throw new AssignmentError('gone');
    if (error.code === '42501') throw new AssignmentError('unauthorized');
    throw error;
  }
  return mapAssignmentRow(unwrap(data));
}
