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
