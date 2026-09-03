// =============================================================================
// BuildUp – Edge Function: register-upload-url  (Phase 3B · extended 051)
// =============================================================================
// Sign-up is UNauthenticated and the private document buckets have no client
// write policy for an anonymous user. This function mints one-shot, service-role
// signed upload tokens so the signing-up user can stream document bytes STRAIGHT
// to Storage WITHOUT a session and WITHOUT the service-role key reaching the
// client.
//
// Three staged document kinds, all under the SAME reserved registration id so a
// single folder holds the whole submission and `register` / `approve-registration`
// can find and (on approval) relocate them:
//
//   kind='id'          -> id-documents/{registrationId}/id-document.<ext>
//                         (mints a fresh registrationId; unchanged behaviour)
//   kind='license'     -> contractor-licenses/{registrationId}/license.<ext>
//   kind='certificate' -> worker-certificates/{registrationId}/certificate-<index>.<ext>
//
// `license` / `certificate` REQUIRE the caller to pass the registrationId that
// the `id` call returned, so every staged object shares one folder.
//
// verify_jwt = false (there is no session yet). No DB write happens here — an
// unused reservation is just an orphan object in a private bucket, and `register`
// best-effort clears the whole staging folder on any failure.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Mirror of the bucket configs in 010_storage.sql.
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = 'id' | 'license' | 'certificate';
const BUCKET_BY_KIND: Record<Kind, string> = {
  id: 'id-documents',
  license: 'contractor-licenses',
  certificate: 'worker-certificates',
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'invalid' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: 'server_misconfigured' }, 500);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }

  const kind: Kind = body?.kind === 'license' || body?.kind === 'certificate' ? body.kind : 'id';

  const mime = (typeof body?.mimeType === 'string' ? body.mimeType : '').toLowerCase().trim();
  const ext = MIME_EXT[mime];
  if (!ext) return json({ ok: false, error: 'unsupported_type' }, 400);

  const size = Number(body?.size);
  if (Number.isFinite(size) && size > MAX_BYTES) return json({ ok: false, error: 'too_large' }, 400);

  const bucket = BUCKET_BY_KIND[kind];
  let registrationId: string;
  let path: string;

  if (kind === 'id') {
    registrationId = crypto.randomUUID();
    path = `${registrationId}/id-document.${ext}`;
  } else {
    // license / certificate must attach to the folder the id call reserved
    const rid = typeof body?.registrationId === 'string' ? body.registrationId.trim() : '';
    if (!UUID_RE.test(rid)) return json({ ok: false, error: 'invalid' }, 400);
    registrationId = rid;
    if (kind === 'license') {
      path = `${registrationId}/license.${ext}`;
    } else {
      const idx = Number(body?.index);
      const safeIdx = Number.isInteger(idx) && idx >= 0 && idx < 100 ? idx : 0;
      path = `${registrationId}/certificate-${safeIdx}.${ext}`;
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.token) return json({ ok: false, error: 'server' }, 500);

  return json({ ok: true, kind, bucket, registrationId, path, token: data.token });
});
