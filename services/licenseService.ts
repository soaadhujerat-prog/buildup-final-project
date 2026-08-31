// =============================================================================
// BuildUp – Contractor licence service (Phase 3B)
// =============================================================================
// Contractor SUBMIT of a licence-update request is a plain RLS-checked client
// INSERT (008: license_requests_insert = own row + is_active_user) plus an
// upload into contractor-licenses/{uid}/. The admin notifications for it come
// from a DB trigger (020), not from here.
//
// Admin REVIEW / VERIFY / REQUEST-RENEWAL go through the dedicated
// `review-license-update` Edge Function (verify_jwt + live-admin re-check;
// SECURITY DEFINER SQL does the transactional write + contractor notification).
// =============================================================================

import type { ContractorLicenseUpdateRequest, UploadedDocument } from '../types';

import { getSupabase } from './supabaseClient';
import { invokeFn } from './functionsClient';
import {
  getSignedUrl,
  isStoragePath,
  SIGNED_URL_TTL,
  uploadToOwnFolder,
} from './storageService';

interface LicenseRequestRow {
  id: string;
  contractor_id: string;
  new_registration_number: string | null;
  new_license_details: string | null;
  new_license_document_path: string | null;
  proposed_valid_from: string | null;
  proposed_valid_until: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
}

async function mapRow(r: LicenseRequestRow): Promise<ContractorLicenseUpdateRequest> {
  let newLicenseDocument: UploadedDocument | undefined;
  if (r.new_license_document_path) {
    const url = await getSignedUrl(
      'contractor-licenses',
      r.new_license_document_path,
      SIGNED_URL_TTL.document
    );
    newLicenseDocument = {
      uri: url ?? '',
      fileName: 'רישיון קבלן',
      type: 'contractor_license',
      storagePath: r.new_license_document_path,
    };
  }
  return {
    id: r.id,
    contractorId: r.contractor_id,
    newRegistrationNumber: r.new_registration_number ?? undefined,
    newLicenseDetails: r.new_license_details ?? undefined,
    newLicenseDocument,
    proposedValidFrom: r.proposed_valid_from ?? undefined,
    proposedValidUntil: r.proposed_valid_until ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at ?? undefined,
    reviewedBy: r.reviewed_by ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
  };
}

const SELECT =
  'id, contractor_id, new_registration_number, new_license_details, new_license_document_path, proposed_valid_from, proposed_valid_until, status, reviewed_at, reviewed_by, rejection_reason, created_at';

// ---------------------------------------------------------------------------
// Contractor: submit a request
// ---------------------------------------------------------------------------

export interface LicenseUpdateInput {
  newLicenseDocument?: UploadedDocument;
  newLicenseDetails?: string;
  newRegistrationNumber?: string;
  proposedValidFrom?: string;
  proposedValidUntil?: string;
}

export async function submitLicenseUpdate(
  input: LicenseUpdateInput
): Promise<ContractorLicenseUpdateRequest> {
  const sb = getSupabase();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) throw new Error('no active session');

  let documentPath: string | null = null;
  const doc = input.newLicenseDocument;
  if (doc?.storagePath) {
    documentPath = doc.storagePath;
  } else if (doc?.uri && !isStoragePath(doc.uri)) {
    documentPath = await uploadToOwnFolder('contractor-licenses', uid, doc.uri, {
      kind: 'license',
      mimeType: doc.mimeType,
    });
  }

  const { data, error } = await sb
    .from('contractor_license_update_requests')
    .insert({
      contractor_id: uid,
      new_registration_number: input.newRegistrationNumber?.trim() || null,
      new_license_details: input.newLicenseDetails?.trim() || null,
      new_license_document_path: documentPath,
      proposed_valid_from: input.proposedValidFrom || null,
      proposed_valid_until: input.proposedValidUntil || null,
    })
    .select(SELECT)
    .single();

  if (error) {
    // one-pending partial unique -> a request is already open
    if ((error as { code?: string }).code === '23505') {
      throw new Error('a licence-update request is already pending');
    }
    throw error;
  }
  return mapRow(data as LicenseRequestRow);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every licence-update request (admin: RLS returns all; contractor: only own). */
export async function listLicenseRequests(): Promise<ContractorLicenseUpdateRequest[]> {
  const { data, error } = await getSupabase()
    .from('contractor_license_update_requests')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all(((data as LicenseRequestRow[] | null) ?? []).map(mapRow));
}

// ---------------------------------------------------------------------------
// Admin actions (Edge Function)
// ---------------------------------------------------------------------------

export async function reviewLicenseUpdate(
  requestId: string,
  approve: boolean,
  reason?: string
): Promise<void> {
  await invokeFn<{ ok: boolean }>('review-license-update', {
    action: 'review',
    requestId,
    approve,
    reason: reason ?? null,
  });
}

export async function verifyContractorLicense(contractorId: string): Promise<void> {
  await invokeFn<{ ok: boolean }>('review-license-update', {
    action: 'verify',
    contractorId,
  });
}

export async function requestLicenseRenewal(contractorId: string): Promise<void> {
  await invokeFn<{ ok: boolean }>('review-license-update', {
    action: 'request_renewal',
    contractorId,
  });
}
