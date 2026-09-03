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
  type PrivateBucket,
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

interface ReserveResponse {
  ok: boolean;
  kind?: string;
  bucket?: PrivateBucket;
  registrationId?: string;
  path?: string;
  token?: string;
  error?: string;
}

const isLocalPick = (doc?: UploadedDocument): doc is UploadedDocument =>
  !!doc?.uri && !doc.storagePath && !/^https?:\/\//i.test(doc.uri);

/** Result of staging every document a sign-up carries, all under ONE reserved
 *  registration id (see the `register-upload-url` Edge Function). */
interface StagedDocuments {
  reservedRegistrationId?: string;
  idDocumentPath?: string;
  licenseDocumentPath?: string;
  /** Certifications rebuilt as name + (verified) staged path — NEVER a local
   *  `file://` uri. Only set for a worker sign-up. */
  certifications?: Array<{ name: string; documentPath?: string }>;
}

/**
 * Phase 3B + 051: every document picked at sign-up is uploaded to private
 * Storage BEFORE `register`, via one-shot signed-upload tokens minted by
 * `register-upload-url` (no session, no service-role key, no base64 — bytes
 * stream straight to Storage). The ID document reserves the registration id;
 * the contractor licence and every worker certificate document are staged into
 * the SAME `{registrationId}/` folder. `register` then verifies every object
 * exists and ties them all to that one registration row; on approval the
 * `approve-registration` function relocates them to canonical user-owned paths.
 *
 * A failed upload throws a typed `RegistrationError` — the sign-up is never
 * submitted pretending a document was stored.
 */
async function uploadRegistrationDocuments(
  role: 'worker' | 'contractor',
  data: RegistrationData
): Promise<StagedDocuments> {
  const out: StagedDocuments = {};

  // ---- 1. ID document (reserves the registration id) ----
  const idDoc = (data as { idDocument?: UploadedDocument }).idDocument;
  if (isLocalPick(idDoc)) {
    const mimeType = mimeForUpload(idDoc.mimeType, idDoc.fileName || idDoc.uri);
    const reserve = await callFn<ReserveResponse>('register-upload-url', {
      kind: 'id',
      fileName: idDoc.fileName ?? 'id-document',
      mimeType,
      size: idDoc.size ?? 0,
    });
    if (!reserve.ok || !reserve.token || !reserve.path || !reserve.registrationId) {
      throw new RegistrationError(reserve.error ?? 'id_upload_failed');
    }
    try {
      await uploadViaSignedUrl(
        reserve.bucket ?? 'id-documents',
        reserve.path,
        reserve.token,
        idDoc.uri,
        mimeType
      );
    } catch {
      throw new RegistrationError('id_upload_failed');
    }
    out.reservedRegistrationId = reserve.registrationId;
    out.idDocumentPath = reserve.path;
  }

  // ---- 2. Contractor licence document ----
  if (role === 'contractor') {
    const lic = (data as ContractorRegistrationData).licenseDocument;
    if (isLocalPick(lic)) {
      if (!out.reservedRegistrationId) throw new RegistrationError('license_upload_failed');
      const mimeType = mimeForUpload(lic.mimeType, lic.fileName || lic.uri);
      const reserve = await callFn<ReserveResponse>('register-upload-url', {
        kind: 'license',
        registrationId: out.reservedRegistrationId,
        fileName: lic.fileName ?? 'license',
        mimeType,
        size: lic.size ?? 0,
      });
      if (!reserve.ok || !reserve.token || !reserve.path) {
        throw new RegistrationError(reserve.error ?? 'license_upload_failed');
      }
      try {
        await uploadViaSignedUrl(
          reserve.bucket ?? 'contractor-licenses',
          reserve.path,
          reserve.token,
          lic.uri,
          mimeType
        );
      } catch {
        throw new RegistrationError('license_upload_failed');
      }
      out.licenseDocumentPath = reserve.path;
    }
  }

  // ---- 3. Worker certificate documents (one per certification) ----
  if (role === 'worker') {
    const certs = (data as WorkerRegistrationData).certifications ?? [];
    const rebuilt: Array<{ name: string; documentPath?: string }> = [];
    for (let i = 0; i < certs.length; i++) {
      const name = (certs[i]?.name ?? '').trim();
      if (!name) continue;
      const doc = certs[i]?.document;
      let documentPath: string | undefined;
      if (doc?.storagePath) {
        documentPath = doc.storagePath;
      } else if (isLocalPick(doc)) {
        if (!out.reservedRegistrationId) throw new RegistrationError('certificate_upload_failed');
        const mimeType = mimeForUpload(doc.mimeType, doc.fileName || doc.uri);
        const reserve = await callFn<ReserveResponse>('register-upload-url', {
          kind: 'certificate',
          registrationId: out.reservedRegistrationId,
          index: i,
          fileName: doc.fileName ?? `certificate-${i}`,
          mimeType,
          size: doc.size ?? 0,
        });
        if (!reserve.ok || !reserve.token || !reserve.path) {
          throw new RegistrationError(reserve.error ?? 'certificate_upload_failed');
        }
        try {
          await uploadViaSignedUrl(
            reserve.bucket ?? 'worker-certificates',
            reserve.path,
            reserve.token,
            doc.uri,
            mimeType
          );
        } catch {
          throw new RegistrationError('certificate_upload_failed');
        }
        documentPath = reserve.path;
      }
      rebuilt.push(documentPath ? { name, documentPath } : { name });
    }
    out.certifications = rebuilt;
  }

  return out;
}

