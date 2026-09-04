// =============================================================================
// BuildUp – Participants service (real profile resolution for staffing)
// =============================================================================
//, a signed-in worker / contractor needs the
// REAL profile of the people referenced by their applications / invitations /
// assignments / jobs (the admin path already has the full directory via
// adminUserService.loadUserDirectory). This service resolves those UUIDs to the
// existing Worker / Contractor domain types with a handful of BULK, RLS-scoped
// SELECTs — no per-card request, no schema/RLS change, no RPC.
//
// AUTHORIZATION is 100% RLS (008), already verified sufficient:
//   • profiles.profiles_select            = can_view_profile(id)
//   • worker_profiles / worker_* _select  = can_view_profile(worker_id|profile_id)
//   • contractor_profiles / contractor_*  = can_view_profile(contractor_id|profile_id)
//   can_view_profile() returns true for a counterpart linked by an
//   application / invitation / assignment (either direction), for a contractor
//   viewing an is_available worker, and for self. An unrelated profile simply
//   does not come back — the caller keeps a neutral fallback.
//
// PRIVACY: only the fields the existing staffing UI renders are selected.
// `user_identity` (ID hash / encrypted ID), licence documents, admin
// permissions and auth metadata are never queried here. Contractor licence
// number / classification / validity are NOT fetched (no worker-facing screen
// shows them) — the mapped Contractor carries '' for those.
// =============================================================================

import type {
  Contractor,
  ContractorLicenseVerificationStatus,
  ProfessionCategory,
  UploadedDocument,
  Worker,
} from '../types';

import { getSupabase } from './supabaseClient';
import { SIGNED_URL_TTL } from './storageService';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface Row {
  [k: string]: unknown;
}
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const dedupe = (ids: Array<string | null | undefined>): string[] =>
  Array.from(new Set(ids.filter((x): x is string => !!x)));

const groupBy = <T extends Row>(rows: T[], key: string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const row of rows) {
    const k = String(row[key]);
    const list = m.get(k);
    if (list) list.push(row);
    else m.set(k, [row]);
  }
  return m;
};

const toMap = (rows: Array<{ slug: string; name: string }>): Map<string, string> =>
  new Map(rows.map((x) => [x.slug, x.name]));

async function loadTaxonomy() {
  const sb = getSupabase();
  const [cat, prof, area, pt] = await Promise.all([
    sb.from('profession_categories').select('slug, name'),
    sb.from('professions').select('slug, name'),
    sb.from('areas').select('slug, name'),
    sb.from('project_types').select('slug, name'),
  ]);
  for (const r of [cat, prof, area, pt]) if (r.error) throw r.error;
  return {
    cat: toMap(arr(cat.data)),
    prof: toMap(arr(prof.data)),
    area: toMap(arr(area.data)),
    pt: toMap(arr(pt.data)),
  };
}

async function signAvatars(paths: string[]): Promise<Map<string, string>> {
  return signBucket('avatars', paths);
}

/** Batch signed-URL resolution for one private bucket. Paths the caller may not
 *  read (RLS) simply do not come back — the consumer falls back to a neutral
 *  "not attached" state, never an error. */
async function signBucket(
  bucket: 'avatars' | 'worker-certificates',
  paths: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const real = dedupe(paths);
  if (!real.length) return out;
  try {
    const { data } = await getSupabase()
      .storage.from(bucket)
      .createSignedUrls(real, SIGNED_URL_TTL.avatar);
    for (const e of data ?? []) {
      if (e.path && e.signedUrl) out.set(e.path, e.signedUrl);
    }
  } catch {
    /* fall back to a neutral placeholder */
  }
  return out;
}

const PROFILE_COLS =
  'id, role, full_name, phone, email, status, avatar_path, blocked_reason, blocked_at, created_at';

