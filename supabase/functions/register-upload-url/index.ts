// =============================================================================
// BuildUp – Edge Function: register-upload-url  (Phase 3B)
// =============================================================================
// Sign-up is UNauthenticated, and the `id-documents` bucket has NO client
// write policy (010: service-role only, via register). This function lets the
// signing-up user upload their ID document straight to Storage WITHOUT a
// session and WITHOUT the service-role key ever reaching the client:
//
//   • it reserves a fresh registrationId (uuid) and the exact object path
//       id-documents/{registrationId}/id-document.<ext>
//   • it mints a short-lived one-shot signed upload token
//       (storage.createSignedUploadUrl, service-role, server-side only)
//   • the client uploads the bytes with that token, then calls `register`
//       with { reservedRegistrationId, idDocumentPath }. `register` verifies
//       the object exists before persisting registrations.id_document_path.
//
// verify_jwt = false (there is no session yet). No DB write happens here — an
// unused reservation is just an orphan object in a private bucket.
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

// Mirror of the id-documents bucket config in 010_storage.sql.
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_BYTES = 10 * 1024 * 1024;

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

  const mime = (typeof body?.mimeType === 'string' ? body.mimeType : '').toLowerCase().trim();
  const ext = MIME_EXT[mime];
  if (!ext) return json({ ok: false, error: 'unsupported_type' }, 400);

  const size = Number(body?.size);
  if (Number.isFinite(size) && size > MAX_BYTES) return json({ ok: false, error: 'too_large' }, 400);

  const registrationId = crypto.randomUUID();
  const path = `${registrationId}/id-document.${ext}`;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.storage.from('id-documents').createSignedUploadUrl(path);
  if (error || !data?.token) return json({ ok: false, error: 'server' }, 500);

  return json({ ok: true, registrationId, path, token: data.token });
});
