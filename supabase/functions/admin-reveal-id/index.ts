// =============================================================================
// BuildUp – Edge Function: admin-reveal-id  (Phase 3A polish)
// =============================================================================
// The ONE narrowly-scoped path that decrypts an applicant's ID number for
// registration verification. verify_jwt = true, and on top of that the caller
// is re-verified from LIVE `profiles` as role='admin' AND status='approved'
// (never a JWT claim).
//
// body: { registrationId: string }
// ok:   { ok: true, idNumber: "123456789" }
//
// Security:
//   • only the plaintext ID for the ONE requested registration is returned,
//     and only to a live approved admin.
//   • the ciphertext is never returned; the plaintext is never logged.
//   • the AES key lives only in the Edge Function environment (explicit
//     ID_ENC_KEY, or HKDF-SHA256 from ID_HMAC_PEPPER) — never in the Expo
//     bundle. Crypto here MUST match supabase/functions/register/index.ts.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ID_HMAC_PEPPER = Deno.env.get('ID_HMAC_PEPPER') ?? '';
const ID_ENC_KEY = Deno.env.get('ID_ENC_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KDF_INFO = 'buildup/id-number-encryption/v1';

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

async function decryptId(payload: string): Promise<string> {
  if (!payload.startsWith('v1:')) throw new Error('bad ciphertext format');
  const blob = Uint8Array.from(atob(payload.slice(3)), (c) => c.charCodeAt(0));
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const key = await idEncKey();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'invalid' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || (!ID_ENC_KEY && !ID_HMAC_PEPPER)) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const registrationId = typeof body?.registrationId === 'string' ? body.registrationId : '';
  if (!registrationId) return json({ ok: false, error: 'invalid' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- live-admin gate ----
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const callerId = userRes?.user?.id;
  if (userErr || !callerId) return json({ ok: false, error: 'unauthorized' }, 401);

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr) return json({ ok: false, error: 'server' }, 500);
  if (!prof || prof.role !== 'admin' || prof.status !== 'approved') {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  // ---- fetch + decrypt the ONE requested ID ----
  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .select('id_number_enc')
    .eq('id', registrationId)
    .maybeSingle();
  if (regErr) return json({ ok: false, error: 'server' }, 500);
  if (!reg || !reg.id_number_enc) return json({ ok: false, error: 'unavailable' }, 404);

  try {
    const idNumber = await decryptId(reg.id_number_enc as string);
    return json({ ok: true, idNumber });
  } catch {
    return json({ ok: false, error: 'decrypt_failed' }, 500);
  }
});
