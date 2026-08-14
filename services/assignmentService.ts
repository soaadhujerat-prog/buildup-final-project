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
  const filled = assignments.filter(
    (a) => a.jobId === jobId && a.status === 'active'
  ).length;
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
