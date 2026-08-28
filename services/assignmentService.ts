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

/** THE canonical "how many workers are actually staffed on this job right
 *  now" number. Counts only `active` Assignment records — never pending /
 *  rejected / withdrawn applications or pending / declined / cancelled
 *  invitations. Every capacity decision in the app must go through this. */
export const getActiveAssignedWorkersCount = (
  assignments: Assignment[],
  jobId: string
): number =>
  assignments.filter((a) => a.jobId === jobId && a.status === 'active').length;

/** Canonical "is this job's staffing full?" check. `>=` (not `===`) so a
 *  bad-data over-count can never read as "still has room". */
export const isJobFullyStaffed = (
  assignments: Assignment[],
  jobId: string,
  workersNeeded: number
): boolean =>
  getActiveAssignedWorkersCount(assignments, jobId) >=
  Math.max(workersNeeded, 0);

/** The one Assignment that describes a given worker's CURRENT relationship
 *  to a job: the active one if it exists, otherwise the most recently
 *  updated historical record (cancelled / completed). Used wherever the UI
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
  filled: number;
  needed: number;
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
  const filled = getActiveAssignedWorkersCount(assignments, jobId);
  const needed = Math.max(workersNeeded, 0);
  const percent =
    needed > 0 ? Math.min(100, Math.round((filled / needed) * 100)) : 0;
  const status: StaffingStatus =
    needed > 0 && filled >= needed
      ? 'completed'
      : filled > 0
      ? 'in_progress'
      : 'not_started';
  return { filled, needed, percent, status, label: STATUS_LABELS[status] };
};
