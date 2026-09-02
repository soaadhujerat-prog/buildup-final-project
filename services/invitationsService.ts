// =============================================================================
// BuildUp – Invitations service (Phase 5C-1 · real contractor→worker layer)
// =============================================================================
// Real Supabase reads/writes for the INVITATION domain.
//
// SECURITY MODEL — all server-authoritative, nothing re-implemented here
// (migration 030). The client has NO direct INSERT / UPDATE / DELETE on
// `invitations` and NO write at all on `assignments` (008 SELECT-only):
//   • read     = plain SELECT. RLS `invitations_select` scopes rows to
//       worker_id = auth.uid()  OR  contractor_id = auth.uid()  OR  is_admin().
//   • send     = send_invitation RPC. Caller must be the owning approved
//       contractor; target must be an approved worker; job open / not
//       manually-closed / not full; the one-live (job,worker) rule holds.
//       contractor_id / worker_id / job_id / status / timestamps are all set
//       server-side — the client supplies only job_id + worker_id + message.
//   • accept/decline = respond_to_invitation RPC (one atomic transaction). On
//       accept the RPC also INSERTs exactly one 'active' assignment
//       (source='invitation') under a job-row lock, so concurrent accepts on a
//       1-slot job cannot overbook. If the assignment INSERT fails the whole
//       call aborts and the invitation stays pending.
//   • cancel   = cancel_invitation RPC — owning approved contractor only,
//       still-pending only, pending -> cancelled (reason 'manual').
// No privileged column (status / responded_at / cancelled_at /
// cancellation_reason / response_message) is ever written from the client.
// =============================================================================

import type { Invitation, InvitationStatus } from '../types';

import { getSupabase } from './supabaseClient';

interface InvitationRow {
  id: string;
  job_id: string;
  contractor_id: string;
  worker_id: string;
  message: string | null;
  sent_at: string;
  responded_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: 'manual' | 'capacity_full' | null;
  response_message: string | null;
  status: InvitationStatus;
}

const INVITATION_SELECT =
  'id, job_id, contractor_id, worker_id, message, sent_at, responded_at, ' +
  'cancelled_at, cancellation_reason, response_message, status';

export function mapInvitationRow(r: InvitationRow): Invitation {
  return {
    id: r.id,
    jobId: r.job_id,
    contractorId: r.contractor_id,
    workerId: r.worker_id,
    message: r.message ?? undefined,
    sentAt: r.sent_at,
    respondedAt: r.responded_at ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    cancellationReason: r.cancellation_reason ?? undefined,
    responseMessage: r.response_message ?? undefined,
    status: r.status,
  };
}

/** Typed failure for the send / respond / cancel flows so the UI can show a
 *  clean Hebrew message per case instead of a raw Postgres/RLS error. */
export type InvitationErrorCode =
  | 'duplicate' // an active (pending/accepted) invitation already exists
  | 'ineligible' // job closed / not open / target not an approved worker
  | 'unauthorized' // not signed in / not the owning contractor / not the invited worker
  | 'not_pending' // acted on an invitation that is no longer pending
  | 'full'; // accept refused / send refused — job already at capacity

export class InvitationError extends Error {
  code: InvitationErrorCode;
  constructor(code: InvitationErrorCode) {
    super(code);
    this.name = 'InvitationError';
    this.code = code;
  }
}

/** Why a `sendInvitation` call did NOT create a new invitation. `duplicate` is
 *  a first-class outcome (a live pending/accepted invitation already exists) —
 *  it is NEVER surfaced as a successful send. */
export type SendInvitationFailure = 'full' | 'duplicate' | 'ineligible' | 'error';

/** Clean Hebrew message for a `sendInvitation` failure, shared by every screen
 *  that can send an invitation (worker search, Smart Match, worker profile,
 *  job details / sent-invitations re-invite). */
export function sendInvitationErrorText(reason: SendInvitationFailure): string {
  switch (reason) {
    case 'duplicate':
      return 'כבר קיימת הזמנה פעילה לעובד זה עבור המשרה.';
    case 'full':
      return 'כל המקומות במשרה כבר אוישו.';
    case 'ineligible':
      return 'לא ניתן לשלוח הזמנה למשרה זו כעת — ייתכן שההרשמה נסגרה או שהמשרה אוישה.';
    default:
      return 'שליחת ההזמנה נכשלה. בדוק/י את החיבור ונסה/י שוב.';
  }
}

