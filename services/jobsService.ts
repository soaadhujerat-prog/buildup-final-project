// =============================================================================
// BuildUp – Jobs service (Phase 4A · real job READ layer)
// =============================================================================
// Reads jobs from the live Supabase schema through RLS. Writes (create / edit —
// 4B; close / reopen / delete — 4C) go through SECURITY DEFINER RPCs below.
//
// SOURCE-OF-TRUTH RULE
//   `public.job_registration_state` (a SECURITY-INVOKER view) is the ONLY
//   source of truth for registration state. This service maps:
//     open_for_applications -> JobPost.acceptingApplications
//     closure_reason        -> JobPost.registrationClosureReason
//     recruitment_cycle     -> JobPost.recruitmentCycle
//   It NEVER persists or re-derives acceptingApplications from capacity counts.
//
// The view has no FK PostgREST can embed, so it is fetched alongside `jobs`
// and merged by job_id.
// =============================================================================

import type { JobPost, JobStatus, ProfessionCategory } from '../types';

import { dmyToIso } from '../utils/helpers';
import { getSupabase } from './supabaseClient';
import { FunctionError, invokeFn } from './functionsClient';
import {
  getSignedUrl,
  removeObject,
  uploadToFolder,
} from './storageService';

// ---------------------------------------------------------------------------
// DB row shapes (only the columns this service selects)
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  contractor_id: string;
  title: string;
  description: string;
  profession_category_slug: string;
  city_id: number | null;
  city_name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  start_date: string;
  end_date: string | null;
  duration: string;
  hourly_rate: number | string | null;
  daily_rate: number | string | null;
  workers_needed: number;
  status: JobStatus;
  urgent: boolean;
  posted_at: string;
  updated_at: string | null;
  closed_manually: boolean;
  recruitment_cycle: number;
  job_professions: Array<{ profession_slug: string; is_primary: boolean }> | null;
  job_required_certifications: Array<{ name: string }> | null;
  job_requirements: Array<{ text: string; sort_order: number }> | null;
  job_worksite_images: Array<{ path: string; sort_order: number }> | null;
}

interface RegistrationStateRow {
  job_id: string;
  workers_needed: number | null;
  closed_manually: boolean | null;
  recruitment_cycle: number | null;
  filled_count: number | null;
  remaining_slots: number | null;
  is_full: boolean | null;
  open_for_applications: boolean | null;
  closure_reason: 'manual' | 'capacity' | null;
}

const JOB_SELECT =
  'id, contractor_id, title, description, profession_category_slug, ' +
  'city_id, city_name, address, lat, lon, start_date, end_date, duration, ' +
  'hourly_rate, daily_rate, workers_needed, status, urgent, posted_at, ' +
  'updated_at, closed_manually, recruitment_cycle, ' +
  'job_professions ( profession_slug, is_primary ), ' +
  'job_required_certifications ( name ), ' +
  'job_requirements ( text, sort_order ), ' +
  'job_worksite_images ( path, sort_order )';

// ---------------------------------------------------------------------------
// Taxonomy (slug -> Hebrew label). Small reference tables; memoised per session.
// ---------------------------------------------------------------------------

export interface JobTaxonomy {
  category: Map<string, string>;
  profession: Map<string, string>;
}

let taxonomyPromise: Promise<JobTaxonomy> | null = null;

async function loadJobTaxonomy(): Promise<JobTaxonomy> {
  if (taxonomyPromise) return taxonomyPromise;
  taxonomyPromise = (async () => {
    const sb = getSupabase();
    const [cats, profs] = await Promise.all([
      sb.from('profession_categories').select('slug, name'),
      sb.from('professions').select('slug, name'),
    ]);
    if (cats.error) throw cats.error;
    if (profs.error) throw profs.error;
    const toMap = (rows: Array<{ slug: string; name: string }> | null): Map<string, string> =>
      new Map((rows ?? []).map((r) => [r.slug, r.name]));
    return {
      category: toMap(cats.data as Array<{ slug: string; name: string }> | null),
      profession: toMap(profs.data as Array<{ slug: string; name: string }> | null),
    };
  })().catch((err) => {
    taxonomyPromise = null; // let a later call retry
    throw err;
  });
  return taxonomyPromise;
}

