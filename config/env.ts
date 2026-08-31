// =============================================================================
// BuildUp – Central access to PUBLIC runtime configuration (Expo public env)
// =============================================================================
// Only `EXPO_PUBLIC_*` values belong here. Expo inlines them into the app
// bundle, so everything read in this file is PUBLIC by definition.
//
// NEVER read a service-role key, database password, `ID_HMAC_PEPPER`,
// `OPENAI_API_KEY` or `MAIL_API_KEY` here. Those are server-side secrets that
// live ONLY as Supabase Edge Function secrets and must never reach the
// React Native client (see the Backend Plan, decisions #1 / #7 / security).
//
// Phase 0: nothing in the app consumes these yet — `USE_BACKEND` is `false`
// and no screen / AppContext path talks to Supabase.
// =============================================================================

const readString = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** Supabase project URL, e.g. `https://<project-ref>.supabase.co`. */
export const SUPABASE_URL = readString(process.env.EXPO_PUBLIC_SUPABASE_URL);

/**
 * Supabase publishable key (format: `sb_publishable_...`). Safe to ship in the
 * client bundle by design — it is not a secret and is rate-limited / governed
 * by Row Level Security on the server.
 */
export const SUPABASE_PUBLISHABLE_KEY = readString(
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

/**
 * Master switch for the backend integration. Phase 0: always `false` — the app
 * runs entirely on in-memory mock data. Later phases flip this per-domain.
 * In production there is NO silent fallback to mock data: when the backend is
 * enabled and a call fails, the UI shows a real loading / error state.
 */
export const USE_BACKEND =
  readString(process.env.EXPO_PUBLIC_USE_BACKEND).toLowerCase() === 'true';

/** Single place every future call site checks before hitting Supabase. */
export const isBackendEnabled = (): boolean => USE_BACKEND;

/** True when the public Supabase config required to build a client is present. */
export const hasSupabaseConfig = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
