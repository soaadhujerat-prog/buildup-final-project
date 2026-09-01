// =============================================================================
// BuildUp – Admin user-directory service (Phase 3B)
// =============================================================================
// READ: an approved admin can already SELECT every profiles / role-table /
// child row (RLS: can_view_profile returns true for is_admin(); taxonomy_read
// for all). This assembles the live worker/contractor directory in a handful
// of bulk queries and maps it to the existing Worker / Contractor domain types
// so the admin screens don't depend on MOCK_* for backend users.
//
// WRITE: block / unblock / set contractor registration number / grant-revoke
// admin permission all go through the ONE `admin-user-action` Edge Function
// (verify_jwt + live-admin re-check; SECURITY DEFINER admin_* SQL functions,
// service_role EXECUTE only). ID reveal reuses `admin-reveal-id`.
// =============================================================================

import type {
  AdminPermission,
  Contractor,
  ContractorLicenseVerificationStatus,
  ProfessionCategory,
  Worker,
} from '../types';

import { getSupabase } from './supabaseClient';
import { invokeFn } from './functionsClient';
import { getSignedUrl, SIGNED_URL_TTL } from './storageService';

// ---------------------------------------------------------------------------
// Directory read
// ---------------------------------------------------------------------------

interface Row {
  [k: string]: unknown;
}
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export interface UserDirectory {
  workers: Worker[];
  contractors: Contractor[];
  /** profile ids that have a `user_identity` row at all — i.e. there is an ID
   *  on file worth trying to reveal. Whether that row's ciphertext is present
   *  yet is only knowable server-side (client roles cannot read
   *  `id_number_enc` — migration 037); a legacy row with no ciphertext returns
   *  "unavailable" from `admin-reveal-id` and the UI then shows a truthful
   *  "heals on next login" line. */
  idOnFile: Set<string>;
}