function unwrap<T>(data: T | T[] | null): T {
  return (Array.isArray(data) ? data[0] : data) as T;
}

/**
 * Every invitation row the current user is allowed to see (RLS decides):
 *   • worker     → invitations addressed to them
 *   • contractor → invitations they sent
 *   • admin      → all
 * One flat list; AppContext keeps it in the same `invitations` array the
 * screens already read, so every existing selector/derivation keeps working.
 */
export async function listVisibleInvitations(): Promise<Invitation[]> {
  const { data, error } = await getSupabase()
    .from('invitations')
    .select(INVITATION_SELECT);
  if (error) throw error;
  return ((data as unknown as InvitationRow[] | null) ?? []).map(mapInvitationRow);
}

/**
 * Contractor sends an invitation to a worker for one of their own jobs
 * (send_invitation RPC — migration 030). Returns the persisted row.
 *   23505 (unique_violation) -> 'duplicate' (an active invitation already exists)
 *   23514 / "fully staffed"  -> 'full'
 *   42501                    -> 'unauthorized'
 *   P0001 / P0002            -> 'ineligible' (job not open / closed / bad target)
 */
export async function sendInvitationBackend(
  jobId: string,
  workerId: string,
  message?: string
): Promise<Invitation> {
  const trimmed = (message ?? '').trim();
  const { data, error } = await getSupabase().rpc('send_invitation', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_message: trimmed ? trimmed : null,
  });
  if (error) {
    if (error.code === '23505') throw new InvitationError('duplicate');
    if (error.code === '23514' || /fully staffed/i.test(error.message ?? '')) {
      throw new InvitationError('full');
    }
    if (error.code === '42501') throw new InvitationError('unauthorized');
    if (error.code === 'P0001' || error.code === 'P0002') {
      throw new InvitationError('ineligible');
    }
    throw error;
  }
  return mapInvitationRow(unwrap(data) as unknown as InvitationRow);
}

/**
 * Invited worker accepts (p_accept=true) or declines (false) their own
 * still-`pending` invitation (respond_to_invitation RPC — one atomic
 * transaction). On accept the RPC also creates exactly one 'active' assignment
 * (source='invitation') under a job-row lock. Returns the updated invitation.
 *   23514 / "fully staffed" -> 'full' (job filled first)
 *   P0001                   -> 'not_pending' (already accepted/declined/cancelled, or job not open)
 *   P0002                   -> 'not_pending' (invitation / job gone)
 *   42501                   -> 'unauthorized' (not the invited approved worker)
 */
export async function respondToInvitationBackend(
  invitationId: string,
  accept: boolean,
  responseMessage?: string
): Promise<Invitation> {
  const trimmed = (responseMessage ?? '').trim();
  const { data, error } = await getSupabase().rpc('respond_to_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
    p_response_message: trimmed ? trimmed : null,
  });
  if (error) {
    if (error.code === '23514' || /fully staffed/i.test(error.message ?? '')) {
      throw new InvitationError('full');
    }
    if (error.code === 'P0001' || error.code === 'P0002') {
      throw new InvitationError('not_pending');
    }
    if (error.code === '42501') throw new InvitationError('unauthorized');
    throw error;
  }
  return mapInvitationRow(unwrap(data) as unknown as InvitationRow);
}

/**
 * Owning contractor withdraws their own still-`pending` invitation
 * (cancel_invitation RPC). History is preserved — the row flips to 'cancelled'
 * (reason 'manual'), it is never deleted. No assignment, capacity untouched.
 *   P0001 -> 'not_pending' (accepted / declined / already cancelled)
 *   P0002 -> 'not_pending' (invitation gone)
 *   42501 -> 'unauthorized' (not the owning approved contractor)
 */
export async function cancelInvitationBackend(
  invitationId: string
): Promise<Invitation> {
  const { data, error } = await getSupabase().rpc('cancel_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) {
    if (error.code === 'P0001' || error.code === 'P0002') {
      throw new InvitationError('not_pending');
    }
    if (error.code === '42501') throw new InvitationError('unauthorized');
    throw error;
  }
  return mapInvitationRow(unwrap(data) as unknown as InvitationRow);
}
