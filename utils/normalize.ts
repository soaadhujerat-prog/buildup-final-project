// =============================================================================
// Backward-compatibility normalizers
// =============================================================================
// The domain model gained three array-shaped fields (Worker.professions,
// Contractor.areasOfOperation, Worker.certifications as Certification[]).
// Old mock records / anything created before the change may still carry only
// the legacy scalar. These helpers are the ONE place that reconciles the two
// shapes, exactly like a read-time migration would against a real database.
// Every consumer should read through these, never touch the legacy field.
// =============================================================================

import type { Certification, Contractor, JobPost, Worker } from '../types';

type LegacyWorker = Worker & { profession?: string; professions?: unknown };
type LegacyContractor = Contractor & {
  areaOfOperation?: string;
  areasOfOperation?: unknown;
};
type LegacyJob = Pick<JobPost, 'profession'> & { professions?: unknown };

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

/** All specific trades a worker practises. Falls back to the legacy single
 *  `profession` when `professions` is missing/empty. Never empty unless the
 *  record truly has neither. */
export const workerProfessions = (w: Pick<LegacyWorker, 'profession' | 'professions'>): string[] => {
  const list = asStringArray(w.professions);
  if (list.length > 0) return list;
  return w.profession && w.profession.trim() ? [w.profession.trim()] : [];
};

/** The single profession to show where only one fits (cards, list rows). */
export const workerPrimaryProfession = (
  w: Pick<LegacyWorker, 'profession' | 'professions'>
): string => workerProfessions(w)[0] ?? '';

/** Does the worker practise this exact profession? Used by profession filters. */
export const workerHasProfession = (
  w: Pick<LegacyWorker, 'profession' | 'professions'>,
  profession: string
): boolean => {
  const target = profession.trim();
  return workerProfessions(w).some((p) => p.trim() === target);
};

// --- Job professions — mirror of the worker helpers above -------------------

/** All specific trades a job calls for. Falls back to the legacy single
 *  `profession` when `professions` is missing/empty. Never empty unless the
 *  record truly has neither. */
export const jobProfessions = (j: LegacyJob): string[] => {
  const list = asStringArray(j.professions);
  if (list.length > 0) return list;
  return j.profession && j.profession.trim() ? [j.profession.trim()] : [];
};

/** The single profession to show where only one fits (compact list rows). */
export const jobPrimaryProfession = (j: LegacyJob): string =>
  jobProfessions(j)[0] ?? '';

/** Does this job call for the given trade? Used by job filters / Smart Match. */
export const jobHasProfession = (j: LegacyJob, profession: string): boolean => {
  const target = profession.trim();
  return jobProfessions(j).some((p) => p.trim() === target);
};

/** Regions a contractor operates in. Falls back to the legacy single
 *  `areaOfOperation`. */
export const contractorAreas = (
  c: Pick<LegacyContractor, 'areaOfOperation' | 'areasOfOperation'>
): string[] => {
  const list = asStringArray(c.areasOfOperation);
  if (list.length > 0) return list;
  return c.areaOfOperation && c.areaOfOperation.trim() ? [c.areaOfOperation.trim()] : [];
};

/** Coerce a certifications value that might be the legacy `string[]` into the
 *  current `Certification[]` shape. */
export const normalizeCertifications = (
  value: ReadonlyArray<string | Certification> | undefined
): Certification[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) =>
      typeof c === 'string'
        ? c.trim()
          ? { name: c.trim() }
          : null
        : c && typeof c.name === 'string' && c.name.trim()
        ? c
        : null
    )
    .filter((c): c is Certification => c !== null);
};

/** Just the certificate names — for compact "תעודה א׳, תעודה ב׳" summaries. */
export const certificationNames = (
  value: ReadonlyArray<string | Certification> | undefined
): string[] => normalizeCertifications(value).map((c) => c.name);
