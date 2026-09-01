// =============================================================================
// BuildUp – Edge Function: reveal-my-id
// =============================================================================
// The narrow, self-only counterpart of `admin-reveal-id`. Lets an authenticated
// worker / contractor see THEIR OWN national ID in their Profile screen.
//
//   • verify_jwt = true.
//   • The identity row is chosen SOLELY from `auth.uid()` — the request body is
//     ignored, so a caller cannot ask for anybody else's ID.
//   • Reads `user_identity.id_number_enc` with the service-role key (client
//     roles have NO SELECT on that column — migration 037) and decrypts it
//     server-side. The ciphertext is never returned; the plaintext is never
//     logged.
//   • A legacy row with `id_number_enc IS NULL` -> HTTP 404 { error:'unavailable' }.
//     Such rows self-heal on the user's next `login-by-id` (ID + password).
//   • Crypto (AES-256-GCM, key = ID_ENC_KEY hex-64 / base64-32, else
//     HKDF-SHA256 from ID_HMAC_PEPPER) MUST match register/index.ts and
//     admin-reveal-id/index.ts.
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const callerId = userRes?.user?.id;
  if (userErr || !callerId) return json({ ok: false, error: 'unauthorized' }, 401);

  const { data, error } = await admin
    .from('user_identity')
    .select('id_number_enc')
    .eq('profile_id', callerId)
    .maybeSingle();
  if (error) return json({ ok: false, error: 'server' }, 500);

  const enc = (data?.id_number_enc as string | null) ?? null;
  if (!enc) return json({ ok: false, error: 'unavailable' }, 404);

  try {
    const idNumber = await decryptId(enc);
    return json({ ok: true, idNumber });
  } catch {
    return json({ ok: false, error: 'decrypt_failed' }, 500);
  }
});
