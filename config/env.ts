// =============================================================================
// BuildUp – Central access to PUBLIC runtime configuration (Expo public env)
// =============================================================================
// Only `EXPO_PUBLIC_*` values belong here. Expo inlines them into the app
// bundle, so everything read in this file is PUBLIC by definition.
//
// NEVER read a service-role key, database password, `ID_HMAC_PEPPER`,
// `ID_ENC_KEY`, `OPENAI_API_KEY` or `RESEND_API_KEY` here. Those are
// server-side secrets that live ONLY as Supabase Edge Function secrets and
// must never reach the React Native client.
// =============================================================================

const readString = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

// -----------------------------------------------------------------------------
// PUBLIC project defaults — intentionally committed so that
// `git clone && npm install && npx expo start` connects with no extra setup.
//
//   • The project URL is public (it is the address every request already goes to).
//   • `sb_publishable_...` is a CLIENT key: it is DESIGNED to ship inside the
//     app bundle and only grants the `anon` Postgres role. RLS is enabled on
//     every table and `anon` is REVOKED from all tables
//     (supabase/migrations/008_rls.sql), so this key on its own reads/writes
//     nothing until a user signs in — and then only what that user's row-level
//     policies allow.
//   • This is NOT the service-role key and NOT any server secret. Those
//     (service-role, ID_HMAC_PEPPER, ID_ENC_KEY, OPENAI_API_KEY, RESEND_API_KEY)
//     live ONLY as Supabase Edge Function secrets and never appear in this repo.
//
// To run BuildUp against a DIFFERENT Supabase project, create a local `.env`
// (copy `.env.example`) — any value set there overrides the default below.
// -----------------------------------------------------------------------------
const DEFAULT_SUPABASE_URL = 'https://rxoyzsrnlterhmyzpsnd.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_EUzrReRGxPerdtKPYyZu3Q_Etwt0BE9';

/** Supabase project URL, e.g. `https://<project-ref>.supabase.co`. */
export const SUPABASE_URL =
  readString(process.env.EXPO_PUBLIC_SUPABASE_URL) || DEFAULT_SUPABASE_URL;

/**
 * Supabase publishable key (format: `sb_publishable_...`). Safe to ship in the
 * client bundle by design — it is not a secret and is rate-limited / governed
 * by Row Level Security on the server.
 */
export const SUPABASE_PUBLISHABLE_KEY =
  readString(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

/** True when the public Supabase config required to build a client is present. */
export const hasSupabaseConfig = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
