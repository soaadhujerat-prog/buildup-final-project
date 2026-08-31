// =============================================================================
// BuildUp – Supabase client singleton (Expo / React Native)
// =============================================================================
// PUBLIC configuration only: the project URL + the publishable key, both read
// from Expo public env via `config/env.ts`. This module must never import or
// reference a service-role key, DB password, `ID_HMAC_PEPPER`, `OPENAI_API_KEY`
// or `MAIL_API_KEY` — those are server-side secrets used solely by Supabase
// Edge Functions.
//
// Phase 2 status: consumed by the auth layer (services/authService.ts,
// services/authSession.ts, services/profileService.ts) ONLY when
// `isBackendEnabled()` is true. With `EXPO_PUBLIC_USE_BACKEND=false` nothing
// here is reached and the app still runs entirely on mock data. Jobs / staffing
// / chat / smart-match remain on mock data until their own phases.
// =============================================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  hasSupabaseConfig,
} from '../config/env';

let client: SupabaseClient | null = null;

/**
 * Lazily create (once) and return the shared Supabase client.
 *
 * Throws a clear, actionable error when the public config is missing. In later
 * phases, call sites should only reach here when `isBackendEnabled()` is true.
 */
export const getSupabase = (): SupabaseClient => {
  if (!hasSupabaseConfig()) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your local .env ' +
        '(copy .env.example).'
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // Persist the auth session on-device between launches.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No deep-link URL session parsing in a native app.
        detectSessionInUrl: false,
      },
    });
  }

  return client;
};

/** True once `getSupabase()` has built the singleton (useful for teardown/tests). */
export const isSupabaseClientCreated = (): boolean => client !== null;