export async function loadUserDirectory(): Promise<UserDirectory> {
  const sb = getSupabase();

  const [
    profilesR,
    wpR,
    cpR,
    wProfR,
    wSkillR,
    wCertR,
    wAreaR,
    cAreaR,
    cPtR,
    identityR,
    catR,
    profR,
    areaR,
    ptR,
  ] = await Promise.all([
    sb.from('profiles')
      .select('id, role, full_name, phone, email, status, avatar_path, blocked_reason, blocked_at, created_at')
      .in('role', ['worker', 'contractor']),
    sb.from('worker_profiles').select(
      'profile_id, profession_category_slug, experience_years, is_available, available_from, hourly_rate, daily_rate, bio, city_name'
    ),
    sb.from('contractor_profiles').select(
      'profile_id, company_name, contractor_registration_number, license_details, bio, license_valid_from, license_valid_until, license_verification_status, license_last_verified_at, license_next_review_at, city_name'
    ),
    sb.from('worker_professions').select('worker_id, profession_slug, is_primary'),
    sb.from('worker_skills').select('worker_id, skill'),
    sb.from('worker_certifications').select('id, worker_id, name'),
    sb.from('worker_preferred_areas').select('worker_id, area_slug'),
    sb.from('contractor_areas').select('contractor_id, area_slug'),
    sb.from('contractor_project_types').select('contractor_id, project_type_slug'),
    sb.from('user_identity').select('profile_id'),
    sb.from('profession_categories').select('slug, name'),
    sb.from('professions').select('slug, name'),
    sb.from('areas').select('slug, name'),
    sb.from('project_types').select('slug, name'),
  ]);

  for (const r of [profilesR, wpR, cpR, wProfR, wSkillR, wCertR, wAreaR, cAreaR, cPtR, identityR, catR, profR, areaR, ptR]) {
    if (r.error) throw r.error;
  }

  const toMap = (rows: Array<{ slug: string; name: string }>): Map<string, string> =>
    new Map(rows.map((x) => [x.slug, x.name]));
  const catMap = toMap(arr(catR.data));
  const profMap = toMap(arr(profR.data));
  const areaMap = toMap(arr(areaR.data));
  const ptMap = toMap(arr(ptR.data));

  const byKey = <T extends Row>(rows: T[], key: string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const row of rows) {
      const k = String(row[key]);
      const list = m.get(k);
      if (list) list.push(row);
      else m.set(k, [row]);
    }
    return m;
  };

  const wProf = byKey(arr<Row>(wProfR.data), 'worker_id');
  const wSkill = byKey(arr<Row>(wSkillR.data), 'worker_id');
  const wCert = byKey(arr<Row>(wCertR.data), 'worker_id');
  const wArea = byKey(arr<Row>(wAreaR.data), 'worker_id');
  const cArea = byKey(arr<Row>(cAreaR.data), 'contractor_id');
  const cPt = byKey(arr<Row>(cPtR.data), 'contractor_id');
  const wpMap = new Map(arr<Row>(wpR.data).map((r) => [String(r.profile_id), r]));
  const cpMap = new Map(arr<Row>(cpR.data).map((r) => [String(r.profile_id), r]));

  const idOnFile = new Set(arr<Row>(identityR.data).map((r) => String(r.profile_id)));

  // avatars: one batch signed-url call
  const profiles = arr<Row>(profilesR.data);
  const avatarPaths = profiles
    .map((p) => p.avatar_path as string | null)
    .filter((x): x is string => !!x);
  const avatarUrlByPath = new Map<string, string>();
  if (avatarPaths.length) {
    try {
      const { data } = await sb.storage
        .from('avatars')
        .createSignedUrls(avatarPaths, SIGNED_URL_TTL.avatar);
      for (const e of data ?? []) {
        if (e.path && e.signedUrl) avatarUrlByPath.set(e.path, e.signedUrl);
      }
    } catch {
      /* fall back to initials */
    }
  }

  const workers: Worker[] = [];
  const contractors: Contractor[] = [];

  for (const p of profiles) {
    const id = String(p.id);
    const base = {
      id,
      fullName: String(p.full_name ?? ''),
      phone: String(p.phone ?? ''),
      email: String(p.email ?? ''),
      status: p.status as Worker['status'],
      createdAt: String(p.created_at ?? ''),
      blockedReason: (p.blocked_reason as string | null) ?? undefined,
      blockedAt: (p.blocked_at as string | null) ?? undefined,
      avatarUrl: p.avatar_path ? avatarUrlByPath.get(String(p.avatar_path)) : undefined,
    };

    if (p.role === 'worker') {
      const wp = wpMap.get(id);
      const profs = (wProf.get(id) ?? [])
        .slice()
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((r) => profMap.get(String(r.profession_slug)) ?? String(r.profession_slug));
      workers.push({
        ...base,
        role: 'worker',
        city: String(wp?.city_name ?? ''),
        profession: profs[0] ?? '',
        professions: profs,
        professionCategory: (catMap.get(String(wp?.profession_category_slug ?? '')) ??
          '') as ProfessionCategory,
        skills: (wSkill.get(id) ?? []).map((r) => String(r.skill)),
        certifications: (wCert.get(id) ?? []).map((r) => ({
          id: String(r.id),
          name: String(r.name),
        })),
        experienceYears: Number(wp?.experience_years ?? 0),
        preferredAreas: (wArea.get(id) ?? []).map(
          (r) => areaMap.get(String(r.area_slug)) ?? String(r.area_slug)
        ),
        isAvailable: Boolean(wp?.is_available ?? false),
        availableFrom: (wp?.available_from as string | null) ?? undefined,
        hourlyRate: Number(wp?.hourly_rate ?? 0),
        dailyRate: Number(wp?.daily_rate ?? 0),
        bio: String(wp?.bio ?? ''),
      });
    } else {
      const cp = cpMap.get(id);
      const areasOfOperation = (cArea.get(id) ?? []).map(
        (r) => areaMap.get(String(r.area_slug)) ?? String(r.area_slug)
      );
      contractors.push({
        ...base,
        role: 'contractor',
        companyName: String(cp?.company_name ?? ''),
        contractorRegistrationNumber: String(cp?.contractor_registration_number ?? ''),
        city: String(cp?.city_name ?? ''),
        areasOfOperation,
        areaOfOperation: areasOfOperation[0],
        projectTypes: (cPt.get(id) ?? []).map(
          (r) => ptMap.get(String(r.project_type_slug)) ?? String(r.project_type_slug)
        ),
        licenseDetails: String(cp?.license_details ?? ''),
        bio: (cp?.bio as string | null) ?? undefined,
        licenseValidFrom: (cp?.license_valid_from as string | null) ?? undefined,
        licenseValidUntil: (cp?.license_valid_until as string | null) ?? undefined,
        licenseVerificationStatus:
          (cp?.license_verification_status as ContractorLicenseVerificationStatus) ?? undefined,
        licenseLastVerifiedAt: (cp?.license_last_verified_at as string | null) ?? undefined,
        licenseNextReviewAt: (cp?.license_next_review_at as string | null) ?? undefined,
      });
    }
  }

  return { workers, contractors, idOnFile };
}

// ---------------------------------------------------------------------------
// Admin actions (Edge Function)
// ---------------------------------------------------------------------------

export async function blockUser(userId: string, reason?: string): Promise<void> {
  await invokeFn<{ ok: boolean }>('admin-user-action', {
    action: 'block',
    userId,
    reason: reason ?? null,
  });
}

export async function unblockUser(userId: string): Promise<void> {
  await invokeFn<{ ok: boolean }>('admin-user-action', { action: 'unblock', userId });
}

export async function setContractorRegistrationNumber(
  contractorId: string,
  number: string
): Promise<void> {
  await invokeFn<{ ok: boolean }>('admin-user-action', {
    action: 'set_registration_number',
    contractorId,
    number,
  });
}

export async function setAdminPermission(
  adminId: string,
  permission: AdminPermission,
  grant: boolean
): Promise<void> {
  await invokeFn<{ ok: boolean }>('admin-user-action', {
    action: grant ? 'grant_permission' : 'revoke_permission',
    adminId,
    permission,
  });
}

/** Decrypt one approved user's ID number (live-admin gated server-side). */
export async function revealUserIdNumber(userId: string): Promise<string> {
  const res = await invokeFn<{ ok: boolean; idNumber?: string }>('admin-reveal-id', { userId });
  if (!res.ok || !res.idNumber) throw new Error('id_reveal_failed');
  return res.idNumber;
}
