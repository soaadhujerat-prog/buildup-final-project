// =============================================================================
// BuildUp – Edge Function: register  (Phase 3A + 3B)
// =============================================================================
// Real worker/contractor sign-up. Called with NO session (verify_jwt = false).
// Raw ID / password / email are never stored in `registrations`. In addition
// to the HMAC (login/dedup) it also stores an AES-256-GCM ciphertext of the
// normalized ID (admin verification only) via public.create_registration().
// Password policy is enforced here (backstop) — mirror of utils/passwordPolicy.ts.
//
// Phase 3B: the ID document is uploaded BEFORE this call via the
// `register-upload-url` function + a one-shot signed upload token. The client
// then passes { reservedRegistrationId, idDocumentPath } here; we VERIFY the
// object actually exists in id-documents/{reservedRegistrationId}/ and only
// then persist registrations.id_document_path with the SAME row id (so the
// id-documents RLS read policy, which keys on the first path segment, works).
// A failed registration removes both the auth user and the uploaded object.
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

const normalizeId = (raw: string): string => String(raw ?? '').replace(/\D/g, '').padStart(9, '0');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password policy — MUST match utils/passwordPolicy.ts (the frontend copy is
// UX only; this is the enforcement backstop).
const PASSWORD_MIN_LENGTH = 8;
const isPasswordValid = (p: string): boolean =>
  p.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(p) && /\d/.test(p);

async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// AES-256-GCM. Key = ID_ENC_KEY (hex-64 / base64-32), else HKDF-SHA256 from
// ID_HMAC_PEPPER. Ciphertext: "v1:" + base64(iv(12) || ct || gcmTag(16)).
// MUST match supabase/functions/admin-reveal-id/index.ts.
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
    const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(ID_HMAC_PEPPER), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(KDF_INFO) },
      ikm, 256,
    );
    raw = new Uint8Array(bits);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptId(plain: string): Promise<string> {
  const key = await idEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return 'v1:' + b64encode(blob);
}

