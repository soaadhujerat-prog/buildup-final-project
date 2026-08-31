// =============================================================================
// BuildUp – Registration service (Phase 3A)
// =============================================================================
// Backend registration + admin approval, on top of the Edge Functions
// (`register`, `approve-registration`, `reject-registration`) and the
// `admin_list_registrations` RPC. UI-agnostic; used by AppContext only when
// `isBackendEnabled()` is true. The mock path in AppContext is untouched.
//
// Nothing sensitive round-trips here: the raw ID number / password go straight
// into the `register` Edge Function body and are never stored; a registration
// read back for an admin carries the applicant's email (joined live from
// auth.users) but no ID and no password.
// =============================================================================

import type {
  ContractorRegistrationData,
  CustomerStatus,
  RegistrationData,
  RegistrationRecord,
  RegistrationStatusEvent,
  WorkerRegistrationData,
} from '../types';

import { getSupabase } from './supabaseClient';

/** An expected registration failure the UI should show as a real message.
 *  `code`: 'invalid' | 'unavailable' | 'forbidden' | 'not_found' | 'conflict'
 *  | 'server' | ... */
export class RegistrationError extends Error {
  code: string;
  status?: number;
  constructor(code: string, status?: number) {
    super(code);
    this.name = 'RegistrationError';
    this.code = code;
    this.status = status;
  }
}

async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) {
    let code = 'server';
    let status: number | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') status = ctx.status;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const j = (await ctx.json()) as { error?: string };
        if (j && typeof j.error === 'string') code = j.error;
      }
    } catch {
      /* body already consumed / not json — keep the generic code */
    }
    throw new RegistrationError(code, status);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

interface RegisterResponse {
  ok: boolean;
  registrationId?: string;
  status?: CustomerStatus;
  error?: string;
}

const buildLocalRecord = (
  registrationId: string,
  role: 'worker' | 'contractor',
  data: WorkerRegistrationData | ContractorRegistrationData
): RegistrationRecord => ({
  id: registrationId,
  role,
  status: 'pending',
  submittedAt: new Date().toISOString(),
  externalChecks: {},
  // in-memory only, on the signing-up user's own device — never persisted here;
  // strip the password from what we hand back to the screen.
  data: { ...data, password: '' } as RegistrationData,
});

export async function submitWorkerRegistration(
  data: WorkerRegistrationData
): Promise<RegistrationRecord> {
  const res = await callFn<RegisterResponse>('register', { role: 'worker', data });
  if (!res.ok || !res.registrationId) {
    throw new RegistrationError(res.error ?? 'unavailable');
  }
  return buildLocalRecord(res.registrationId, 'worker', data);
}

export async function submitContractorRegistration(
  data: ContractorRegistrationData
): Promise<RegistrationRecord> {
  const res = await callFn<RegisterResponse>('register', { role: 'contractor', data });
  if (!res.ok || !res.registrationId) {
    throw new RegistrationError(res.error ?? 'unavailable');
  }
  return buildLocalRecord(res.registrationId, 'contractor', data);
}

// ---------------------------------------------------------------------------
// Admin — list
// ---------------------------------------------------------------------------

interface AdminRegRow {
  id: string;
  role: 'worker' | 'contractor';
  status: CustomerStatus;
  submitted_at: string;
  processed_at: string | null;
  processed_by: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  approved_at: string | null;
  approval_message: string | null;
  created_user_id: string | null;
  external_checks: RegistrationRecord['externalChecks'] | null;
  data: Record<string, unknown> | null;
  email: string | null;
  events: Array<{
    id: string;
    registrationId: string;
    fromStatus: CustomerStatus;
    toStatus: CustomerStatus;
    reason: string | null;
    message: string | null;
    actorId: string | null;
    createdAt: string;
  }> | null;
}

const mapEvent = (e: NonNullable<AdminRegRow['events']>[number]): RegistrationStatusEvent => ({
  id: e.id,
  registrationId: e.registrationId,
  fromStatus: e.fromStatus,
  toStatus: e.toStatus,
  reason: e.reason ?? undefined,
  message: e.message ?? undefined,
  actorId: e.actorId ?? undefined,
  createdAt: e.createdAt,
});

const mapRow = (r: AdminRegRow): RegistrationRecord => ({
  id: r.id,
  role: r.role,
  status: r.status,
  submittedAt: r.submitted_at,
  processedAt: r.processed_at ?? undefined,
  processedBy: r.processed_by ?? undefined,
  rejectionReason: r.rejection_reason ?? undefined,
  rejectedAt: r.rejected_at ?? undefined,
  approvedAt: r.approved_at ?? undefined,
  approvalMessage: r.approval_message ?? undefined,
  createdUserId: r.created_user_id ?? undefined,
  statusHistory: (r.events ?? []).map(mapEvent),
  externalChecks: r.external_checks ?? {},
  // email is joined live from auth.users (never stored in `data`, decision #3);
  // idNumber is intentionally absent (HMAC only).
  data: { ...(r.data ?? {}), email: r.email ?? '' } as RegistrationData,
});

/** All registrations, for an admin. Returns `[]` for a non-admin caller. */
export async function listRegistrationsForAdmin(): Promise<RegistrationRecord[]> {
  const { data, error } = await getSupabase().rpc('admin_list_registrations');
  if (error) throw new RegistrationError('server');
  const rows = (data ?? []) as AdminRegRow[];
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// Admin — decisions
// ---------------------------------------------------------------------------

export async function approveRegistration(
  registrationId: string,
  message?: string
): Promise<string> {
  const res = await callFn<{ ok: boolean; userId?: string }>('approve-registration', {
    registrationId,
    message: message ?? null,
  });
  if (!res.ok) throw new RegistrationError('approval_failed');
  return res.userId ?? '';
}

export async function rejectRegistration(
  registrationId: string,
  reason: string
): Promise<void> {
  const res = await callFn<{ ok: boolean }>('reject-registration', {
    registrationId,
    reason,
  });
  if (!res.ok) throw new RegistrationError('rejection_failed');
}

export async function revertRegistrationRejection(
  registrationId: string
): Promise<void> {
  const res = await callFn<{ ok: boolean }>('reject-registration', {
    registrationId,
    revert: true,
  });
  if (!res.ok) throw new RegistrationError('revert_failed');
}

/**
 * Decrypt one applicant's ID number for admin verification. Server-side the
 * `admin-reveal-id` Edge Function re-verifies the caller is a live approved
 * admin; a non-admin gets 403 → this throws. Returns the plaintext 9-digit ID.
 */
export async function revealRegistrationIdNumber(
  registrationId: string
): Promise<string> {
  const res = await callFn<{ ok: boolean; idNumber?: string }>('admin-reveal-id', {
    registrationId,
  });
  if (!res.ok || !res.idNumber) throw new RegistrationError('id_reveal_failed');
  return res.idNumber;
}
