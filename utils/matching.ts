// =============================================================================
// BuildUp – Smart Match scoring engine
// =============================================================================
// Smart Match is a CONTRACTOR-ONLY feature. Given a JobPost the contractor
// has posted, this module ranks approved Workers by how well they match.
//
// The score (0..100) is derived from real worker/job fields, never random.
// Every point of the score is also returned as a MatchReason, so the UI can
// explain the ranking to the contractor.
// =============================================================================

import {
  Worker,
  JobPost,
  MatchResult,
  MatchReason,
  ProfessionCategory,
} from '../types';

// ---------------------------------------------------------------------------
// City -> Area map. Used for locality scoring.
// ---------------------------------------------------------------------------

export const CITY_AREA: Record<string, string> = {
  'תל אביב': 'מרכז',
  'רמת גן': 'מרכז',
  'גבעתיים': 'מרכז',
  'בני ברק': 'מרכז',
  'הרצליה': 'שרון',
  'רעננה': 'שרון',
  'כפר סבא': 'שרון',
  'נתניה': 'שרון',
  'פתח תקווה': 'מרכז',
  'ראשון לציון': 'מרכז',
  'רחובות': 'מרכז',
  'חולון': 'מרכז',
  'ירושלים': 'ירושלים',
  'בית שמש': 'ירושלים',
  'חיפה': 'צפון',
  'קריית אתא': 'צפון',
  'קריית ביאליק': 'צפון',
  'נצרת': 'צפון',
  'עכו': 'צפון',
  'באר שבע': 'דרום',
  'אשדוד': 'דרום',
  'אשקלון': 'דרום',
};

export const areaOf = (city: string): string => CITY_AREA[city] ?? 'אחר';

// ---------------------------------------------------------------------------
// Weights (max points). Total = 100. There is no rating factor — the app
// has no real review mechanism for workers, so ranking never depends on it.
//   profession 50 + location 30 + availability 20 = 100
//   certifications: gates access (required certs missing => penalty), not
//   extra points, so the 100-scale stays honest.
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  profession: 50,
  location: 30,
  availability: 20,
} as const;

// ---------------------------------------------------------------------------
// Individual scorers
// ---------------------------------------------------------------------------

/** Exact profession name match = full points. Same category = partial. */
function scoreProfession(worker: Worker, job: JobPost): MatchReason {
  const w = WEIGHTS.profession;
  let score = 0;
  let label = 'מקצוע שונה';

  if (worker.profession.trim() === job.profession.trim()) {
    score = w;
    label = `מקצוע מדויק: ${worker.profession}`;
  } else if (worker.professionCategory === job.professionCategory) {
    score = Math.round(w * 0.7);
    label = `אותו תחום: ${worker.professionCategory}`;
  } else {
    score = Math.round(w * 0.2);
    label = `מקצוע שונה (${worker.professionCategory} מול ${job.professionCategory})`;
  }

  return { label, score, weight: w, icon: 'construct' };
}

/** Same city = full. Same area = 70%. Different area = 25%. */
function scoreLocation(worker: Worker, job: JobPost): MatchReason {
  const w = WEIGHTS.location;
  const workerArea = areaOf(worker.city);
  const jobArea = areaOf(job.city);

  let score = 0;
  let label = '';

  if (worker.city === job.city) {
    score = w;
    label = `אותה עיר: ${worker.city}`;
  } else if (worker.preferredAreas?.includes(jobArea)) {
    score = Math.round(w * 0.85);
    label = `אזור עבודה מועדף: ${jobArea}`;
  } else if (workerArea === jobArea) {
    score = Math.round(w * 0.7);
    label = `אותו אזור: ${workerArea}`;
  } else {
    score = Math.round(w * 0.25);
    label = `אזור רחוק: ${worker.city} מול ${job.city}`;
  }

  return { label, score, weight: w, icon: 'location' };
}

/** Available now > available by start date > not available. */
function scoreAvailability(worker: Worker, job: JobPost): MatchReason {
  const w = WEIGHTS.availability;
  const jobStart = new Date(job.startDate).getTime();

  if (worker.isAvailable) {
    return {
      label: 'זמין לעבודה מיד',
      score: w,
      weight: w,
      icon: 'checkmark-circle',
    };
  }

  if (worker.availableFrom) {
    const availFrom = new Date(worker.availableFrom).getTime();
    if (!isNaN(availFrom) && !isNaN(jobStart) && availFrom <= jobStart) {
      return {
        label: `זמין מ-${worker.availableFrom}, לפני תחילת הפרויקט`,
        score: Math.round(w * 0.8),
        weight: w,
        icon: 'calendar',
      };
    }
    return {
      label: `זמין רק מ-${worker.availableFrom} – אחרי תחילת הפרויקט`,
      score: Math.round(w * 0.25),
      weight: w,
      icon: 'time',
    };
  }

  return {
    label: 'לא זמין כרגע',
    score: Math.round(w * 0.15),
    weight: w,
    icon: 'close-circle',
  };
}

/** Certifications act as a gating reason. Not extra points — they either
 *  confirm the worker meets the requirement, or are listed as missing. */
function certificationsReason(worker: Worker, job: JobPost): MatchReason | null {
  const required = job.requiredCertifications ?? [];
  if (required.length === 0) return null;

  const workerCerts = worker.certifications ?? [];
  const missing = required.filter(
    (c) => !workerCerts.some((wc) => wc.includes(c) || c.includes(wc))
  );

  if (missing.length === 0) {
    return {
      label: `כל התעודות הנדרשות קיימות (${required.length})`,
      score: 1,
      weight: 1,
      icon: 'ribbon',
    };
  }

  return {
    label: `חסרות תעודות: ${missing.join(', ')}`,
    score: 0,
    weight: 1,
    icon: 'warning',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute the match between a single worker and a single job. */
export function computeMatch(worker: Worker, job: JobPost): MatchResult {
  const reasons: MatchReason[] = [
    scoreProfession(worker, job),
    scoreLocation(worker, job),
    scoreAvailability(worker, job),
  ];

  const cert = certificationsReason(worker, job);
  if (cert) reasons.push(cert);

  // Only the weighted 3 contribute to the /100 score.
  const scoreOutOf100 =
    reasons[0].score + reasons[1].score + reasons[2].score;

  // Missing required cert: up to 15-point soft penalty (but never below 0)
  const matchScore = cert && cert.score === 0
    ? Math.max(0, scoreOutOf100 - 15)
    : scoreOutOf100;

  return {
    worker,
    matchScore,
    reasons,
  };
}

/** Rank all workers for a given job, best match first. Approved workers only. */
export function rankWorkersForJob(
  workers: Worker[],
  job: JobPost
): MatchResult[] {
  return workers
    .filter((w) => w.status === 'approved')
    .map((w) => computeMatch(w, job))
    .sort((a, b) => b.matchScore - a.matchScore);
}

/** Convenience: map a score to a band label + color name. UI screens can
 *  resolve the color through their theme (e.g. 'success' -> Colors.success). */
export function matchBand(
  score: number
): { label: string; tone: 'success' | 'info' | 'warning' | 'danger' } {
  if (score >= 85) return { label: 'התאמה מצוינת', tone: 'success' };
  if (score >= 70) return { label: 'התאמה טובה', tone: 'info' };
  if (score >= 50) return { label: 'התאמה חלקית', tone: 'warning' };
  return { label: 'התאמה נמוכה', tone: 'danger' };
}

export { ProfessionCategory };
