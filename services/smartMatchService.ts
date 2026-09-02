// =============================================================================
// BuildUp – Smart Match service
// =============================================================================
// The Smart Match screen calls ONE function here:
//
//     getSmartMatches(query) : Promise<SmartMatchResult[]>
//
// It delegates entirely to the `smart-match` Edge Function, which authenticates
// the caller, re-checks contractor ownership + job eligibility, pre-filters
// candidates deterministically, then runs the hybrid (deterministic + bounded
// OpenAI) 100-point model against the live DB and adds the `aiSummary` /
// real `distanceKm`. Any failure throws — SmartMatchScreen renders its Hebrew
// error state. There is NO fallback ranking.
// =============================================================================

import { CompensationStatus, SmartMatchLevel, SmartMatchResult } from '../types';
import { getSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Display labels — shared by the screen and its cards
// ---------------------------------------------------------------------------

export const SMART_MATCH_LEVEL_LABEL: Record<SmartMatchLevel, string> = {
  high: 'התאמה גבוהה',
  good: 'התאמה טובה',
  partial: 'התאמה חלקית',
  low: 'התאמה נמוכה',
};

export const COMPENSATION_LABEL: Record<CompensationStatus, string> = {
  within_budget: 'בתוך התקציב',
  slightly_above: 'מעט מעל התקציב',
  above_budget: 'מעל התקציב',
  unknown: 'אין מספיק מידע להשוואת תעריף',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SmartMatchQuery {
  jobId: string;
}

/** Rank the contractor's approved, available workers for one of their own open
 *  jobs, best match first — via the `smart-match` Edge Function. Async on
 *  purpose: the screen treats this as a network call. */
export async function getSmartMatches(
  query: SmartMatchQuery
): Promise<SmartMatchResult[]> {
  const { data, error } = await getSupabase().functions.invoke('smart-match', {
    body: { jobId: query.jobId },
  });
  if (error) throw error;
  const results = (data as { results?: SmartMatchResult[] } | null)?.results;
  return Array.isArray(results) ? results : [];
}
