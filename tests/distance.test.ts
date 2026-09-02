// =============================================================================
// Unit tests — utils/distance.ts  (pure logic, no backend, no RN)
// =============================================================================
// Locks in the real BuildUp location rules:
//   • haversineKm            — great-circle distance in km
//   • jobWorksiteCoords      — exact map pin wins, else job city centroid, else undefined
//   • workerJobDistanceKm    — worker RESIDENCE city centroid -> job worksite
//   • residenceCityDistanceKm— residence city centroid <-> residence city centroid
//
// Cities are used only as fixture *names*; every expectation compares against
// the dataset's own resolved centroid (cityCoords) or a tolerant numeric band,
// never a hardcoded lat/lon, so the tests stay meaningful if the curated
// coordinates are nudged. No credential / UUID / key appears in this file.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  haversineKm,
  jobWorksiteCoords,
  workerJobDistanceKm,
  residenceCityDistanceKm,
} from '../utils/distance';
import { cityCoords } from '../data/israelCities';

const TEL_AVIV = 'תל אביב';
const HAIFA = 'חיפה';
/** A string that resolves to no city in the dataset (and no fuzzy alias hit). */
const UNKNOWN_CITY = 'Xyzzyville';

const ta = cityCoords(TEL_AVIV)!;
const ha = cityCoords(HAIFA)!;

// ---------------------------------------------------------------------------
// A. / B. haversineKm
// ---------------------------------------------------------------------------

describe('haversineKm', () => {
  it('A. returns ~0 km for the same coordinate', () => {
    expect(haversineKm(ta.lat, ta.lon, ta.lat, ta.lon)).toBeCloseTo(0, 5);
  });

  it('B. returns a plausible distance for two known coordinates (Tel Aviv <-> Haifa)', () => {
    const km = haversineKm(ta.lat, ta.lon, ha.lat, ha.lon);
    // real-world great-circle distance is ~80 km — assert a tolerant band,
    // not a brittle exact float.
    expect(km).toBeGreaterThan(70);
    expect(km).toBeLessThan(95);
  });

  it('is symmetric (a->b equals b->a)', () => {
    expect(haversineKm(ta.lat, ta.lon, ha.lat, ha.lon)).toBeCloseTo(
      haversineKm(ha.lat, ha.lon, ta.lat, ta.lon),
      6
    );
  });
});

// ---------------------------------------------------------------------------
// C. exact worksite pin precedence
// ---------------------------------------------------------------------------

describe('jobWorksiteCoords — exact map pin precedence', () => {
  it('C. returns the exact lat/lon when the job carries a numeric pin', () => {
    const pin = { lat: 31.5, lon: 34.75 };
    expect(jobWorksiteCoords({ ...pin, city: TEL_AVIV })).toEqual(pin);
  });

  it('prefers the exact pin even when it differs from the job city centroid', () => {
    // pin = Haifa coords, but the job city is Tel Aviv -> the pin must win.
    const result = jobWorksiteCoords({ lat: ha.lat, lon: ha.lon, city: TEL_AVIV });
    expect(result).toEqual({ lat: ha.lat, lon: ha.lon });
    expect(result).not.toEqual(cityCoords(TEL_AVIV));
  });
});

// ---------------------------------------------------------------------------
// D. city-centroid fallback
// ---------------------------------------------------------------------------

describe('jobWorksiteCoords — city centroid fallback', () => {
  it('D. resolves the job city centroid when no exact pin is set', () => {
    expect(jobWorksiteCoords({ lat: null, lon: null, city: TEL_AVIV })).toEqual(
      cityCoords(TEL_AVIV)
    );
  });

  it('ignores a lone lat with no lon (both are required to form a pin)', () => {
    expect(jobWorksiteCoords({ lat: 31.5, lon: null, city: TEL_AVIV })).toEqual(
      cityCoords(TEL_AVIV)
    );
  });
});

// ---------------------------------------------------------------------------
// E. unknown location -> undefined, never a fabricated 0
// ---------------------------------------------------------------------------

