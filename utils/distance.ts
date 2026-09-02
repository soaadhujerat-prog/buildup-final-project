// =============================================================================
// Shared geographic distance helpers (Phase 10 — Job Location)
// =============================================================================
// ONE Haversine + ONE worker→job distance rule, so the worker "nearby jobs"
// feature and any future caller never re-derive the formula.
//
// SOURCE OF TRUTH for worker→job distance:
//   worker RESIDENCE CITY centroid   ->   job WORKSITE
//     • worker endpoint  = the residence city the worker already picked
//       (city centroid from data/israelCities.ts). Never GPS, never a home
//       street address, never the contractor.
//     • job endpoint     = the exact map pin (job.lat/lon) when the contractor
//       set one; otherwise the job CITY centroid. The typed `job.address`
//       string is DISPLAY ONLY and is never part of the calculation.
//   Returns `undefined` when either endpoint cannot be resolved — callers must
//   treat that as "unknown distance", never as 0.
// =============================================================================

import { cityCoords } from '../data/israelCities';
import type { JobPost } from '../types';

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Effective worksite coordinate for a job: exact pin if present, else the
 *  job's city centroid, else undefined. Never uses `job.address`. */
export function jobWorksiteCoords(
  job: Pick<JobPost, 'lat' | 'lon' | 'city'>
): { lat: number; lon: number } | undefined {
  if (typeof job.lat === 'number' && typeof job.lon === 'number') {
    return { lat: job.lat, lon: job.lon };
  }
  return cityCoords(job.city);
}

/**
 * Deterministic worker→job distance in km (worker residence city centroid →
 * job worksite). `undefined` when the worker's city or the job's location
 * cannot be resolved. Never returns a fabricated 0.
 */
export function workerJobDistanceKm(
  job: Pick<JobPost, 'lat' | 'lon' | 'city'>,
  workerCity: string | null | undefined
): number | undefined {
  const w = cityCoords(workerCity);
  if (!w) return undefined;
  const j = jobWorksiteCoords(job);
  if (!j) return undefined;
  return haversineKm(w.lat, w.lon, j.lat, j.lon);
}

/**
 * Approximate distance in km between two RESIDENCE cities, each resolved to
 * its centroid. Used by the contractor "nearby workers" convenience in the
 * general worker search (contractor residence city → worker residence city —
 * NOT a job, NOT Smart Match). `undefined` when either city cannot be
 * resolved. Never a fabricated 0.
 */
export function residenceCityDistanceKm(
  cityA: string | null | undefined,
  cityB: string | null | undefined
): number | undefined {
  const a = cityCoords(cityA);
  const b = cityCoords(cityB);
  if (!a || !b) return undefined;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}
