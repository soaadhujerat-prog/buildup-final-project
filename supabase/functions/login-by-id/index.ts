// =============================================================================
// BuildUp – Edge Function: login-by-id
// =============================================================================
// The app's login UX is "Israeli ID number + password", but Supabase Auth is
// email + password. This function is the ONLY place that bridges the two, and
// it does so entirely server-side:
//
//   1. normalize(idNumber)                      (digits only, left-pad to 9)
//   2. HMAC-SHA256(normalized, ID_HMAC_PEPPER)  (hex, lowercase)
//   3a. look up public.user_identity.id_number_hash  (service role)
//       -> found  => approved/blocked user: get email, signInWithPassword,
//                    return { access_token, refresh_token }
//   3b. not in user_identity => look up public.registrations.id_number_hash
//       (status pending|rejected). If the password checks out, return
//       { ok:false, status:'pending'|'rejected' } — NO tokens. This lets the
//       Phase-2 status gating show the right screen for a not-yet-approved user.
//
// Security invariants:
//   • The client never receives an email as the result of an ID lookup, and
//     never receives the id_number hash.
//   • Every auth-failure branch returns an identical HTTP 200 `{ ok: false }`
//     (unknown ID and wrong password are indistinguishable — no enumeration).
//     The pending/rejected branch only fires AFTER the password is verified.
//   • Non-2xx is reserved for a malformed request (400) or a real server
//     error / misconfiguration (500).
//   • Nothing sensitive is logged: not the password, not the plaintext ID, not
//     the HMAC, not the email.
//   • Secrets (SUPABASE_SERVICE_ROLE_KEY, ID_HMAC_PEPPER) come only from the
//     Edge Function environment — never from the Expo bundle.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ID_HMAC_PEPPER = Deno.env.get('ID_HMAC_PEPPER') ?? '';
const ID_ENC_KEY = Deno.env.get('ID_ENC_KEY') ?? '';

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
 * registration path and to the test-user seed SQL:
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

// AES-256-GCM ID encryption — used ONLY to self-heal a legacy `user_identity`
// row that has no `id_number_enc` yet, AFTER the password has been verified.
// Key = ID_ENC_KEY (hex-64 / base64-32), else HKDF-SHA256 from ID_HMAC_PEPPER.
// Ciphertext: "v1:" + base64(iv(12) || ct || gcmTag(16)). MUST match
// register/index.ts and admin-reveal-id/index.ts.
const KDF_INFO = 'buildup/id-number-encryption/v1';
function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
async function idEncKey(): Promise<CryptoKey> {
  let raw: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(ID_ENC_KEY)) {
    raw = hexToBytes(ID_ENC_KEY);
  } else if (ID_ENC_KEY.length >= 43) {
    raw = Uint8Array.from(atob(ID_ENC_KEY), (c) => c.charCodeAt(0)).slice(0, 32);
  } else {
    const ikm = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(ID_HMAC_PEPPER),
      'HKDF',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(KDF_INFO) },
      ikm,
      256,
    );
    raw = new Uint8Array(bits);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptId(plain: string): Promise<string> {
  const key = await idEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return 'v1:' + b64encode(blob);
}

/**
 * Legacy self-heal. Called ONLY after the password has been verified for the
 * user whose id_number_hash matched. If that user's `user_identity` row has no
 * ciphertext yet, encrypt the ALREADY-VERIFIED normalized ID and store it.
 * Best-effort: never throws, never blocks login, never logs the plaintext, and
 * the `is('id_number_enc', null)` guard means an existing value is never
 * overwritten.
 */
async function healLegacyIdEnc(
  admin: ReturnType<typeof createClient>,
  profileId: string,
  hasEnc: boolean,
  normalizedId: string,
): Promise<void> {
  if (hasEnc) return;
  try {
    const enc = await encryptId(normalizedId);
    await admin
      .from('user_identity')
      .update({ id_number_enc: enc })
      .eq('profile_id', profileId)
      .is('id_number_enc', null);
  } catch {
    // healing is best-effort — a failure here must not affect the login result
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !ID_HMAC_PEPPER) {
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
    return json({ ok: false });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let hash: string;
  try {
    hash = await hmacSha256Hex(normalized, ID_HMAC_PEPPER);
  } catch {
    return json({ ok: false, error: 'hash_failed' }, 500);
  }

  // ---- 3a. approved / blocked user: user_identity -> real session ----
  const { data: identity, error: identityErr } = await admin
    .from('user_identity')
    .select('profile_id, id_number_enc')
    .eq('id_number_hash', hash)
    .maybeSingle();
  if (identityErr) return json({ ok: false, error: 'lookup_failed' }, 500);

  if (identity) {
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(
      identity.profile_id as string,
    );
    const email = userRes?.user?.email;
    if (userErr || !email) return json({ ok: false });

    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn?.session) return json({ ok: false });

    // Password verified for this exact user — safe to encrypt & store the ID
    // for any legacy row that never got a ciphertext. Best-effort only.
    await healLegacyIdEnc(
      admin,
      identity.profile_id as string,
      (identity.id_number_enc as string | null) != null,
      normalized,
    );

    return json({
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    });
  }

  // ---- 3b. not-yet-approved: registrations -> status only, no tokens ----
  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .select('auth_user_id, status')
    .eq('id_number_hash', hash)
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (regErr) return json({ ok: false, error: 'lookup_failed' }, 500);
  if (!reg) return json({ ok: false }); // unknown ID -> generic

  const { data: regUser, error: regUserErr } = await admin.auth.admin.getUserById(
    reg.auth_user_id as string,
  );
  const regEmail = regUser?.user?.email;
  if (regUserErr || !regEmail) return json({ ok: false });

  // Verify the password before disclosing the status, so this branch can't be
  // used to probe someone else's pending/rejected registration.
  const { data: regSignIn, error: regSignInErr } = await anon.auth.signInWithPassword({
    email: regEmail,
    password,
  });
  if (regSignInErr || !regSignIn?.session) return json({ ok: false });

  return json({ ok: false, status: reg.status as 'pending' | 'rejected' });
});