describe('jobWorksiteCoords — unknown location', () => {
  it('E. returns undefined when there is no pin and the city is unrecognized', () => {
    expect(
      jobWorksiteCoords({ lat: null, lon: null, city: UNKNOWN_CITY })
    ).toBeUndefined();
  });

  it('returns undefined for an empty city string and no pin', () => {
    expect(jobWorksiteCoords({ lat: null, lon: null, city: '' })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G. typed job address is NOT part of the distance input
// ---------------------------------------------------------------------------

describe('jobWorksiteCoords — typed address independence', () => {
  it('G. the distance input is structurally limited to { lat, lon, city }', () => {
    // The parameter type is Pick<JobPost, 'lat' | 'lon' | 'city'>: the typed
    // street address (`JobPost.address`) is not accepted at all, so it cannot
    // influence the result. Supplying it is a compile-time excess-property
    // error — the architecture enforces address-independence at the type level.
    const base = { lat: null, lon: null, city: TEL_AVIV };
    expect(jobWorksiteCoords(base)).toEqual(cityCoords(TEL_AVIV));

    const withAddress = jobWorksiteCoords({
      lat: null,
      lon: null,
      city: TEL_AVIV,
      // @ts-expect-error `address` is intentionally not part of the distance input
      address: 'Rothschild Blvd 1',
    });
    expect(withAddress).toEqual(cityCoords(TEL_AVIV));
  });
});

// ---------------------------------------------------------------------------
// F. worker -> job distance (worker residence city centroid -> job worksite)
// ---------------------------------------------------------------------------

describe('workerJobDistanceKm', () => {
  it('F. uses the worker residence city centroid and the exact job pin when present', () => {
    const viaHelper = workerJobDistanceKm(
      { lat: ha.lat, lon: ha.lon, city: TEL_AVIV }, // pin = Haifa, job city = Tel Aviv
      TEL_AVIV
    );
    const expected = haversineKm(ta.lat, ta.lon, ha.lat, ha.lon);
    expect(viaHelper).toBeCloseTo(expected, 6);
    // the pin (Haifa) is honoured over the job's own city (Tel Aviv) -> ~80 km.
    expect(viaHelper as number).toBeGreaterThan(70);
  });

  it('falls back to the job city centroid when the job has no pin', () => {
    const d = workerJobDistanceKm({ lat: null, lon: null, city: HAIFA }, TEL_AVIV);
    const expected = residenceCityDistanceKm(TEL_AVIV, HAIFA);
    expect(d).toBeCloseTo(expected as number, 6);
  });

  it('returns undefined (never 0) when the worker residence city is unknown', () => {
    expect(
      workerJobDistanceKm({ lat: null, lon: null, city: HAIFA }, UNKNOWN_CITY)
    ).toBeUndefined();
  });

  it('returns undefined (never 0) when the job has neither a pin nor a known city', () => {
    expect(
      workerJobDistanceKm({ lat: null, lon: null, city: UNKNOWN_CITY }, TEL_AVIV)
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// H. residence-city <-> residence-city distance
// ---------------------------------------------------------------------------

describe('residenceCityDistanceKm', () => {
  it('H. is ~0 km for the same supported residence city', () => {
    expect(residenceCityDistanceKm(TEL_AVIV, TEL_AVIV)).toBeCloseTo(0, 5);
  });

  it('H. is > 0 km for two different supported residence cities', () => {
    const d = residenceCityDistanceKm(TEL_AVIV, HAIFA);
    expect(d).toBeDefined();
    expect(d as number).toBeGreaterThan(0);
  });

  it('H. returns undefined for an unknown / missing city on either side', () => {
    expect(residenceCityDistanceKm(UNKNOWN_CITY, HAIFA)).toBeUndefined();
    expect(residenceCityDistanceKm(TEL_AVIV, UNKNOWN_CITY)).toBeUndefined();
    expect(residenceCityDistanceKm(null, undefined)).toBeUndefined();
  });
});
