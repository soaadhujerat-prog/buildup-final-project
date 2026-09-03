// =============================================================================
// Unit tests — services/assignmentService.getWorkerJobEngagement (pure logic)
// =============================================================================
// Locks in the worker-specific "can this worker still file a fresh application
// for this job" rule that the `applications`-row checks miss:
//   • an ACCEPTED INVITATION creates an Assignment but NO application row, so a
//     staffed worker must still be recognised as "already engaged".
//   • a COMPLETED assignment blocks a re-apply to the same job.
//   • a live (pending / accepted) invitation with no assignment history yet
//     blocks a fresh apply — respond to the invitation instead.
//   • a CANCELLED placement is deliberately NOT re-blocked here (the existing
//     application-status / reapply flow decides).
// No credential / UUID / key appears in this file.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  getWorkerJobEngagement,
  type WorkerJobEngagement,
} from '../services/assignmentService';
import type { Assignment, Invitation } from '../types';

const JOB = 'job-1';
const OTHER_JOB = 'job-2';
const WORKER = 'worker-1';
const OTHER_WORKER = 'worker-2';

const asg = (over: Partial<Assignment>): Assignment => ({
  id: `a-${Math.random().toString(36).slice(2, 8)}`,
  jobId: JOB,
  contractorId: 'c-1',
  workerId: WORKER,
  source: 'invitation',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const inv = (over: Partial<Invitation>): Invitation => ({
  id: `i-${Math.random().toString(36).slice(2, 8)}`,
  jobId: JOB,
  contractorId: 'c-1',
  workerId: WORKER,
  sentAt: '2026-01-01T00:00:00.000Z',
  status: 'pending',
  ...over,
});

const call = (
  assignments: Assignment[],
  invitations: Invitation[]
): WorkerJobEngagement =>
  getWorkerJobEngagement(assignments, invitations, JOB, WORKER);

describe('getWorkerJobEngagement', () => {
  it('returns null when the worker has no assignment and no invitation for the job', () => {
    expect(call([], [])).toBeNull();
  });

  it('active assignment from an INVITATION (no application row) → "active_assignment"', () => {
    expect(call([asg({ source: 'invitation', status: 'active' })], [])).toBe(
      'active_assignment'
    );
  });

  it('active assignment from an APPLICATION also → "active_assignment"', () => {
    expect(call([asg({ source: 'application', status: 'active' })], [])).toBe(
      'active_assignment'
    );
  });

  it('completed assignment → "completed_assignment"', () => {
    expect(call([asg({ status: 'completed' })], [])).toBe('completed_assignment');
  });

  it('cancelled placement → null (left to the existing re-apply / explanation flow)', () => {
    expect(
      call([asg({ status: 'cancelled', cancelledBy: 'worker' })], [])
    ).toBeNull();
    expect(
      call([asg({ status: 'cancelled', cancelledBy: 'contractor' })], [])
    ).toBeNull();
  });

  it('cancelled assignment + still-accepted invitation → null (not re-blocked as an invitation)', () => {
    expect(
      call(
        [asg({ status: 'cancelled', cancelledBy: 'worker' })],
        [inv({ status: 'accepted' })]
      )
    ).toBeNull();
  });

  it('pending invitation, no assignment history → "open_invitation"', () => {
    expect(call([], [inv({ status: 'pending' })])).toBe('open_invitation');
  });

  it('accepted invitation, no assignment yet → "open_invitation"', () => {
    expect(call([], [inv({ status: 'accepted' })])).toBe('open_invitation');
  });

  it('declined / cancelled / expired invitations do not block', () => {
    expect(call([], [inv({ status: 'declined' })])).toBeNull();
    expect(call([], [inv({ status: 'cancelled' })])).toBeNull();
    expect(call([], [inv({ status: 'expired' })])).toBeNull();
  });

  it('active assignment wins over a live invitation on the same job', () => {
    expect(
      call([asg({ status: 'active' })], [inv({ status: 'accepted' })])
    ).toBe('active_assignment');
  });

  it('ignores assignments / invitations for a different job or a different worker', () => {
    expect(
      call(
        [
          asg({ jobId: OTHER_JOB, status: 'active' }),
          asg({ workerId: OTHER_WORKER, status: 'active' }),
        ],
        [
          inv({ jobId: OTHER_JOB, status: 'pending' }),
          inv({ workerId: OTHER_WORKER, status: 'pending' }),
        ]
      )
    ).toBeNull();
  });

  it('uses the EFFECTIVE (latest) assignment: active > cancelled regardless of order', () => {
    const active = asg({ status: 'active', updatedAt: '2026-02-01T00:00:00.000Z' });
    const cancelled = asg({
      status: 'cancelled',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    // getWorkerJobAssignment prefers an active row even if a cancelled row is newer.
    expect(call([cancelled, active], [])).toBe('active_assignment');
  });
});
