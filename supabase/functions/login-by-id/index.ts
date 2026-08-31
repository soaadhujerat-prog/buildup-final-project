// =============================================================================
// BuildUp – Edge Function: login-by-id
// =============================================================================
// The app's login UX is "Israeli ID number + password", but Supabase Auth is
// email + password. This function is the ONLY place that bridges the two, and
// it does so entirely server-side:
//
//   1. normalize(idNumber)                      (digits only, left-pad to 9)
//   2. HMAC-SHA256(normalized, ID_HMAC_PEPPER)  (hex, lowercase)
//   3. look up public.user_identity.id_number_hash  (service role)
//   4. profiles.id == auth.users.id -> fetch the auth user (Admin API)
//   5. read the email SERVER-SIDE only
//   6. signInWithPassword(email, password) with the anon client
//   7. return ONLY { access_token, refresh_token }
//
// Security invariants:
//   • The client never receives an email as the result of an ID lookup, and
//     never receives the id_number hash.
//   • Every auth-failure branch returns an identical HTTP 200 `{ ok: false }`
//     (unknown ID and wrong password are indistinguishable — no enumeration).
//   • Non-2xx is reserved for a malformed request (400) or a real server
//     error / misconfiguration (500).
//   • Nothing sensitive is logged: not the password, not the plaintext ID, not
//     the HMAC, not the email.
//   • Secrets (SUPABASE_SERVICE_ROLE_KEY, ID_HMAC_PEPPER) come only from the
//     Edge Function environment — never from the Expo bundle.
//
// Rate limiting: step 6 goes through GoTrue, so Supabase's platform
// `sign_in_sign_ups` limit (per IP) already applies, as do the Edge Function
// platform limits. A per-ID throttle is noted as future hardening rather than a
// weak home-grown mechanism.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ID_HMAC_PEPPER = Deno.env.get('ID_HMAC_PEPPER') ?? '';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/**
 * Canonical Israeli-ID normalization. MUST stay byte-for-byte identical to the
 * (future) registration path and to the test-user seed SQL:
 *   strip every non-digit, then left-pad with '0' to 9 chars.
 */
const normalizeId = (raw: string): string =>
  raw.replace(/\D/g, '').padStart(9, '0');

async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !ID_HMAC_PEPPER) {
    // Deployment/secret misconfiguration — a real server error, not an auth
    // failure. No detail about WHICH var is missing.
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  let idNumber = '';
  let password = '';
  try {
    const body = await req.json();
    idNumber = typeof body?.idNumber === 'string' ? body.idNumber : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const normalized = normalizeId(idNumber);
  if (normalized.length !== 9 || password.length < 1) {
    // Malformed input is surfaced as the SAME generic "invalid" as a real
    // mismatch, so this endpoint gives no enumeration signal at all.
    return json({ ok: false });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let hash: string;
  try {
    hash = await hmacSha256Hex(normalized, ID_HMAC_PEPPER);
  } catch {
    return json({ ok: false, error: 'hash_failed' }, 500);
  }

  const { data: identity, error: identityErr } = await admin
    .from('user_identity')
    .select('profile_id')
    .eq('id_number_hash', hash)
    .maybeSingle();

  if (identityErr) {
    return json({ ok: false, error: 'lookup_failed' }, 500);
  }
  if (!identity) {
    return json({ ok: false }); // unknown ID -> generic
  }

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(
    identity.profile_id as string,
  );
  const email = userRes?.user?.email;
  if (userErr || !email) {
    return json({ ok: false }); // orphaned identity -> generic
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signIn?.session) {
    return json({ ok: false }); // wrong password -> same generic
  }

  return json({
    ok: true,
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  });
});
