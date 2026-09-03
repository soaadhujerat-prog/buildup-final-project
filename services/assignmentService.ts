// =============================================================================
// Assignment service — pure, storage-agnostic functions for staffing logic.
// =============================================================================
// Called from AppContext today (in-memory arrays). The functions here don't
// know or care where the data lives, so swapping the in-memory arrays for
// Firestore collections later only means rewriting AppContext's plumbing,
// not these rules or any screen.
// =============================================================================

import { Application, Assignment, Invitation, JobPost } from '../types';

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}`;

export const hasActiveAssignment = (
  assignments: Assignment[],
  jobId: string,
  workerId: string
): boolean =>
  assignments.some(
    (a) => a.jobId === jobId && a.workerId === workerId && a.status === 'active'
  );

/**
 * The worker's own BLOCKING relationship to a job for the "הגש מועמדות"
 * (fresh application) flow — the part that the `applications`-row rules miss.
 * An accepted INVITATION creates an Assignment but NO application row, so a
 * worker can be fully staffed on a job while `can_worker_apply` / the
 * application-status branches still see "nothing" and offer "apply".
 *
 *   • 'active_assignment'    — staffed on this job right now (any source).
 *   • 'completed_assignment' — already finished this job (slot still theirs).
 *   • 'open_invitation'      — a pending/accepted invitation exists and the
 *                              worker has NO assignment history here yet
 *                              (respond to the invitation, don't re-apply).
 *   • null                   — no blocker from assignments/invitations; the
 *                              separate application-row rules still apply
 *                              (withdrawn → re-apply, cancelled placement →
 *                              existing reapply/explanation flow, etc.).
 *
 * Pure; capacity / global open state are NOT considered here.
 */
export type WorkerJobEngagement =
  | 'active_assignment'
  | 'completed_assignment'
  | 'open_invitation'
  | null;

export const getWorkerJobEngagement = (
  assignments: Assignment[],
  invitations: Invitation[],
  jobId: string,
  workerId: string
): WorkerJobEngagement => {
  const effective = getWorkerJobAssignment(assignments, jobId, workerId);
  if (effective?.status === 'active') return 'active_assignment';
  if (effective?.status === 'completed') return 'completed_assignment';
  // A cancelled placement (effective === 'cancelled', or any historical row)
  // is left to the existing application-status flow — never re-blocked here.
  const hasAssignmentHistory = assignments.some(
    (a) => a.jobId === jobId && a.workerId === workerId
  );
  if (hasAssignmentHistory) return null;
  const hasLiveInvitation = invitations.some(
    (i) =>
      i.jobId === jobId &&
      i.workerId === workerId &&
      (i.status === 'pending' || i.status === 'accepted')
  );
  return hasLiveInvitation ? 'open_invitation' : null;
};

export const buildAssignmentFromApplication = (
  application: Application,
  job: JobPost
): Assignment => ({
  id: newId('asg'),
  jobId: job.id,
  contractorId: job.contractorId,
  workerId: application.workerId,
  source: 'application',
  sourceId: application.id,
  status: 'active',
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export const buildAssignmentFromInvitation = (
  invitation: Invitation,
  job: JobPost
): Assignment => ({
  id: newId('asg'),
  jobId: job.id,
  contractorId: job.contractorId,
  workerId: invitation.workerId,
  source: 'invitation',
  sourceId: invitation.id,
  status: 'active',
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

/** The one Assignment that describes a given worker's CURRENT relationship
 *  to a job: the active one if it exists, otherwise the most recently
 *  updated historical record (completed / cancelled). Used wherever the UI
 *  must show "is this worker on the job right now" rather than "was their
 *  application/invitation ever accepted". */
export const getWorkerJobAssignment = (
  assignments: Assignment[],
  jobId: string,
  workerId: string
): Assignment | undefined => {
  const pair = assignments.filter(
    (a) => a.jobId === jobId && a.workerId === workerId
  );
  return (
    pair.find((a) => a.status === 'active') ??
    [...pair].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0]
  );
};

/** One record per UNIQUE worker who has any assignment history on this job —
 *  each worker's effective/current assignment (see getWorkerJobAssignment).
 *  Every staffing calculation iterates this list, never the raw collection,
 *  so the same worker can never be counted twice even when several historical
 *  rows exist for that worker+job. */
export const getEffectiveJobAssignments = (
  assignments: Assignment[],
  jobId: string
): Assignment[] => {
  const workerIds = new Set(
    assignments.filter((a) => a.jobId === jobId).map((a) => a.workerId)
  );
  const out: Assignment[] = [];
  workerIds.forEach((workerId) => {
    const a = getWorkerJobAssignment(assignments, jobId, workerId);
    if (a) out.push(a);
  });
  return out;
};

/** THE canonical "how many staffing slots are occupied" number. A COMPLETED
 *  assignment still holds its slot — the worker just finished their part, the
 *  contractor does not need a replacement. Only CANCELLED frees a slot. So an
 *  occupied slot = a unique worker whose effective assignment is `active` OR
 *  `completed`. Every capacity decision and the "X מתוך Y שובצו" number go
 *  through this. */
export const getOccupiedSlotCount = (
  assignments: Assignment[],
  jobId: string
): number =>
  getEffectiveJobAssignments(assignments, jobId).filter(
    (a) => a.status === 'active' || a.status === 'completed'
  ).length;

/** Unique workers CURRENTLY working on the job (effective status === 'active').
 *  Drives the secondary "עובדים כעת: N" line only — capacity is NOT derived
 *  from this (a completed worker still fills a slot); use getOccupiedSlotCount. */
export const getActiveAssignedWorkersCount = (
  assignments: Assignment[],
  jobId: string
): number =>
  getEffectiveJobAssignments(assignments, jobId).filter(
    (a) => a.status === 'active'
  ).length;

/** Canonical "is this job's staffing full?" check. `>=` (not `===`) so a
 *  bad-data over-count can never read as "still has room". Counts occupied
 *  slots (active + completed) — a job whose workers all finished is still
 *  full, not reopened. */
export const isJobFullyStaffed = (
  assignments: Assignment[],
  jobId: string,
  workersNeeded: number
): boolean =>
  getOccupiedSlotCount(assignments, jobId) >= Math.max(workersNeeded, 0);

export const getAssignmentsByJob = (
  assignments: Assignment[],
  jobId: string
): Assignment[] => assignments.filter((a) => a.jobId === jobId);

export const getAssignmentsByWorker = (
  assignments: Assignment[],
  workerId: string
): Assignment[] => assignments.filter((a) => a.workerId === workerId);

// =============================================================================
// Admin statistics — same effective/latest-per-(worker,job) rule as staffing.
// Never counts a (worker, job) pair twice; `cancelled` counts as neither
// "active" nor "worked". Screens must call these, not re-derive.
// =============================================================================

/** For an admin viewing a WORKER: how many unique jobs the worker is on right
 *  now vs. has finished. `activeJobs` = jobs whose effective assignment is
 *  'active'; `completedJobs` = jobs whose effective assignment is 'completed'.
 *  A job whose effective assignment is 'cancelled' is in neither. */
export const getWorkerAssignmentStats = (
  assignments: Assignment[],
  workerId: string
): { activeJobs: number; completedJobs: number } => {
  const scoped = assignments.filter((a) => a.workerId === workerId);
  const jobIds = new Set(scoped.map((a) => a.jobId));
  let activeJobs = 0;
  let completedJobs = 0;
  jobIds.forEach((jobId) => {
    const eff = getWorkerJobAssignment(scoped, jobId, workerId);
    if (!eff) return;
    if (eff.status === 'active') activeJobs += 1;
    else if (eff.status === 'completed') completedJobs += 1;
  });
  return { activeJobs, completedJobs };
};

/** For an admin viewing a CONTRACTOR: unique workers across all of that
 *  contractor's jobs. `activeWorkers` = workers with ≥1 effective 'active'
 *  assignment on any of the contractor's jobs; `everWorkedWorkers` = workers
 *  with ≥1 effective 'active' OR 'completed' assignment. A worker who only
 *  ever had a 'cancelled' assignment with this contractor counts in neither.
 *  The same worker on several of the contractor's jobs is still one worker. */
export const getContractorWorkforceStats = (
  assignments: Assignment[],
  contractorId: string
): { activeWorkers: number; everWorkedWorkers: number } => {
  const scoped = assignments.filter((a) => a.contractorId === contractorId);
  const jobsByWorker = new Map<string, Set<string>>();
  scoped.forEach((a) => {
    if (!jobsByWorker.has(a.workerId)) jobsByWorker.set(a.workerId, new Set());
    jobsByWorker.get(a.workerId)!.add(a.jobId);
  });
  let activeWorkers = 0;
  let everWorkedWorkers = 0;
  jobsByWorker.forEach((jobIds, workerId) => {
    let isActive = false;
    let hasWorked = false;
    jobIds.forEach((jobId) => {
      const eff = getWorkerJobAssignment(scoped, jobId, workerId);
      if (!eff) return;
      if (eff.status === 'active') {
        isActive = true;
        hasWorked = true;
      } else if (eff.status === 'completed') {
        hasWorked = true;
      }
    });
    if (isActive) activeWorkers += 1;
    if (hasWorked) everWorkedWorkers += 1;
  });
  return { activeWorkers, everWorkedWorkers };
};

export type StaffingStatus = 'not_started' | 'in_progress' | 'completed';

export interface StaffingProgress {
  /** Occupied slots = active + completed unique workers. THE "X" in
   *  "X מתוך Y שובצו". */
  filled: number;
  /** job.workersNeeded / requiredWorkers — NEVER changes when a worker
   *  completes or is cancelled. THE "Y". */
  needed: number;
  /** Unique workers currently working (subset of `filled`). */
  active: number;
  /** Unique workers who finished their part (subset of `filled`). */
  completed: number;
  /** Slots a new worker is still needed for = max(needed - filled, 0). Only
   *  a cancellation ever raises this. */
  missing: number;
  percent: number; // 0..100
  status: StaffingStatus;
  label: string;
}

const STATUS_LABELS: Record<StaffingStatus, string> = {
  not_started: 'טרם שובצו עובדים',
  in_progress: 'השיבוץ בתהליך',
  completed: 'השיבוץ הושלם',
};

/** The one place that turns "assignments for a job" + "workers needed" into
 *  the X/Y staffing summary every screen shows. Never compute this from
 *  application/invitation counts — only from active Assignments. */
export const getStaffingProgress = (
  assignments: Assignment[],
  jobId: string,
  workersNeeded: number
): StaffingProgress => {
  const effective = getEffectiveJobAssignments(assignments, jobId);
  const active = effective.filter((a) => a.status === 'active').length;
  const completed = effective.filter((a) => a.status === 'completed').length;
  const filled = active + completed;
  const needed = Math.max(workersNeeded, 0);
  const missing = Math.max(needed - filled, 0);
  const percent =
    needed > 0 ? Math.min(100, Math.round((filled / needed) * 100)) : 0;
  const status: StaffingStatus =
    needed > 0 && filled >= needed
      ? 'completed'
      : filled > 0
      ? 'in_progress'
      : 'not_started';
  return {
    filled,
    needed,
    active,
    completed,
    missing,
    percent,
    status,
    label: STATUS_LABELS[status],
  };
};

// =============================================================================
// Worker <-> Contractor relationship + shared work history
// =============================================================================
// Derived ONLY from real Assignment records — never from applications /
// invitations. Three states, priority active > completed > never:
//   • 'current' — at least one ACTIVE shared assignment ("עובדים יחד כעת")
//   • 'past'    — no active, but at least one COMPLETED ("עבדתם יחד בעבר")
//   • 'never'   — neither ("טרם עבדתם יחד"). A CANCELLED-only shared
//                 assignment stays 'never': a cancelled staffing is history
//                 but is NOT proof the two ever actually worked together.
// =============================================================================

export type WorkerContractorRelationship = 'never' | 'current' | 'past';

/** Every job this worker and contractor have shared, as ONE effective
 *  assignment per job (never two rows for the same job), newest first. */
export const getSharedJobAssignments = (
  assignments: Assignment[],
  workerId: string,
  contractorId: string
): Assignment[] => {
  const jobIds = new Set(
    assignments
      .filter(
        (a) => a.workerId === workerId && a.contractorId === contractorId
      )
      .map((a) => a.jobId)
  );
  const out: Assignment[] = [];
  jobIds.forEach((jobId) => {
    const a = getWorkerJobAssignment(assignments, jobId, workerId);
    if (a) out.push(a);
  });
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const getWorkerContractorRelationship = (
  assignments: Assignment[],
  workerId: string,
  contractorId: string
): WorkerContractorRelationship => {
  const shared = getSharedJobAssignments(assignments, workerId, contractorId);
  if (shared.some((a) => a.status === 'active')) return 'current';
  if (shared.some((a) => a.status === 'completed')) return 'past';
  return 'never';
};

export interface SharedWorkHistory {
  current: Assignment[]; // status === 'active'
  completed: Assignment[]; // status === 'completed'
  cancelled: Assignment[]; // status === 'cancelled' — shown apart, never counted
  /** Real shared jobs = active + completed. Cancelled is excluded. */
  count: number;
  relationship: WorkerContractorRelationship;
}

export const getSharedWorkHistory = (
  assignments: Assignment[],
  workerId: string,
  contractorId: string
): SharedWorkHistory => {
  const shared = getSharedJobAssignments(assignments, workerId, contractorId);
  const current = shared.filter((a) => a.status === 'active');
  const completed = shared.filter((a) => a.status === 'completed');
  const cancelled = shared.filter((a) => a.status === 'cancelled');
  return {
    current,
    completed,
    cancelled,
    count: current.length + completed.length,
    relationship: current.length
      ? 'current'
      : completed.length
      ? 'past'
      : 'never',
  };
};