function baseUser(p: Row, avatarByPath: Map<string, string>) {
  return {
    id: String(p.id),
    fullName: String(p.full_name ?? ''),
    phone: String(p.phone ?? ''),
    email: String(p.email ?? ''),
    status: p.status as Worker['status'],
    createdAt: String(p.created_at ?? ''),
    blockedReason: (p.blocked_reason as string | null) ?? undefined,
    blockedAt: (p.blocked_at as string | null) ?? undefined,
    avatarUrl: p.avatar_path
      ? avatarByPath.get(String(p.avatar_path))
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// workers
// ---------------------------------------------------------------------------

async function fetchWorkers(
  narrow: 'ids' | 'available',
  ids: string[]
): Promise<Worker[]> {
  const sb = getSupabase();

  let pq = sb.from('profiles').select(PROFILE_COLS).eq('role', 'worker');
  if (narrow === 'ids') pq = pq.in('id', ids);
  const profilesR = await pq;
  if (profilesR.error) throw profilesR.error;
  const profiles = arr<Row>(profilesR.data);
  if (!profiles.length) return [];

  const pids = profiles.map((p) => String(p.id));

  const [wpR, profR, skillR, certR, areaR, tax] = await Promise.all([
    sb
      .from('worker_profiles')
      .select(
        'profile_id, profession_category_slug, experience_years, is_available, available_from, hourly_rate, daily_rate, bio, city_name'
      )
      .in('profile_id', pids),
    sb
      .from('worker_professions')
      .select('worker_id, profession_slug, is_primary')
      .in('worker_id', pids),
    sb.from('worker_skills').select('worker_id, skill').in('worker_id', pids),
    sb
      .from('worker_certifications')
      .select('id, worker_id, name, document_path')
      .in('worker_id', pids),
    sb
      .from('worker_preferred_areas')
      .select('worker_id, area_slug')
      .in('worker_id', pids),
    loadTaxonomy(),
  ]);
  for (const r of [wpR, profR, skillR, certR, areaR]) if (r.error) throw r.error;

  const wpMap = new Map(
    arr<Row>(wpR.data).map((r) => [String(r.profile_id), r])
  );
  const profBy = groupBy(arr<Row>(profR.data), 'worker_id');
  const skillBy = groupBy(arr<Row>(skillR.data), 'worker_id');
  const certBy = groupBy(arr<Row>(certR.data), 'worker_id');
  const areaBy = groupBy(arr<Row>(areaR.data), 'worker_id');

  const [avatarByPath, certByPath] = await Promise.all([
    signAvatars(profiles.map((p) => (p.avatar_path as string | null) ?? '').filter(Boolean)),
    signBucket(
      'worker-certificates',
      arr<Row>(certR.data).map((r) => (r.document_path as string | null) ?? '').filter(Boolean)
    ),
  ]);

  return profiles.map((p) => {
    const id = String(p.id);
    const wp = wpMap.get(id);
    const professions = (profBy.get(id) ?? [])
      .slice()
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map(
        (r) => tax.prof.get(String(r.profession_slug)) ?? String(r.profession_slug)
      );
    return {
      ...baseUser(p, avatarByPath),
      role: 'worker' as const,
      city: String(wp?.city_name ?? ''),
      profession: professions[0] ?? '',
      professions,
      professionCategory: (tax.cat.get(
        String(wp?.profession_category_slug ?? '')
      ) ?? '') as ProfessionCategory,
      skills: (skillBy.get(id) ?? []).map((r) => String(r.skill)),
      certifications: (certBy.get(id) ?? []).map((r) => {
        const dp = (r.document_path as string | null) ?? null;
        const url = dp ? certByPath.get(dp) : undefined;
        return {
          id: String(r.id),
          name: String(r.name),
          document:
            dp && url
              ? ({
                  uri: url,
                  fileName: String(r.name) || 'תעודה',
                  type: 'certification',
                  storagePath: dp,
                } as UploadedDocument)
              : undefined,
        };
      }),
      experienceYears: Number(wp?.experience_years ?? 0),
      preferredAreas: (areaBy.get(id) ?? []).map(
        (r) => tax.area.get(String(r.area_slug)) ?? String(r.area_slug)
      ),
      isAvailable: Boolean(wp?.is_available ?? false),
      availableFrom: (wp?.available_from as string | null) ?? undefined,
      hourlyRate: Number(wp?.hourly_rate ?? 0),
      dailyRate: Number(wp?.daily_rate ?? 0),
      bio: String(wp?.bio ?? ''),
    };
  });
}

/** Resolve specific worker UUIDs (referenced by applications / invitations /
 *  assignments). RLS returns only the ones the caller may see. */
export async function loadWorkerSummaries(ids: string[]): Promise<Worker[]> {
  const clean = dedupe(ids);
  if (!clean.length) return [];
  return fetchWorkers('ids', clean);
}

/** Every worker the caller may see (for a contractor: is_available workers +
 *  their own counterparts). Feeds SearchWorkers / SmartMatch with real people. */
export async function loadAvailableWorkerSummaries(): Promise<Worker[]> {
  return fetchWorkers('available', []);
}

// ---------------------------------------------------------------------------
// contractors
// ---------------------------------------------------------------------------

/** Resolve specific contractor UUIDs (job.contractorId / invitation /
 *  assignment). Licence number / classification / validity are intentionally
 *  NOT fetched — no worker-facing screen shows them. */
export async function loadContractorSummaries(
  ids: string[]
): Promise<Contractor[]> {
  const clean = dedupe(ids);
  if (!clean.length) return [];
  const sb = getSupabase();

  const profilesR = await sb
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('role', 'contractor')
    .in('id', clean);
  if (profilesR.error) throw profilesR.error;
  const profiles = arr<Row>(profilesR.data);
  if (!profiles.length) return [];

  const pids = profiles.map((p) => String(p.id));

  const [cpR, areaR, ptR, tax] = await Promise.all([
    sb
      .from('contractor_profiles')
      .select('profile_id, company_name, bio, city_name, license_verification_status')
      .in('profile_id', pids),
    sb
      .from('contractor_areas')
      .select('contractor_id, area_slug')
      .in('contractor_id', pids),
    sb
      .from('contractor_project_types')
      .select('contractor_id, project_type_slug')
      .in('contractor_id', pids),
    loadTaxonomy(),
  ]);
  for (const r of [cpR, areaR, ptR]) if (r.error) throw r.error;

  const cpMap = new Map(
    arr<Row>(cpR.data).map((r) => [String(r.profile_id), r])
  );
  const areaBy = groupBy(arr<Row>(areaR.data), 'contractor_id');
  const ptBy = groupBy(arr<Row>(ptR.data), 'contractor_id');

  const avatarByPath = await signAvatars(
    profiles.map((p) => (p.avatar_path as string | null) ?? '').filter(Boolean)
  );

  return profiles.map((p) => {
    const id = String(p.id);
    const cp = cpMap.get(id);
    const areasOfOperation = (areaBy.get(id) ?? []).map(
      (r) => tax.area.get(String(r.area_slug)) ?? String(r.area_slug)
    );
    return {
      ...baseUser(p, avatarByPath),
      role: 'contractor' as const,
      companyName: String(cp?.company_name ?? ''),
      // not shown to counterparts — kept '' so the domain type is satisfied
      // without pulling the licence number / classification to the client.
      contractorRegistrationNumber: '',
      licenseDetails: '',
      city: String(cp?.city_name ?? ''),
      areasOfOperation,
      areaOfOperation: areasOfOperation[0],
      projectTypes: (ptBy.get(id) ?? []).map(
        (r) => tax.pt.get(String(r.project_type_slug)) ?? String(r.project_type_slug)
      ),
      bio: (cp?.bio as string | null) ?? undefined,
      licenseVerificationStatus: (cp?.license_verification_status as
        | ContractorLicenseVerificationStatus
        | undefined) ?? undefined,
    };
  });
}

/**
 * Shared mapper for the narrow "safe contractor summary" RPCs (migration 054
 * `get_job_publisher`, migration 055 `get_my_favorite_contractors`) — both
 * return the same safe column set (never licence number / details / dates /
 * document, never ID / auth / admin data), so both map through here.
 * `project_type_slugs` is optional on the row: `get_job_publisher` doesn't
 * select it (kept `[]`, unchanged behaviour), `get_my_favorite_contractors`
 * does.
 */
function mapSafeContractorRow(
  p: Row,
  avatarByPath: Map<string, string>,
  tax: { area: Map<string, string>; pt: Map<string, string> }
): Contractor {
  const id = String(p.id);
  const areaSlugs = arr<string>(p.area_slugs).map(String);
  const areasOfOperation = areaSlugs.map((slug) => tax.area.get(slug) ?? slug);
  const ptSlugs = arr<string>(p.project_type_slugs).map(String);
  return {
    id,
    fullName: String(p.full_name ?? ''),
    phone: String(p.phone ?? ''),
    // Not part of either safe RPC — same "kept empty" convention used
    // elsewhere in this module for fields the worker-facing UI never
    // renders for a counterpart.
    email: '',
    createdAt: '',
    // Reachable through can_view_job / a real favorite row only for a real
    // approved contractor (both RPCs filter on p.status = 'approved').
    status: 'approved' as Contractor['status'],
    avatarUrl: p.avatar_path
      ? avatarByPath.get(String(p.avatar_path))
      : undefined,
    role: 'contractor' as const,
    companyName: String(p.company_name ?? ''),
    contractorRegistrationNumber: '',
    licenseDetails: '',
    city: String(p.city_name ?? ''),
    areasOfOperation,
    areaOfOperation: areasOfOperation[0],
    projectTypes: ptSlugs.map((slug) => tax.pt.get(slug) ?? slug),
    bio: (p.bio as string | null) ?? undefined,
    licenseVerificationStatus: (p.license_verification_status as
      | ContractorLicenseVerificationStatus
      | undefined) ?? undefined,
  };
}

/**
 * Safe "publisher" summary for jobs the caller may already view (migration
 * 054), used as the fallback ONLY when `loadContractorSummaries` can't
 * resolve a contractor because no application / invitation / assignment /
 * conversation relationship exists yet (e.g. a worker opening a brand-new
 * open job it has never interacted with).
 *
 * Calls `get_job_publisher(p_job_id)` — a narrow SECURITY DEFINER RPC that
 * re-derives authorization itself from the EXISTING, unmodified
 * `can_view_job(p_job_id)` (never trusts a contractor id from the client;
 * only a job id goes in). `can_view_profile()` / RLS are untouched — this
 * does not broaden who can read `profiles` / `contractor_profiles` directly,
 * it only gives the caller a curated, narrow column set for a job it can
 * already legitimately see.
 *
 * Returns the SAME safe subset `loadContractorSummaries` already returns:
 * licence number / details / valid-from / valid-until / document, ID, and
 * admin data are never fetched here either — the RPC itself does not select
 * them, so there is nothing to accidentally forward.
 */
export async function loadJobPublisherSummaries(
  jobIds: string[]
): Promise<Contractor[]> {
  const clean = dedupe(jobIds);
  if (!clean.length) return [];
  const sb = getSupabase();

  const perJob = await Promise.all(
    clean.map(async (jobId) => {
      const { data, error } = await sb.rpc('get_job_publisher', {
        p_job_id: jobId,
      });
      if (error) throw error;
      return arr<Row>(data);
    })
  );
  const rows = perJob.flat();
  if (!rows.length) return [];

  // The same contractor can own more than one visible job in this batch.
  const byId = new Map<string, Row>();
  rows.forEach((r) => byId.set(String(r.id), r));
  const unique = Array.from(byId.values());

  const [avatarByPath, tax] = await Promise.all([
    signAvatars(
      unique.map((p) => (p.avatar_path as string | null) ?? '').filter(Boolean)
    ),
    loadTaxonomy(),
  ]);

  return unique.map((p) => mapSafeContractorRow(p, avatarByPath, tax));
}

/**
 * Safe summary for the CURRENT WORKER'S OWN favorite contractors (migration
 * 055) — the fallback of last resort so a favorited contractor never
 * disappears from FavoriteContractorsScreen just because their job closed
 * and no other relationship exists. `worker_favorite_contractors` grants NO
 * `can_view_profile()` visibility on its own (by design — see the migration
 * comment); this RPC is a separate, narrow, purpose-built reader scoped
 * entirely server-side to `auth.uid()`'s own favorites, never accepting a
 * worker id from the client, so one worker can never read another's
 * favorites through it. Same safe column set as `loadJobPublisherSummaries` —
 * licence number/details/dates/document, ID, and admin data are never
 * selected by the RPC, so there is nothing here to accidentally forward.
 */
export async function loadMyFavoriteContractorSummaries(): Promise<
  Contractor[]
> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_my_favorite_contractors');
  if (error) throw error;
  const rows = arr<Row>(data);
  if (!rows.length) return [];

  const [avatarByPath, tax] = await Promise.all([
    signAvatars(
      rows.map((p) => (p.avatar_path as string | null) ?? '').filter(Boolean)
    ),
    loadTaxonomy(),
  ]);

  return rows.map((p) => mapSafeContractorRow(p, avatarByPath, tax));
}
