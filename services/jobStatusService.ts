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

export interface RegistrationStatusInfo {
  label: string;
  tone: 'success' | 'info';
}

/** The business-logic source of truth for "is this job still open to new
 *  applications?" — label/color derivations (getRegistrationStatus) must
 *  read through this, never re-check `acceptingApplications` on their own. */
export const isOpenForApplications = (
  job: Pick<JobPost, 'acceptingApplications'>
): boolean => job.acceptingApplications === true;

export const getRegistrationStatus = (
  job: Pick<JobPost, 'acceptingApplications'>
): RegistrationStatusInfo =>
  isOpenForApplications(job)
    ? { label: 'פתוחה להרשמה', tone: 'success' }
    : { label: 'סגורה להרשמה', tone: 'info' };
