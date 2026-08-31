// =============================================================================
// BuildUp – Profile service (DB profile -> SessionUser mapper)
// =============================================================================
// Loads the signed-in user's `profiles` row plus the role-specific profile
// tables, and maps them to the existing frontend domain types (Admin / Worker /
// Contractor) so no screen has to change.
//
// Source of truth:
//   auth.users            -> identity
//   profiles.role/status  -> authorization + application status (NEVER a JWT claim)
//   worker_/contractor_*   -> professional profile
//
// A plaintext ID number is never read here — the backend doesn't store one
// (Phase 1 decision #1), so mapped users leave `idNumber` undefined.
// =============================================================================

import type {
  Admin,
  AdminPermission,
  Certification,
  Contractor,
  ContractorLicenseVerificationStatus,
  CustomerStatus,
  ProfessionCategory,
  UploadedDocument,
  UserRole,
  Worker,
} from '../types';
import type { SessionUser } from '../types/auth';

import { dmyToIso } from '../utils/helpers';

import { getSupabase } from './supabaseClient';
import {
  getSignedUrl,
  removeOwn,
  SIGNED_URL_TTL,
  uploadToOwnFolder,
} from './storageService';

// ---------------------------------------------------------------------------
// Row shapes we actually read (a subset of the generated DB types — kept local
// so this file doesn't depend on the full generated surface).
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string;
  email: string;
  status: CustomerStatus;
  avatar_path: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
  created_at: string;
}

interface WorkerProfileRow {
  profile_id: string;
  profession_category_slug: string;
  experience_years: number;
  is_available: boolean;
  available_from: string | null;
  hourly_rate: number | string;
  daily_rate: number | string;
  bio: string;
  city_name: string;
}

interface ContractorProfileRow {
  profile_id: string;
  company_name: string;
  contractor_registration_number: string;
  license_details: string;
  bio: string | null;
  license_valid_from: string | null;
  license_valid_until: string | null;
  license_verification_status: ContractorLicenseVerificationStatus;
  license_last_verified_at: string | null;
  license_next_review_at: string | null;
  city_name: string;
}

