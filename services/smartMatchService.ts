// =============================================================================
// BuildUp – Smart Match service  (FRONTEND-ONLY for now)
// =============================================================================
// The Smart Match screen calls ONE function here:
//
//     getSmartMatches(query) : Promise<SmartMatchResult[]>
//
// Today the implementation ranks the contractor's approved workers locally,
// using ONLY real Worker / JobPost / Assignment fields. It never invents a
// number: a factor with no data (semantic analysis, a rate that can't be
// compared, distance in km) is returned as `null` and left out of the
// percentage instead of scored as zero.
//
// Backend swap (later, no screen change):
//   The body of getSmartMatches() becomes a single call —
//     const { data, error } = await supabase.functions.invoke('smart-match', {
//       body: { jobId: query.jobId },
//     });
//     if (error) throw error;
//     return data.results as SmartMatchResult[];
//   The Edge Function runs the same weighted 100-point model against the DB
//   and adds the OpenAI `aiSummary` / real `distanceKm`. The extra arrays on
//   `query` (jobs / workers / assignments) simply stop being needed.
// =============================================================================

import {
  Assignment,
  CompensationStatus,
  JobPost,
  SmartMatchBreakdown,
  SmartMatchLevel,
  SmartMatchResult,
  Worker,
} from '../types';
import { workerProfessions, jobProfessions } from '../utils/normalize';
import { areaOf } from '../utils/matching';
import {
  getWorkerContractorRelationship,
  hasActiveAssignment,
} from './assignmentService';
import { isBackendEnabled } from '../config/env';
import { getSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Weights — the future 100-point model. Kept here so the local matcher and a
// backend implementation share one definition.
//
// Profession is the single biggest factor AND a gate: matching one of the
// job's required trades is what makes someone a candidate at all, so it can
// never be out-weighed by experience + availability + budget + location on
// their own (see the profession-mismatch cap in computeSmartMatch).
// Experience / availability / compensation / distance / skills are all
// "significant". Shared work history is a small bonus only. Semantic (the
// future OpenAI pass) has no local score and is excluded from the total.
// ---------------------------------------------------------------------------

export const SMART_MATCH_WEIGHTS = {
  profession: 30,
  experience: 13,
  availability: 12,
  compensation: 12,
  skills: 12,
  distance: 11,
  sharedHistory: 5,
  semantic: 5,
} as const;

export type SmartMatchFactor = keyof typeof SMART_MATCH_WEIGHTS;

/** A worker whose trade is NOT one the job asked for can still be shown, but
 *  their match must read as partial/low — never "התאמה טובה"/"גבוהה" just
 *  because they are cheap, near and free. These are hard ceilings applied
 *  AFTER the weighted score:
 *    - no profession overlap at all       → capped at 45  ("התאמה חלקית")
 *    - same category but not the trade     → capped at 79  ("התאמה טובה")
 *    - exact trade match                   → no cap
 */
export const PROFESSION_MATCH_CAP = {
  none: 45,
  category: 79,
} as const;

// ---------------------------------------------------------------------------
// Level + label helpers (shared by the screen and its cards)
// ---------------------------------------------------------------------------

export const levelForPercent = (percent: number): SmartMatchLevel => {
  if (percent >= 80) return 'high';
  if (percent >= 60) return 'good';
  if (percent >= 40) return 'partial';
  return 'low';
};

export const SMART_MATCH_LEVEL_LABEL: Record<SmartMatchLevel, string> = {
  high: 'התאמה גבוהה',
  good: 'התאמה טובה',
  partial: 'התאמה חלקית',
  low: 'התאמה נמוכה',
};

export type SmartMatchTone = SmartMatchLevel;

/** One tone name per level — the card/score components resolve it to a
 *  colour through the BuildUp theme, so the palette stays small. */
export const SMART_MATCH_LEVEL_TONE: Record<SmartMatchLevel, SmartMatchTone> = {
  high: 'high',
  good: 'good',
  partial: 'partial',
  low: 'low',
};

export const COMPENSATION_LABEL: Record<CompensationStatus, string> = {
  within_budget: 'בתוך התקציב',
  slightly_above: 'מעט מעל התקציב',
  above_budget: 'מעל התקציב',
  unknown: 'אין מספיק מידע להשוואת תעריף',
};

// ---------------------------------------------------------------------------
// Individual factor scorers
// ---------------------------------------------------------------------------
// Each returns a score (0..weight, or null when the factor can't be judged),
// plus optional strength / concern bullets phrased for the contractor.

interface FactorOutcome {
  score: number | null;
  strength?: string;
  concern?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

type ProfessionMatchKind = 'exact' | 'category' | 'none';

interface ProfessionOutcome extends FactorOutcome {
  kind: ProfessionMatchKind;
}

/** Profession match. Uses jobProfessions(job) / workerProfessions(worker) —
 *  a job may list several trades and matching ANY one of them is a full,
 *  valid profession match. Never falls back to the single `job.profession`
 *  string. */
function scoreProfession(worker: Worker, job: JobPost): ProfessionOutcome {
  const max = SMART_MATCH_WEIGHTS.profession;
  const jobProfs = jobProfessions(job).map(norm).filter(Boolean);
  const workerProfs = workerProfessions(worker).map(norm).filter(Boolean);
  const exact = jobProfs.some((jp) => workerProfs.includes(jp));

  if (exact) {
    return { kind: 'exact', score: max, strength: 'מקצוע תואם לדרישת המשרה' };
  }
  if (worker.professionCategory === job.professionCategory) {
    return {
      kind: 'category',
      score: Math.round(max * 0.5),
      strength: `אותו תחום מקצועי (${worker.professionCategory})`,
      concern: 'המקצוע המדויק שנדרש במשרה אינו אחד ממקצועות העובד',
    };
  }
  return {
    kind: 'none',
    score: Math.round(max * 0.15),
    concern: `המקצוע (${worker.professionCategory}) אינו תואם את דרישת המשרה`,
  };
}

function scoreSkills(worker: Worker, job: JobPost): FactorOutcome {
  const max = SMART_MATCH_WEIGHTS.skills;
  const reqCerts = job.requiredCertifications ?? [];
  const requirements = job.requirements ?? [];

  // Nothing on the job to match skills/certs against -> not assessable.
  if (reqCerts.length === 0 && requirements.length === 0) {
    return { score: null };
  }

  const workerCerts = (worker.certifications ?? []).map((c) => norm(c.name));
  const workerSkills = (worker.skills ?? []).map(norm).filter((s) => s.length >= 2);

  // --- required certifications: coverage of an explicit checklist ---
  let certRatio = 1;
  const missingCerts: string[] = [];
  if (reqCerts.length > 0) {
    let covered = 0;
    reqCerts.forEach((rc) => {
      const r = norm(rc);
      const hit = workerCerts.some((wc) => wc.includes(r) || r.includes(wc));
      if (hit) covered += 1;
      else missingCerts.push(rc);
    });
    certRatio = covered / reqCerts.length;
  }

  // --- free-text requirements vs the worker's listed skills ---
  const matchedSkills: string[] = [];
  let reqRatio = 1;
  if (requirements.length > 0) {
    let covered = 0;
    requirements.forEach((req) => {
      const r = norm(req);
      const hit = workerSkills.some((ws) => r.includes(ws) || ws.includes(r));
      if (hit) covered += 1;
    });
    reqRatio = covered / requirements.length;
    (worker.skills ?? []).forEach((sk) => {
      const s = norm(sk);
      if (requirements.some((req) => norm(req).includes(s) || s.includes(norm(req)))) {
        matchedSkills.push(sk);
      }
    });
  }

  // Weight the two signals by how much the job actually specified.
  const parts: number[] = [];
  if (reqCerts.length > 0) parts.push(certRatio);
  if (requirements.length > 0) parts.push(reqRatio);
  const ratio = parts.reduce((a, b) => a + b, 0) / parts.length;

  const outcome: FactorOutcome = { score: Math.round(max * ratio) };
  if (reqCerts.length > 0 && missingCerts.length === 0) {
    outcome.strength = 'כל התעודות הנדרשות קיימות';
  } else if (missingCerts.length > 0) {
    outcome.concern = `חסרות תעודות: ${missingCerts.join(', ')}`;
  }
  if (matchedSkills.length > 0 && !outcome.strength) {
    outcome.strength = `מיומנויות רלוונטיות: ${matchedSkills.slice(0, 3).join(', ')}`;
  }
  return outcome;
}

function scoreExperience(worker: Worker): FactorOutcome {
  const max = SMART_MATCH_WEIGHTS.experience;
  const years = Math.max(0, worker.experienceYears ?? 0);
  // 8+ years -> full marks, linear below that.
  const ratio = Math.min(1, years / 8);
  const outcome: FactorOutcome = { score: Math.round(max * ratio) };
  if (years >= 3) {
    outcome.strength = `${years} שנות ניסיון`;
  } else if (years < 2) {
    outcome.concern = `ניסיון מועט יחסית (${years} שנים)`;
  }
  return outcome;
}

function scoreAvailability(worker: Worker, job: JobPost): FactorOutcome {
  const max = SMART_MATCH_WEIGHTS.availability;
  if (worker.isAvailable) {
    return { score: max, strength: 'זמין לעבודה מיד' };
  }
  if (worker.availableFrom) {
    const from = new Date(worker.availableFrom).getTime();
    const start = new Date(job.startDate).getTime();
    if (!isNaN(from) && !isNaN(start) && from <= start) {
      return {
        score: Math.round(max * 0.8),
        strength: 'פנוי לפני מועד תחילת המשרה',
      };
    }
    return {
      score: Math.round(max * 0.3),
      concern: `פנוי רק מ-${worker.availableFrom}, אחרי מועד ההתחלה`,
    };
  }
  return { score: Math.round(max * 0.2), concern: 'לא סומן כזמין כרגע' };
}

interface CompensationOutcome extends FactorOutcome {
  status: CompensationStatus;
}

function scoreCompensation(worker: Worker, job: JobPost): CompensationOutcome {
  const max = SMART_MATCH_WEIGHTS.compensation;

  // Pick the one rate unit BOTH sides actually specify. Never mix hourly and
  // daily, never invent a budget the job doesn't carry.
  let jobRate: number | undefined;
  let workerRate: number | undefined;
  if (job.dailyRate && worker.dailyRate) {
    jobRate = job.dailyRate;
    workerRate = worker.dailyRate;
  } else if (job.hourlyRate && worker.hourlyRate) {
    jobRate = job.hourlyRate;
    workerRate = worker.hourlyRate;
  }

  if (!jobRate || !workerRate) {
    return { score: null, status: 'unknown' };
  }

  const ratio = workerRate / jobRate;
  if (ratio <= 1.0) {
    return { score: max, status: 'within_budget', strength: 'התעריף בתוך תקציב המשרה' };
  }
  if (ratio <= 1.1) {
    return {
      score: Math.round(max * 0.65),
      status: 'slightly_above',
      concern: 'התעריף מעט מעל תקציב המשרה',
    };
  }
  return {
    score: Math.round(max * 0.25),
    status: 'above_budget',
    concern: 'התעריף גבוה מתקציב המשרה',
  };
}

interface DistanceOutcome extends FactorOutcome {
  distanceKm?: number;
}

function scoreDistance(worker: Worker, job: JobPost): DistanceOutcome {
  const max = SMART_MATCH_WEIGHTS.distance;
  // No coordinates exist on Worker or JobPost yet, so there is never a real
  // km figure — only city / area comparison. `distanceKm` stays undefined
  // until a backend adds it.
  if (worker.city && job.city && norm(worker.city) === norm(job.city)) {
    return { score: max, strength: `אותה עיר (${job.city})` };
  }
  const workerArea = areaOf(worker.city);
  const jobArea = areaOf(job.city);
  if (worker.preferredAreas?.some((a) => a === jobArea)) {
    return { score: Math.round(max * 0.75), strength: `אזור עבודה מועדף (${jobArea})` };
  }
  if (workerArea !== 'אחר' && workerArea === jobArea) {
    return { score: Math.round(max * 0.65), strength: `אזור קרוב (${workerArea})` };
  }
  return { score: Math.round(max * 0.25), concern: `ממוקם בעיר אחרת (${worker.city})` };
}

function scoreSharedHistory(
  worker: Worker,
  job: JobPost,
  assignments: Assignment[]
): FactorOutcome {
  const max = SMART_MATCH_WEIGHTS.sharedHistory;
  // Source of truth: assignmentService. A cancelled-only pairing is 'never';
  // 'completed' counts as 'past'.
  const rel = getWorkerContractorRelationship(
    assignments,
    worker.id,
    job.contractorId
  );
  if (rel === 'current') {
    // If the active shared assignment IS this job, the card already says
    // "משובץ למשרה זו" — adding a shared-history bullet here would be noise
    // (and "במשרה אחרת" would be wrong). Keep the small bonus, drop the text.
    if (hasActiveAssignment(assignments, job.id, worker.id)) {
      return { score: max };
    }
    // The relationship is 'current' only because of a DIFFERENT job — make
    // that explicit so the contractor doesn't read it as "already on this
    // job".
    return { score: max, strength: 'עובד איתך כעת במשרה אחרת' };
  }
  if (rel === 'past') {
    return { score: max, strength: 'עבדתם יחד בעבר' };
  }
  // Assessable and genuinely 0 — no bonus, but not a "concern" either.
  return { score: 0 };
}

// ---------------------------------------------------------------------------
// Compose one worker's result
// ---------------------------------------------------------------------------

export function computeSmartMatch(
  worker: Worker,
  job: JobPost,
  assignments: Assignment[]
): SmartMatchResult {
  const profession = scoreProfession(worker, job);
  const skills = scoreSkills(worker, job);
  const experience = scoreExperience(worker);
  const availability = scoreAvailability(worker, job);
  const compensation = scoreCompensation(worker, job);
  const distance = scoreDistance(worker, job);
  const sharedHistory = scoreSharedHistory(worker, job, assignments);

  const breakdown: SmartMatchBreakdown = {
    profession: profession.score,
    skills: skills.score,
    experience: experience.score,
    availability: availability.score,
    compensation: compensation.score,
    distance: distance.score,
    sharedHistory: sharedHistory.score,
    // No backend -> no semantic analysis. Excluded from the percentage.
    semantic: null,
  };

  // Percentage over ONLY the factors that could be assessed.
  let earned = 0;
  let possible = 0;
  (Object.keys(SMART_MATCH_WEIGHTS) as SmartMatchFactor[]).forEach((f) => {
    const v = breakdown[f];
    if (v === null || v === undefined) return;
    earned += v;
    possible += SMART_MATCH_WEIGHTS[f];
  });
  const weighted = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  // Profession gate — a worker who is not in one of the job's trades must
  // read as a partial/low match, no matter how strong experience /
  // availability / budget / location are. Exact match is never capped.
  const cap =
    profession.kind === 'none'
      ? PROFESSION_MATCH_CAP.none
      : profession.kind === 'category'
      ? PROFESSION_MATCH_CAP.category
      : 100;
  const matchPercent = Math.min(weighted, cap);

  const ordered: FactorOutcome[] = [
    profession,
    skills,
    experience,
    availability,
    compensation,
    distance,
    sharedHistory,
  ];
  const strengths = ordered
    .map((o) => o.strength)
    .filter((s): s is string => !!s);
  const concerns = ordered
    .map((o) => o.concern)
    .filter((s): s is string => !!s);

  return {
    workerId: worker.id,
    matchPercent,
    matchLevel: levelForPercent(matchPercent),
    breakdown,
    strengths,
    concerns,
    // aiSummary intentionally omitted — no backend, no fake explanation.
    distanceKm: distance.distanceKm,
    compensationStatus: compensation.status,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SmartMatchQuery {
  jobId: string;
  /** Local data pools. A backend implementation ignores these and reads the
   *  DB instead (see the file header). */
  jobs: JobPost[];
  workers: Worker[];
  assignments: Assignment[];
}

const compareResults = (a: SmartMatchResult, b: SmartMatchResult): number => {
  if (b.matchPercent !== a.matchPercent) return b.matchPercent - a.matchPercent;
  const ap = a.breakdown.profession ?? 0;
  const bp = b.breakdown.profession ?? 0;
  if (bp !== ap) return bp - ap;
  return (b.breakdown.experience ?? 0) - (a.breakdown.experience ?? 0);
};

/** Rank the approved workers for a job, best match first. Async on purpose:
 *  the screen already treats this as a network-style call, so swapping in the
 *  Supabase Edge Function later needs no screen change. */
export async function getSmartMatches(
  query: SmartMatchQuery
): Promise<SmartMatchResult[]> {
  // ---- Backend path (Phase 9A): real server-side + AI-assisted matching ----
  // The `smart-match` Edge Function authenticates the caller, re-checks
  // contractor ownership + job eligibility, pre-filters candidates
  // deterministically, then runs the hybrid (deterministic + bounded AI) model.
  // The local pools on `query` are ignored — the function reads the live DB.
  // Any failure throws; SmartMatchScreen already renders its Hebrew error
  // state. There is NO silent fallback to the local matcher.
  if (isBackendEnabled()) {
    const { data, error } = await getSupabase().functions.invoke('smart-match', {
      body: { jobId: query.jobId },
    });
    if (error) throw error;
    const results = (data as { results?: SmartMatchResult[] } | null)?.results;
    return Array.isArray(results) ? results : [];
  }

  // ---- Mock path (EXPO_PUBLIC_USE_BACKEND=false): unchanged local matcher ----
  const job = query.jobs.find((j) => j.id === query.jobId);
  if (!job) return [];

  // Small deliberate pause so the "analysing" state is visible on device.
  // This is pacing only — it carries no data and the real Edge Function call
  // replaces it entirely.
  await new Promise<void>((resolve) => setTimeout(resolve, 350));

  return query.workers
    .filter((w) => w.status === 'approved')
    .map((w) => computeSmartMatch(w, job, query.assignments))
    .sort(compareResults);
}