// ---------------------------------------------------------------------------
// Mapper: DB row (+ registration-state row) -> the existing JobPost shape
// ---------------------------------------------------------------------------

const num = (v: number | string | null | undefined): number | undefined =>
  v === null || v === undefined ? undefined : Number(v);

/**
 * Pure. `state` MUST come from job_registration_state — it is the only source
 * of truth for acceptingApplications / registrationClosureReason. When it is
 * missing (should not happen for a visible job) the job is treated as CLOSED,
 * never silently "open".
 *
 * `worksiteImages` (optional) are already-resolved `{ path, url }` pairs — list
 * callers omit them (JobCard shows no images); getJobById passes signed URLs
 * so the detail / edit screens get a display URL AND the path to round-trip.
 */
export function mapJobRow(
  row: JobRow,
  state: RegistrationStateRow | null | undefined,
  tax: JobTaxonomy,
  worksiteImages?: Array<{ path: string; url: string }>
): JobPost {
  const professions = [...(row.job_professions ?? [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((p) => tax.profession.get(p.profession_slug) ?? p.profession_slug);

  const requirements = [...(row.job_requirements ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.text);

  const categoryLabel =
    tax.category.get(row.profession_category_slug) ?? row.profession_category_slug;

  const acceptingApplications = state ? state.open_for_applications === true : false;
  const registrationClosureReason = state?.closure_reason ?? undefined;

  const job: JobPost = {
    id: row.id,
    contractorId: row.contractor_id,
    title: row.title,
    description: row.description,
    profession: professions[0] ?? '',
    professions,
    professionCategory: categoryLabel as ProfessionCategory,
    city: row.city_name,
    address: row.address,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    duration: row.duration,
    hourlyRate: num(row.hourly_rate),
    dailyRate: num(row.daily_rate),
    workersNeeded: row.workers_needed,
    requiredCertifications: (row.job_required_certifications ?? []).map((c) => c.name),
    requirements,
    status: row.status,
    urgent: row.urgent,
    postedAt: row.posted_at,
    updatedAt: row.updated_at ?? undefined,
    acceptingApplications,
    registrationClosureReason,
    recruitmentCycle: state?.recruitment_cycle ?? row.recruitment_cycle,
  };

  if (worksiteImages && worksiteImages.length > 0) {
    job.worksiteImages = worksiteImages.map((w) => w.url);
    job.worksiteImagePaths = worksiteImages.map((w) => w.path);
  }
  return job;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function fetchStates(jobIds: string[]): Promise<Map<string, RegistrationStateRow>> {
  if (jobIds.length === 0) return new Map();
  const { data, error } = await getSupabase()
    .from('job_registration_state')
    .select(
      'job_id, workers_needed, closed_manually, recruitment_cycle, filled_count, ' +
        'remaining_slots, is_full, open_for_applications, closure_reason'
    )
    .in('job_id', jobIds);
  if (error) throw error;
  return new Map(
    ((data as unknown as RegistrationStateRow[] | null) ?? []).map((s) => [s.job_id, s])
  );
}

/**
 * Every job currently OPEN for applications and visible to the caller — the
 * worker browse pool. `open_for_applications = true` is filtered on the view
 * (the authoritative predicate: status='open' AND NOT closed_manually AND not
 * full). RLS already scopes the underlying `jobs` rows to open + visible.
 */
export async function listOpenJobs(): Promise<JobPost[]> {
  const sb = getSupabase();
  const tax = await loadJobTaxonomy();

  const { data: states, error: stErr } = await sb
    .from('job_registration_state')
    .select(
      'job_id, workers_needed, closed_manually, recruitment_cycle, filled_count, ' +
        'remaining_slots, is_full, open_for_applications, closure_reason'
    )
    .eq('open_for_applications', true);
  if (stErr) throw stErr;

  const stateRows = (states as unknown as RegistrationStateRow[] | null) ?? [];
  const ids = stateRows.map((s) => s.job_id);
  if (ids.length === 0) return [];
  const stateById = new Map(stateRows.map((s) => [s.job_id, s]));

  const { data: rows, error } = await sb.from('jobs').select(JOB_SELECT).in('id', ids);
  if (error) throw error;

  return ((rows as unknown as JobRow[] | null) ?? []).map((r) =>
    mapJobRow(r, stateById.get(r.id), tax)
  );
}

/**
 * Jobs for one contractor (MyJobs / dashboard / admin per-contractor view),
 * open or closed. Pass `contractorId` for a specific contractor (a contractor
 * views their own; an admin views any). Omit it ONLY for an admin global load
 * (RLS then returns every job to an admin). AppContext always passes the id
 * for a contractor session.
 */
export async function listContractorJobs(contractorId?: string): Promise<JobPost[]> {
  const sb = getSupabase();
  const tax = await loadJobTaxonomy();

  let query = sb.from('jobs').select(JOB_SELECT);
  if (contractorId) query = query.eq('contractor_id', contractorId);

  const { data: rows, error } = await query;
  if (error) throw error;

  const jobRows = (rows as unknown as JobRow[] | null) ?? [];
  if (jobRows.length === 0) return [];

  const stateById = await fetchStates(jobRows.map((r) => r.id));
  return jobRows.map((r) => mapJobRow(r, stateById.get(r.id), tax));
}

/**
 * One job by id, with its registration state and — for the detail view —
 * worksite images resolved to short-lived signed URLs. Returns null when the
 * caller cannot see the job (RLS) or it does not exist. Used as the deep-link
 * fallback when a job is not already in AppContext's loaded set.
 */
export async function getJobById(id: string): Promise<JobPost | null> {
  const sb = getSupabase();
  const tax = await loadJobTaxonomy();

  const [{ data: row, error }, { data: state, error: stErr }] = await Promise.all([
    sb.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle(),
    sb
      .from('job_registration_state')
      .select(
        'job_id, workers_needed, closed_manually, recruitment_cycle, filled_count, ' +
          'remaining_slots, is_full, open_for_applications, closure_reason'
      )
      .eq('job_id', id)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (stErr) throw stErr;
  if (!row) return null;

  const jobRow = row as unknown as JobRow;

  // Resolve worksite-image object paths -> signed URLs (private bucket).
  const imagePaths = [...(jobRow.job_worksite_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.path)
    .filter(Boolean);
  const pairs = (
    await Promise.all(
      imagePaths.map(async (p) => ({
        path: p,
        url: await getSignedUrl('worksite-images', p, 3600),
      }))
    )
  ).filter((x): x is { path: string; url: string } => !!x.url);

  return mapJobRow(
    jobRow,
    (state as unknown as RegistrationStateRow | null) ?? null,
    tax,
    pairs
  );
}

// ===========================================================================
// Writes (Phase 4B) — create / edit, transactional via SECURITY DEFINER RPCs
// ===========================================================================
// The RPCs (022_jobs_write_backend.sql) own consistency, taxonomy name->slug
// resolution, the one-primary invariant and the privileged-column allowlist.
// The client only: normalises a few field formats, builds the jsonb payload,
// and does the worksite-image storage I/O (bucket RLS = job_owner).

/** Normalise a date the UI may hand over as DD/MM/YYYY (DatePickerField) or
 *  already ISO into 'YYYY-MM-DD' for the RPC. '' when unset. */
const toDbDate = (v?: string): string => {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const iso = dmyToIso(s);
    return iso ? iso.slice(0, 10) : '';
  }
  return s.slice(0, 10);
};

const isLocalUri = (v: string): boolean => /^(file|content):/i.test(v);

/** Recover the storage object path from a `worksite-images` signed URL we
 *  handed the edit screen earlier (…/object/sign/worksite-images/<path>?token=…). */
const pathFromWorksiteUrl = (url: string): string | null => {
  const m = /\/worksite-images\/([^?]+)(?:\?|$)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
};

/** Build the RPC jsonb payload from a JobPost-shaped object. `keys`, when
 *  given, restricts it to those fields (edit = only what changed / the screen
 *  sends); omit for create (all fields). Never includes worksite images,
 *  contractor id, status, or any derived/system field. */
type JobWritable = Partial<
  Pick<
    JobPost,
    | 'title'
    | 'description'
    | 'professionCategory'
    | 'professions'
    | 'city'
    | 'address'
    | 'startDate'
    | 'endDate'
    | 'duration'
    | 'hourlyRate'
    | 'dailyRate'
    | 'workersNeeded'
    | 'urgent'
    | 'requirements'
    | 'requiredCertifications'
    | 'updatedAt'
  >
>;

function buildPayload(src: JobWritable): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined) d[k] = v;
  };
  put('title', src.title?.trim());
  put('description', src.description?.trim());
  put('professionCategory', src.professionCategory); // Hebrew name -> slug in RPC
  put('professions', src.professions);
  put('city', src.city);
  put('address', src.address?.trim());
  if ('startDate' in src) d.startDate = toDbDate(src.startDate);
  if ('endDate' in src) d.endDate = toDbDate(src.endDate ?? undefined);
  put('duration', src.duration?.trim());
  if ('hourlyRate' in src) d.hourlyRate = src.hourlyRate ?? null;
  if ('dailyRate' in src) d.dailyRate = src.dailyRate ?? null;
  put('workersNeeded', src.workersNeeded);
  put('urgent', src.urgent);
  put('requirements', src.requirements);
  put('requiredCertifications', src.requiredCertifications);
  put('updatedAt', src.updatedAt);
  return d;
}

async function uploadWorksiteImage(jobId: string, localUri: string): Promise<string> {
  return uploadToFolder('worksite-images', jobId, localUri, { kind: 'img' });
}

/**
 * Create a job owned by the authenticated contractor. `worksiteLocalUris` are
 * fresh `file://` picks — uploaded to worksite-images/{jobId}/ AFTER the job
 * exists (bucket RLS needs job_owner), then linked via set_job_worksite_images.
 * Returns the real DB job id.
 */
export async function createJobBackend(
  src: JobWritable,
  worksiteLocalUris: string[] = []
): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('create_job', { p_data: buildPayload(src) });
  if (error) throw error;
  const jobId = data as string;

  const locals = worksiteLocalUris.filter((u) => u && isLocalUri(u));
  if (locals.length > 0) {
    const paths: string[] = [];
    for (const uri of locals) paths.push(await uploadWorksiteImage(jobId, uri));
    const { error: imgErr } = await sb.rpc('set_job_worksite_images', {
      p_job_id: jobId,
      p_paths: paths,
    });
    if (imgErr) throw imgErr;
  }
  return jobId;
}

/**
 * Edit an existing job (owner or live admin only — enforced in update_job).
 * `worksiteImages` (when present in the patch) is the FINAL ordered display
 * list from the edit screen: a mix of kept signed URLs and new `file://`
 * picks. Existing images are preserved unless dropped from that list; dropped
 * storage objects are best-effort removed after the DB association is updated.
 * `worksiteImages` absent  => the job's images are left completely untouched.
 */
export async function updateJobBackend(
  jobId: string,
  patch: JobWritable & { worksiteImages?: string[] }
): Promise<void> {
  const sb = getSupabase();

  const { worksiteImages, ...scalar } = patch;
  const { error } = await sb.rpc('update_job', {
    p_job_id: jobId,
    p_data: buildPayload(scalar),
  });
  if (error) throw error;

  if (worksiteImages === undefined) return; // images not being edited

  // current DB paths (for orphan cleanup)
  const { data: current, error: curErr } = await sb
    .from('job_worksite_images')
    .select('path')
    .eq('job_id', jobId);
  if (curErr) throw curErr;
  const currentPaths = new Set(
    ((current as Array<{ path: string }> | null) ?? []).map((r) => r.path)
  );

  // resolve the final ordered path list
  const finalPaths: string[] = [];
  for (const entry of worksiteImages) {
    if (!entry) continue;
    if (isLocalUri(entry)) {
      finalPaths.push(await uploadWorksiteImage(jobId, entry));
    } else {
      const p = pathFromWorksiteUrl(entry);
      if (p) finalPaths.push(p);
    }
  }

  const { error: setErr } = await sb.rpc('set_job_worksite_images', {
    p_job_id: jobId,
    p_paths: finalPaths,
  });
  if (setErr) throw setErr;

  // best-effort remove objects no longer referenced
  const kept = new Set(finalPaths);
  for (const p of currentPaths) {
    if (!kept.has(p)) await removeObject('worksite-images', p);
  }
}

// ===========================================================================
// Writes (Phase 4C) — close / reopen / delete
// ===========================================================================
// job_registration_state stays the ONLY source of truth for the open/closed
// state. The contractor toggle writes exactly ONE column (jobs.closed_manually)
// through set_job_closed_manually; callers MUST re-read the job afterwards and
// take open_for_applications / closure_reason from the view, never assume them.
// Delete is delegated to the `delete-job` Edge Function (authoritative DB
// delete first, then server-side Storage cleanup) — see deleteJobBackend.

/**
 * Contractor manual close / reopen. `closed = true` closes registration
 * (job_registration_state.closure_reason becomes 'manual'); `closed = false`
 * only clears the manual flag — the view decides whether the job actually
 * reopens (a job at capacity stays closed with closure_reason 'capacity').
 * Owner (still approved) or live admin only — enforced in the RPC.
 */
export async function setJobClosedManually(
  jobId: string,
  closed: boolean
): Promise<void> {
  const { error } = await getSupabase().rpc('set_job_closed_manually', {
    p_job_id: jobId,
    p_closed: closed,
  });
  if (error) throw error;
}

/**
 * True when the job currently has zero applications / invitations / assignments
 * and the caller (owner / live admin) may hard-delete it. Drives the JobDetails
 * menu choice between "מחק משרה" and "סגור משרה להרשמה" on the backend path,
 * where the synchronous mock staffing arrays are not valid. The DB delete
 * trigger stays authoritative even if this value is momentarily stale.
 */
export async function jobIsDeletable(jobId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('job_is_deletable', {
    p_job_id: jobId,
  });
  if (error) throw error;
  return data === true;
}

/** Thrown by `deleteJobBackend` when the job cannot be hard-deleted because it
 *  has activity — the caller shows the "close registration instead" message. */
export class JobHasActivityError extends Error {
  constructor() {
    super('job has activity and cannot be deleted');
    this.name = 'JobHasActivityError';
  }
}

/**
 * Hard-delete a clean job. Delegated to the `delete-job` Edge Function so the
 * DB delete is authoritative and happens BEFORE any destructive Storage
 * cleanup:
 *   • the function re-checks the caller (approved owner / live admin), runs the
 *     authoritative delete through SECURITY DEFINER admin_delete_job (the
 *     jobs_block_delete_with_activity trigger is the final guard), and ONLY
 *     then removes that job's worksite-image objects with server-side Storage
 *     authority.
 *   • a blocked delete (job has activity) → FunctionError 'has_activity' (409)
 *     → JobHasActivityError, and no image is ever touched.
 *   • Storage cleanup failing AFTER a successful delete does NOT fail the call
 *     (the function logs it and returns ok) — the job stays deleted.
 * The client never names a bucket or path; nothing here can delete arbitrary
 * Storage objects.
 */
export async function deleteJobBackend(jobId: string): Promise<void> {
  try {
    await invokeFn<{ ok: true }>('delete-job', { jobId });
  } catch (e) {
    if (
      e instanceof FunctionError &&
      (e.code === 'has_activity' || e.status === 409)
    ) {
      throw new JobHasActivityError();
    }
    throw e;
  }
}
