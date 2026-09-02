// =============================================================================
// BuildUp – Registration service (Phase 3A)
// =============================================================================
// Backend registration + admin approval, on top of the Edge Functions
// (`register`, `approve-registration`, `reject-registration`) and the
// `admin_list_registrations` RPC. UI-agnostic; used by AppContext only when
// the user is signed in.
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
  UploadedDocument,
  WorkerRegistrationData,
} from '../types';

import { getSupabase } from './supabaseClient';
import {
  getSignedUrl,
  mimeForUpload,
  SIGNED_URL_TTL,
  uploadViaSignedUrl,
} from './storageService';

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

/**
 * Phase 3B: the ID document is uploaded to Storage BEFORE `register`, using a
 * one-shot signed-upload token minted by `register-upload-url` (no session, no
 * service-role key, no base64 — bytes stream straight to Storage). `register`
 * then verifies the object exists and ties it to the same registration id.
 * Returns the reserved id + confirmed path, or {} when there is nothing to
 * upload (no doc, or a doc that already lives in Storage).
 */
async function uploadIdDocument(
  data: RegistrationData
): Promise<{ reservedRegistrationId?: string; idDocumentPath?: string }> {
  const doc = (data as { idDocument?: UploadedDocument }).idDocument;
  if (!doc?.uri || doc.storagePath) return {};
  if (/^https?:\/\//i.test(doc.uri)) return {};

  const mimeType = mimeForUpload(doc.mimeType, doc.fileName || doc.uri);
  const reserve = await callFn<{
    ok: boolean;
    registrationId: string;
    path: string;
    token: string;
    error?: string;
  }>('register-upload-url', {
    fileName: doc.fileName ?? 'id-document',
    mimeType,
    size: doc.size ?? 0,
  });
  if (!reserve.ok || !reserve.token) {
    throw new RegistrationError(reserve.error ?? 'id_upload_failed');
  }
  try {
    await uploadViaSignedUrl('id-documents', reserve.path, reserve.token, doc.uri, mimeType);
  } catch {
    throw new RegistrationError('id_upload_failed');
  }
  return { reservedRegistrationId: reserve.registrationId, idDocumentPath: reserve.path };
}

/** Strip local-file document objects from the JSON payload sent to `register`
 *  (the ID doc travels as a Storage path; licence docs are captured later). */
const stripLocalDocs = (data: RegistrationData): Record<string, unknown> => {
  const { idDocument, licenseDocument, ...rest } = data as unknown as Record<
    string,
    unknown
  >;
  void idDocument;
  void licenseDocument;
  return rest;
};

export async function submitWorkerRegistration(
  data: WorkerRegistrationData
): Promise<RegistrationRecord> {
  const { reservedRegistrationId, idDocumentPath } = await uploadIdDocument(data);
  const res = await callFn<RegisterResponse>('register', {
    role: 'worker',
    data: stripLocalDocs(data),
    reservedRegistrationId,
    idDocumentPath,
  });
  if (!res.ok || !res.registrationId) {
    throw new RegistrationError(res.error ?? 'unavailable');
  }
  return buildLocalRecord(res.registrationId, 'worker', data);
}

export async function submitContractorRegistration(
  data: ContractorRegistrationData
): Promise<RegistrationRecord> {
  const { reservedRegistrationId, idDocumentPath } = await uploadIdDocument(data);
  const res = await callFn<RegisterResponse>('register', {
    role: 'contractor',
    data: stripLocalDocs(data),
    reservedRegistrationId,
    idDocumentPath,
  });
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
  id_document_path: string | null;
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

async function mapRow(r: AdminRegRow): Promise<RegistrationRecord> {
  // id_document_path -> a short-lived signed URL the admin can open. The
  // raw path is never surfaced in the UI (see RegistrationDetailsScreen).
  let idDocument: UploadedDocument | undefined;
  if (r.id_document_path) {
    const url = await getSignedUrl(
      'id-documents',
      r.id_document_path,
      SIGNED_URL_TTL.document
    );
    if (url) {
      const ext = r.id_document_path.split('.').pop()?.toLowerCase() ?? '';
      const mimeType =
        ext === 'pdf'
          ? 'application/pdf'
          : ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)
          ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
          : undefined;
      idDocument = {
        uri: url,
        fileName: `תעודת זהות.${ext || 'jpg'}`,
        mimeType,
        type: 'id_card',
        storagePath: r.id_document_path,
      };
    }
  }
  return {
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
    // idNumber is intentionally absent (HMAC only); idDocument is a signed URL.
    data: {
      ...(r.data ?? {}),
      email: r.email ?? '',
      ...(idDocument ? { idDocument } : {}),
    } as RegistrationData,
  };
}

/** All registrations, for an admin. Returns `[]` for a non-admin caller. */
export async function listRegistrationsForAdmin(): Promise<RegistrationRecord[]> {
  const { data, error } = await getSupabase().rpc('admin_list_registrations');
  if (error) throw new RegistrationError('server');
  const rows = (data ?? []) as AdminRegRow[];
  return Promise.all(rows.map(mapRow));
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