/** Strip local-file document objects from the JSON payload sent to `register`.
 *  ID + licence docs travel as separate verified Storage paths; certifications
 *  are re-attached by the caller as `[{ name, documentPath }]` (never a uri). */
const stripLocalDocs = (data: RegistrationData): Record<string, unknown> => {
  const { idDocument, licenseDocument, certifications, ...rest } =
    data as unknown as Record<string, unknown>;
  void idDocument;
  void licenseDocument;
  void certifications;
  return rest;
};

export async function submitWorkerRegistration(
  data: WorkerRegistrationData
): Promise<RegistrationRecord> {
  const staged = await uploadRegistrationDocuments('worker', data);
  const payload = stripLocalDocs(data);
  payload.certifications = staged.certifications ?? [];
  const res = await callFn<RegisterResponse>('register', {
    role: 'worker',
    data: payload,
    reservedRegistrationId: staged.reservedRegistrationId,
    idDocumentPath: staged.idDocumentPath,
  });
  if (!res.ok || !res.registrationId) {
    throw new RegistrationError(res.error ?? 'unavailable');
  }
  return buildLocalRecord(res.registrationId, 'worker', data);
}

export async function submitContractorRegistration(
  data: ContractorRegistrationData
): Promise<RegistrationRecord> {
  const staged = await uploadRegistrationDocuments('contractor', data);
  const res = await callFn<RegisterResponse>('register', {
    role: 'contractor',
    data: stripLocalDocs(data),
    reservedRegistrationId: staged.reservedRegistrationId,
    idDocumentPath: staged.idDocumentPath,
    licenseDocumentPath: staged.licenseDocumentPath,
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
  license_document_path: string | null;
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

/** image/* or application/pdf for a stored object path, or undefined. */
const mimeForPath = (path: string): string | undefined => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  return undefined;
};

async function mapRow(r: AdminRegRow): Promise<RegistrationRecord> {
  // Every document path -> a short-lived signed URL the admin can open. The raw
  // path is kept as `storagePath` so `AttachedDocument` re-signs on tap; it is
  // never surfaced in the UI (see RegistrationDetailsScreen).
  let idDocument: UploadedDocument | undefined;
  if (r.id_document_path) {
    const url = await getSignedUrl('id-documents', r.id_document_path, SIGNED_URL_TTL.document);
    if (url) {
      const ext = r.id_document_path.split('.').pop()?.toLowerCase() ?? '';
      idDocument = {
        uri: url,
        fileName: `תעודת זהות.${ext || 'jpg'}`,
        mimeType: mimeForPath(r.id_document_path),
        type: 'id_card',
        storagePath: r.id_document_path,
      };
    }
  }

  // Contractor licence document (051) — staged path pre-approval, canonical
  // {userId}/... after approval; the admin can open it in both states.
  let licenseDocument: UploadedDocument | undefined;
  if (r.role === 'contractor' && r.license_document_path) {
    const url = await getSignedUrl(
      'contractor-licenses',
      r.license_document_path,
      SIGNED_URL_TTL.document
    );
    if (url) {
      licenseDocument = {
        uri: url,
        fileName: 'רישיון קבלן',
        mimeType: mimeForPath(r.license_document_path),
        type: 'contractor_license',
        storagePath: r.license_document_path,
      };
    }
  }

  // Worker certificate documents (051) — each certification in `data` carries
  // its own staged/canonical `documentPath`; sign it to `{ name, document }`.
  let certifications: Array<{ name: string; document?: UploadedDocument }> | undefined;
  const rawCerts = (r.data as { certifications?: unknown })?.certifications;
  if (r.role === 'worker' && Array.isArray(rawCerts)) {
    certifications = await Promise.all(
      rawCerts.map(async (c) => {
        const name = String((c as { name?: unknown })?.name ?? '').trim();
        const dp = String((c as { documentPath?: unknown })?.documentPath ?? '').trim();
        if (!dp) return { name };
        const url = await getSignedUrl('worker-certificates', dp, SIGNED_URL_TTL.document);
        return url
          ? {
              name,
              document: {
                uri: url,
                fileName: name || 'תעודה',
                mimeType: mimeForPath(dp),
                type: 'certification',
                storagePath: dp,
              } as UploadedDocument,
            }
          : { name };
      })
    );
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
    // idNumber is intentionally absent (HMAC only); documents are signed URLs.
    data: {
      ...(r.data ?? {}),
      email: r.email ?? '',
      ...(idDocument ? { idDocument } : {}),
      ...(licenseDocument ? { licenseDocument } : {}),
      ...(certifications ? { certifications } : {}),
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