// deno-lint-ignore no-explicit-any
const str = (v: any): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
// deno-lint-ignore no-explicit-any
const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
// deno-lint-ignore no-explicit-any
const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// deno-lint-ignore no-explicit-any
function sanitiseWorker(d: any) {
  return {
    fullName: str(d.fullName), phone: str(d.phone), city: str(d.city),
    profession: str(d.profession), professions: arr(d.professions),
    professionCategory: str(d.professionCategory), skills: arr(d.skills),
    certifications: Array.isArray(d.certifications)
      ? d.certifications.map((c: unknown) => ({ name: str((c as { name?: unknown })?.name) })).filter((c: { name: string }) => c.name.length > 0)
      : [],
    experienceYears: num(d.experienceYears), preferredAreas: arr(d.preferredAreas),
    isAvailable: d.isAvailable !== false, hourlyRate: num(d.hourlyRate), dailyRate: num(d.dailyRate),
    bio: str(d.bio),
  };
}
// deno-lint-ignore no-explicit-any
function sanitiseContractor(d: any) {
  return {
    fullName: str(d.fullName), phone: str(d.phone), city: str(d.city),
    companyName: str(d.companyName), contractorRegistrationNumber: str(d.contractorRegistrationNumber),
    areaOfOperation: str(d.areaOfOperation), areasOfOperation: arr(d.areasOfOperation),
    projectTypes: arr(d.projectTypes), licenseDetails: str(d.licenseDetails),
    licenseValidUntil: str(d.licenseValidUntil), bio: str(d.bio),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'invalid' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ID_HMAC_PEPPER) return json({ ok: false, error: 'server_misconfigured' }, 500);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid' }, 400); }

  const role = str(body?.role);
  const raw = body?.data ?? {};
  const email = str(raw.email).toLowerCase();
  const password = typeof raw.password === 'string' ? raw.password : '';
  const normId = normalizeId(raw.idNumber);

  // Phase 3B: ID document already uploaded via `register-upload-url`.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const reservedRegistrationId =
    typeof body?.reservedRegistrationId === 'string' ? body.reservedRegistrationId.trim() : '';
  const idDocumentPath =
    typeof body?.idDocumentPath === 'string' ? body.idDocumentPath.trim() : '';

  if (role !== 'worker' && role !== 'contractor') return json({ ok: false, error: 'invalid' });
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid' });
  if (!isPasswordValid(password)) return json({ ok: false, error: 'weak_password' });
  if (normId.length !== 9) return json({ ok: false, error: 'invalid' });

  // Both ID-doc fields travel together or not at all; the path must live
  // inside the reserved registration's folder.
  if ((reservedRegistrationId === '') !== (idDocumentPath === '')) {
    return json({ ok: false, error: 'invalid' });
  }
  if (reservedRegistrationId) {
    if (!UUID_RE.test(reservedRegistrationId)) return json({ ok: false, error: 'invalid' });
    if (!idDocumentPath.startsWith(`${reservedRegistrationId}/`)) {
      return json({ ok: false, error: 'invalid' });
    }
  }

  const data = role === 'worker' ? sanitiseWorker(raw) : sanitiseContractor(raw);
  if (!data.fullName || !data.phone || !data.city) return json({ ok: false, error: 'invalid' });
  if (role === 'worker') {
    const w = data as ReturnType<typeof sanitiseWorker>;
    if (!w.professionCategory || w.professions.length < 1 || w.hourlyRate <= 0 || w.dailyRate <= 0) return json({ ok: false, error: 'invalid' });
  } else {
    const c = data as ReturnType<typeof sanitiseContractor>;
    if (!c.companyName || !c.contractorRegistrationNumber || !c.licenseDetails) return json({ ok: false, error: 'invalid' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  let hash: string;
  let enc: string;
  try {
    hash = await hmacSha256Hex(normId, ID_HMAC_PEPPER);
    enc = await encryptId(normId);
  } catch {
    return json({ ok: false, error: 'server' }, 500);
  }

  const identityHit = await admin.from('user_identity').select('profile_id').eq('id_number_hash', hash).maybeSingle();
  if (identityHit.error) return json({ ok: false, error: 'server' }, 500);
  if (identityHit.data) return json({ ok: false, error: 'unavailable' });

  const pendingHit = await admin.from('registrations').select('id').eq('id_number_hash', hash).eq('status', 'pending').maybeSingle();
  if (pendingHit.error) return json({ ok: false, error: 'server' }, 500);
  if (pendingHit.data) return json({ ok: false, error: 'unavailable' });

  if (role === 'contractor') {
    const regNo = (data as ReturnType<typeof sanitiseContractor>).contractorRegistrationNumber;
    const regNoHit = await admin.from('contractor_profiles').select('profile_id').eq('contractor_registration_number', regNo).maybeSingle();
    if (regNoHit.error) return json({ ok: false, error: 'server' }, 500);
    if (regNoHit.data) return json({ ok: false, error: 'unavailable' });
  }

  // Confirm the pre-uploaded ID document really exists before we let a
  // registration claim it. A missing object => the client's upload step
  // failed; never persist a dangling id_document_path.
  if (reservedRegistrationId) {
    const listed = await admin.storage
      .from('id-documents')
      .list(reservedRegistrationId, { limit: 100 });
    if (listed.error) return json({ ok: false, error: 'server' }, 500);
    const found = (listed.data ?? []).some(
      (o) => `${reservedRegistrationId}/${o.name}` === idDocumentPath
    );
    if (!found) return json({ ok: false, error: 'id_document_missing' }, 400);
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data?.user) return json({ ok: false, error: 'unavailable' });
  const uid = created.data.user.id;

  const rpc = await admin.rpc('create_registration', {
    p_registration_id: reservedRegistrationId || null,
    p_auth_user_id: uid,
    p_role: role,
    p_id_hash: hash,
    p_id_enc: enc,
    p_id_document_path: idDocumentPath || null,
    p_data: data,
  });
  if (rpc.error || !rpc.data) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    if (idDocumentPath) {
      await admin.storage.from('id-documents').remove([idDocumentPath]).catch(() => {});
    }
    return json({ ok: false, error: 'server' }, 500);
  }

  return json({ ok: true, registrationId: rpc.data as string, status: 'pending' });
});
