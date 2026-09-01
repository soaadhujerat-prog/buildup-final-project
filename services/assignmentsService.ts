// =============================================================================
// BuildUp – Assignments service (Phase 5B · real staffing READ layer)
// =============================================================================
// Reads `assignments` from Supabase when USE_BACKEND=true. NO writes here —
// assignments are created ONLY by the SECURITY DEFINER RPC respond_to_application
// (029); the table has just a SELECT RLS policy, so a direct client
// insert/update/delete is impossible.
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