interface TaxonomyMaps {
  category: Map<string, string>;
  profession: Map<string, string>;
  area: Map<string, string>;
  projectType: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Taxonomy (slug -> Hebrew name). Small reference tables, readable by any
// authenticated user (see 008_rls `taxonomy_read`). Loaded once per profile
// build so we never hardcode a slug<->label map.
// ---------------------------------------------------------------------------

async function loadTaxonomy(): Promise<TaxonomyMaps> {
  const sb = getSupabase();
  const [cats, profs, areas, ptypes] = await Promise.all([
    sb.from('profession_categories').select('slug,name'),
    sb.from('professions').select('slug,name'),
    sb.from('areas').select('slug,name'),
    sb.from('project_types').select('slug,name'),
  ]);
  for (const res of [cats, profs, areas, ptypes]) {
    if (res.error) throw res.error;
  }
  const toMap = (rows: Array<{ slug: string; name: string }> | null): Map<string, string> =>
    new Map((rows ?? []).map((r) => [r.slug, r.name]));
  return {
    category: toMap(cats.data as Array<{ slug: string; name: string }> | null),
    profession: toMap(profs.data as Array<{ slug: string; name: string }> | null),
    area: toMap(areas.data as Array<{ slug: string; name: string }> | null),
    projectType: toMap(ptypes.data as Array<{ slug: string; name: string }> | null),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the `SessionUser` for whoever is currently signed in, straight from the
 * DB. Returns `null` when there is no session OR the `profiles` row is missing
 * — a missing profile is NEVER auto-created here (that's a registration-flow
 * concern); the caller signs out on `null`.
 */
export async function fetchSessionUser(): Promise<SessionUser> {
  const sb = getSupabase();

  const { data: sessionData } = await sb.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;

  const { data: profileRaw, error } = await sb
    .from('profiles')
    .select(
      'id, role, full_name, phone, email, status, avatar_path, blocked_reason, blocked_at, created_at'
    )
    .eq('id', uid)
    .maybeSingle();

  if (error) throw error;
  if (!profileRaw) return null;

  const profile = profileRaw as ProfileRow;

  // avatar_path -> a short-lived signed URL (avatars bucket is private, 010).
  const avatarUrl =
    (await getSignedUrl('avatars', profile.avatar_path, SIGNED_URL_TTL.avatar)) ??
    undefined;

  if (profile.role === 'admin') {
    return { ...mapAdmin(profile, await loadAdminPermissions(uid)), avatarUrl };
  }

  const tax = await loadTaxonomy();

  if (profile.role === 'worker') {
    return {
      ...mapWorker(profile, await loadWorkerChildren(uid), tax),
      avatarUrl,
    };
  }
  if (profile.role === 'contractor') {
    return {
      ...mapContractor(profile, await loadContractorChildren(uid), tax),
      avatarUrl,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadAdminPermissions(uid: string): Promise<AdminPermission[]> {
  const { data, error } = await getSupabase()
    .from('admin_permissions')
    .select('permission')
    .eq('profile_id', uid);
  if (error) throw error;
  return ((data ?? []) as Array<{ permission: AdminPermission }>).map((r) => r.permission);
}

interface WorkerCertRow {
  id: string;
  name: string;
  document_path: string | null;
}

interface WorkerChildren {
  wp: WorkerProfileRow | null;
  professions: Array<{ profession_slug: string; is_primary: boolean }>;
  skills: string[];
  certifications: Array<{ id: string; name: string; documentUrl?: string; documentPath?: string }>;
  areas: string[];
}

async function loadWorkerChildren(uid: string): Promise<WorkerChildren> {
  const sb = getSupabase();
  const [wp, profs, skills, certs, areas] = await Promise.all([
    sb
      .from('worker_profiles')
      .select(
        'profile_id, profession_category_slug, experience_years, is_available, available_from, hourly_rate, daily_rate, bio, city_name'
      )
      .eq('profile_id', uid)
      .maybeSingle(),
    sb.from('worker_professions').select('profession_slug, is_primary').eq('worker_id', uid),
    sb.from('worker_skills').select('skill').eq('worker_id', uid),
    sb.from('worker_certifications').select('id, name, document_path').eq('worker_id', uid),
    sb.from('worker_preferred_areas').select('area_slug').eq('worker_id', uid),
  ]);
  for (const res of [wp, profs, skills, certs, areas]) {
    if (res.error) throw res.error;
  }
  const certRows = (certs.data as WorkerCertRow[] | null) ?? [];
  const certifications = await Promise.all(
    certRows.map(async (r) => ({
      id: r.id,
      name: r.name,
      documentPath: r.document_path ?? undefined,
      documentUrl: r.document_path
        ? (await getSignedUrl('worker-certificates', r.document_path, SIGNED_URL_TTL.avatar)) ??
          undefined
        : undefined,
    }))
  );
  return {
    wp: (wp.data as WorkerProfileRow | null) ?? null,
    professions:
      (profs.data as Array<{ profession_slug: string; is_primary: boolean }> | null) ?? [],
    skills: ((skills.data as Array<{ skill: string }> | null) ?? []).map((r) => r.skill),
    certifications,
    areas: ((areas.data as Array<{ area_slug: string }> | null) ?? []).map((r) => r.area_slug),
  };
}

interface ContractorChildren {
  cp: ContractorProfileRow | null;
  areas: string[];
  projectTypes: string[];
}

async function loadContractorChildren(uid: string): Promise<ContractorChildren> {
  const sb = getSupabase();
  const [cp, areas, ptypes] = await Promise.all([
    sb
      .from('contractor_profiles')
      .select(
        'profile_id, company_name, contractor_registration_number, license_details, bio, license_valid_from, license_valid_until, license_verification_status, license_last_verified_at, license_next_review_at, city_name'
      )
      .eq('profile_id', uid)
      .maybeSingle(),
    sb.from('contractor_areas').select('area_slug').eq('contractor_id', uid),
    sb.from('contractor_project_types').select('project_type_slug').eq('contractor_id', uid),
  ]);
  for (const res of [cp, areas, ptypes]) {
    if (res.error) throw res.error;
  }
  return {
    cp: (cp.data as ContractorProfileRow | null) ?? null,
    areas: ((areas.data as Array<{ area_slug: string }> | null) ?? []).map((r) => r.area_slug),
    projectTypes: ((ptypes.data as Array<{ project_type_slug: string }> | null) ?? []).map(
      (r) => r.project_type_slug
    ),
  };
}

// ---------------------------------------------------------------------------
// Mappers (DB rows -> existing frontend domain types)
// ---------------------------------------------------------------------------

function mapAdmin(p: ProfileRow, permissions: AdminPermission[]): Admin {
  return {
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    role: 'admin',
    status: p.status,
    createdAt: p.created_at,
    permissions,
  };
}

function mapWorker(p: ProfileRow, c: WorkerChildren, tax: TaxonomyMaps): Worker {
  const professions = [...c.professions]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((r) => tax.profession.get(r.profession_slug) ?? r.profession_slug);

  // profession_category_slug is NOT NULL + FK in the schema, so the lookup
  // effectively always resolves; the `?? slug` fallback just keeps the mapper
  // total. The cast is unavoidable because ProfessionCategory is a Hebrew
  // string-literal union and the seed names match it exactly (001_*).
  const categoryLabel = tax.category.get(c.wp?.profession_category_slug ?? '');

  return {
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    role: 'worker',
    status: p.status,
    createdAt: p.created_at,
    blockedReason: p.blocked_reason ?? undefined,
    blockedAt: p.blocked_at ?? undefined,
    city: c.wp?.city_name ?? '',
    profession: professions[0] ?? '',
    professions,
    professionCategory: (categoryLabel ??
      c.wp?.profession_category_slug ??
      '') as ProfessionCategory,
    skills: c.skills,
    certifications: c.certifications.map((r) => ({
      id: r.id,
      name: r.name,
      document: r.documentUrl
        ? ({
            uri: r.documentUrl,
            fileName: r.name,
            type: 'certification',
            storagePath: r.documentPath,
          } as UploadedDocument)
        : undefined,
    })),
    experienceYears: c.wp?.experience_years ?? 0,
    preferredAreas: c.areas.map((slug) => tax.area.get(slug) ?? slug),
    isAvailable: c.wp?.is_available ?? false,
    availableFrom: c.wp?.available_from ?? undefined,
    hourlyRate: Number(c.wp?.hourly_rate ?? 0),
    dailyRate: Number(c.wp?.daily_rate ?? 0),
    bio: c.wp?.bio ?? '',
  };
}

function mapContractor(
  p: ProfileRow,
  c: ContractorChildren,
  tax: TaxonomyMaps
): Contractor {
  const areasOfOperation = c.areas.map((slug) => tax.area.get(slug) ?? slug);
  return {
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    role: 'contractor',
    status: p.status,
    createdAt: p.created_at,
    blockedReason: p.blocked_reason ?? undefined,
    blockedAt: p.blocked_at ?? undefined,
    companyName: c.cp?.company_name ?? '',
    contractorRegistrationNumber: c.cp?.contractor_registration_number ?? '',
    city: c.cp?.city_name ?? '',
    areasOfOperation,
    areaOfOperation: areasOfOperation[0],
    projectTypes: c.projectTypes.map((slug) => tax.projectType.get(slug) ?? slug),
    licenseDetails: c.cp?.license_details ?? '',
    bio: c.cp?.bio ?? undefined,
    licenseValidFrom: c.cp?.license_valid_from ?? undefined,
    licenseValidUntil: c.cp?.license_valid_until ?? undefined,
    licenseVerificationStatus: c.cp?.license_verification_status,
    licenseLastVerifiedAt: c.cp?.license_last_verified_at ?? undefined,
    licenseNextReviewAt: c.cp?.license_next_review_at ?? undefined,
  };
}

// ===========================================================================
// Writes (Phase 3B) — self-service profile edits
// ===========================================================================
// Each returns a fresh SessionUser (re-read from the DB) so AppContext can
// swap `currentUser` for the authoritative post-write state. The patch objects
// are the SAME `Partial<Worker>` / `Partial<Contractor>` shapes the edit
// screens already build (Hebrew display values); the SECURITY DEFINER RPCs
// (018) resolve names -> taxonomy slugs and only ever touch non-privileged
// columns of the caller's OWN rows.

const isLocalFileUri = (v: string): boolean => /^(file|content):/i.test(v);

/** Normalise a date the UI may give as DD/MM/YYYY (DatePickerField) or already
 *  ISO into 'YYYY-MM-DD' for the RPC; '' / undefined -> '' (clears). */
const normalizeDateForRpc = (v?: string): string => {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const iso = dmyToIso(s);
    return iso ? iso.slice(0, 10) : '';
  }
  return s.slice(0, 10);
};

async function sessionUid(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('no active session');
  return uid;
}

/** Read the current avatar_path so a replaced avatar can be cleaned up. */
async function currentAvatarPath(uid: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('avatar_path')
    .eq('id', uid)
    .maybeSingle();
  return (data as { avatar_path: string | null } | null)?.avatar_path ?? null;
}

interface AvatarResolution {
  /** present in the RPC payload only when it should change */
  avatarPath?: string | null;
  /** a freshly uploaded object path, so a failed RPC can roll it back */
  uploaded?: string;
}

async function resolveAvatar(
  uid: string,
  patch: { avatarUrl?: string | null }
): Promise<AvatarResolution> {
  if (!('avatarUrl' in patch)) return {};
  const v = patch.avatarUrl;
  if (v == null || v === '') return { avatarPath: null };
  if (isLocalFileUri(v)) {
    const path = await uploadToOwnFolder('avatars', uid, v, { kind: 'avatar' });
    return { avatarPath: path, uploaded: path };
  }
  // an https signed URL we handed the screen earlier — unchanged
  return {};
}

/** Upload any freshly-picked certificate documents; keep existing ones by
 *  their storagePath. Returns the payload array `[{ name, documentPath }]`. */
async function resolveCertifications(
  uid: string,
  certs: Certification[] | undefined
): Promise<Array<{ name: string; documentPath: string | null }> | undefined> {
  if (!certs) return undefined;
  const out: Array<{ name: string; documentPath: string | null }> = [];
  for (const c of certs) {
    const name = (c.name ?? '').trim();
    if (!name) continue;
    let documentPath: string | null = null;
    const doc = c.document;
    if (doc?.storagePath) {
      documentPath = doc.storagePath;
    } else if (doc?.uri && isLocalFileUri(doc.uri)) {
      documentPath = await uploadToOwnFolder('worker-certificates', uid, doc.uri, {
        kind: 'certificate',
        mimeType: doc.mimeType,
      });
    }
    out.push({ name, documentPath });
  }
  return out;
}

export async function updateWorkerProfileBackend(
  patch: Partial<Worker>
): Promise<SessionUser> {
  const sb = getSupabase();
  const uid = await sessionUid();
  const prevAvatar = await currentAvatarPath(uid);
  const avatar = await resolveAvatar(uid, patch);

  const payload: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined) payload[k] = v;
  };
  put('fullName', patch.fullName);
  put('phone', patch.phone);
  put('bio', patch.bio);
  put('city', patch.city);
  put('professionCategory', patch.professionCategory);
  put('professions', patch.professions);
  put('skills', patch.skills);
  put('preferredAreas', patch.preferredAreas);
  put('experienceYears', patch.experienceYears);
  put('hourlyRate', patch.hourlyRate);
  put('dailyRate', patch.dailyRate);
  if ('availableFrom' in patch) {
    payload.availableFrom = normalizeDateForRpc(patch.availableFrom ?? undefined);
  }
  if ('avatarPath' in avatar) payload.avatarPath = avatar.avatarPath;
  const certPayload = await resolveCertifications(uid, patch.certifications);
  if (certPayload !== undefined) payload.certifications = certPayload;

  const { error } = await sb.rpc('update_own_worker_profile', { p_data: payload });
  if (error) {
    if (avatar.uploaded) await removeOwn('avatars', avatar.uploaded);
    throw error;
  }
  if (avatar.uploaded && prevAvatar && prevAvatar !== avatar.uploaded) {
    await removeOwn('avatars', prevAvatar);
  }
  return fetchSessionUser();
}

export async function updateContractorProfileBackend(
  patch: Partial<Contractor>
): Promise<SessionUser> {
  const sb = getSupabase();
  const uid = await sessionUid();
  const prevAvatar = await currentAvatarPath(uid);
  const avatar = await resolveAvatar(uid, patch);

  const payload: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined) payload[k] = v;
  };
  put('fullName', patch.fullName);
  put('phone', patch.phone);
  put('bio', patch.bio);
  put('city', patch.city);
  put('companyName', patch.companyName);
  put('areasOfOperation', patch.areasOfOperation);
  put('projectTypes', patch.projectTypes);
  if ('avatarPath' in avatar) payload.avatarPath = avatar.avatarPath;

  const { error } = await sb.rpc('update_own_contractor_profile', { p_data: payload });
  if (error) {
    if (avatar.uploaded) await removeOwn('avatars', avatar.uploaded);
    throw error;
  }
  if (avatar.uploaded && prevAvatar && prevAvatar !== avatar.uploaded) {
    await removeOwn('avatars', prevAvatar);
  }
  return fetchSessionUser();
}

export async function setWorkerAvailabilityBackend(
  isAvailable: boolean,
  availableFrom?: string
): Promise<SessionUser> {
  const norm = normalizeDateForRpc(availableFrom);
  const { error } = await getSupabase().rpc('set_own_worker_availability', {
    p_is_available: isAvailable,
    p_available_from: norm || null,
  });
  if (error) throw error;
  return fetchSessionUser();
}
