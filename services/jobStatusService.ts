// =============================================================================
// Job status service — the one place that labels a job's REGISTRATION status.
// =============================================================================
// A job has two completely separate status concepts that must never be
// mixed:
//   1. Registration status — is the job still accepting new applications?
//      Driven by `job.acceptingApplications`. Labels: "פתוחה להרשמה" /
//      "סגורה להרשמה". This file.
//   2. Staffing status — how many workers are actually assigned so far?
//      Driven by real Assignment records. Labels: "טרם שובצו עובדים" /
//      "השיבוץ בתהליך" / "השיבוץ הושלם" / "X מתוך Y שובצו". See
//      services/assignmentService.ts (getStaffingProgress).
// Every screen that shows a job card/row must call getRegistrationStatus()
// for the first concept instead of re-deriving its own label — that's what
// caused the same job to show "פתוחה להרשמה" on one screen and "בתהליך" (a
// third, unrelated concept — job.status lifecycle) on another.
// =============================================================================

import { JobPost } from '../types';

// Capacity helpers live in assignmentService (staffing domain). Re-exported
// here so any screen asking "can this job take another worker?" has a single
// import site alongside isOpenForApplications and never re-implements the rule.
export {
  getActiveAssignedWorkersCount,
  isJobFullyStaffed,
} from './assignmentService';

export interface RegistrationStatusInfo {
  label: string;
  tone: 'success' | 'info';
}

/** The business-logic source of truth for "is this job still open to new
 *  applications?" — label/color derivations (getRegistrationStatus) must
 *  read through this, never re-check `acceptingApplications` on their own.
 *
 *  `acceptingApplications` is kept in sync with staffing capacity by
 *  AppContext: the moment active assignments reach `workersNeeded` the job
 *  is auto-closed (registrationClosureReason: 'capacity'); if an assignment
 *  is later removed and it had been auto-closed, it reopens. A contractor's
 *  manual close (reason: 'manual') is never reopened automatically. So this
 *  one boolean already reflects capacity — callers don't need to re-check
 *  the assignment count themselves. */
export const isOpenForApplications = (
  job: Pick<JobPost, 'acceptingApplications'>
): boolean => job.acceptingApplications === true;

export const getRegistrationStatus = (
  job: Pick<JobPost, 'acceptingApplications'>
): RegistrationStatusInfo =>
  isOpenForApplications(job)
    ? { label: 'פתוחה להרשמה', tone: 'success' }
    : { label: 'סגורה להרשמה', tone: 'info' };
