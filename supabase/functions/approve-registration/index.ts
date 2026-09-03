// =============================================================================
// BuildUp – Edge Function: approve-registration  (Phase 3A + 051)
// =============================================================================
// Server-authoritative approval. verify_jwt = true, and on top of that the
// caller is re-verified from LIVE `profiles` state as role='admin' AND
// status='approved' (never a JWT claim). The actual materialisation
// (profiles + role tables + child rows + user_identity, flip the registration,
// append the audit event) runs in ONE transaction inside
// public.approve_registration(...), which is service_role-only.
//
// 051 — DOCUMENT MATERIALISATION (staging -> canonical)
//   Documents picked at sign-up are staged under the registration id:
//       contractor-licenses/{regId}/license.<ext>
//       worker-certificates/{regId}/certificate-<n>.<ext>
//   Those paths do NOT satisfy the per-user Storage RLS once the applicant is a
//   real user. Before calling the SQL function this handler MOVES each staged
//   object (service-role) to its canonical, RLS-aligned home:
//       contractor-licenses/{approvedUserId}/license-{regId}.<ext>
//       worker-certificates/{approvedUserId}/certificate-{regId}-<n>.<ext>
//   and passes the canonical paths to approve_registration() via p_doc_overrides
//   so contractor_profiles.license_document_path / worker_certifications.
//   document_path are set to a path the owner can actually read.
//
//   The canonical destination name is DETERMINISTIC (keyed on the registration
//   id), and each successful move is written straight back onto the registration
//   row, so a retry after a partial failure is fully idempotent and never leaves
//   a DB path pointing at a missing object.
//
// body: { registrationId: string, message?: string }
// ok:   { ok: true, userId: string }
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { sendEmail } from '../_shared/email.ts';
import { registrationApproved } from '../_shared/emailTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Map a raised-exception errcode from the SQL function to an HTTP status. */
const rpcStatus = (code?: string): number =>
  code === '42501' ? 403 : code === 'P0002' ? 404 : code === 'P0001' ? 409 : 500;

// deno-lint-ignore no-explicit-any
type Admin = any;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const SAFE_EXT = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'];
const extOf = (p: string): string => {
  const e = (p.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!SAFE_EXT.includes(e)) return 'jpg';
  return e === 'jpeg' ? 'jpg' : e;
};

/**
 * Move a staged object to its canonical path. Tolerant of a retry where a
 * previous attempt already performed the move (deterministic destination):
 *   - move ok            -> verify + return `to`
 *   - move fails, `to`   present -> return `to`   (already moved)
 *   - move fails, `from` present -> return `from` (already canonical-shaped)
 *   - otherwise          -> throw (a real Storage failure; the caller aborts
 *                           BEFORE any DB write, so the approval is retryable)
 */
async function moveToCanonical(
  admin: Admin,
  bucket: string,
  from: string,
  to: string
): Promise<string> {
  if (from === to) return to;
  const moved = await admin.storage.from(bucket).move(from, to);
  if (!moved.error) {
    const v = await admin.storage.from(bucket).createSignedUrl(to, 60);
    if (v.data?.signedUrl) return to;
    throw new Error(`[canonicalize] ${bucket}: destination missing after move`);
  }
  const dst = await admin.storage.from(bucket).createSignedUrl(to, 60);
  if (dst.data?.signedUrl) return to;
  const src = await admin.storage.from(bucket).createSignedUrl(from, 60);
  if (src.data?.signedUrl) return from;
  throw new Error(`[canonicalize] ${bucket}: ${moved.error?.message ?? 'move failed'}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'invalid' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: 'server_misconfigured' }, 500);

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
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;
  if (!registrationId) return json({ ok: false, error: 'invalid' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- live-admin gate (role + status from the DB) ----
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

  // ---- load the pending registration (documents live here) ----
  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .select('id, role, auth_user_id, license_document_path, data')
    .eq('id', registrationId)
    .maybeSingle();
  if (regErr) return json({ ok: false, error: 'server' }, 500);
  if (!reg) return json({ ok: false, error: 'approval_failed' }, 404);

  const userId: string = reg.auth_user_id;

  // ---- staging -> canonical (BEFORE the SQL transaction; retry-idempotent) ----
  // deno-lint-ignore no-explicit-any
  const docOverrides: Record<string, any> = {};
  try {
    if (reg.role === 'contractor') {
      let canonical: string | null = null;
      const stored = str(reg.license_document_path);
      if (stored) {
        if (stored.startsWith(`${userId}/`)) {
          canonical = stored; // already materialised on a prior attempt
        } else {
          const dest = `${userId}/license-${reg.id}.${extOf(stored)}`;
          canonical = await moveToCanonical(admin, 'contractor-licenses', stored, dest);
          await admin.from('registrations')
            .update({ license_document_path: canonical })
            .eq('id', reg.id);
        }
      }
      docOverrides.licenseDocumentPath = canonical;
    }

    if (reg.role === 'worker') {
      const rawCerts: unknown[] = Array.isArray(reg.data?.certifications)
        ? reg.data.certifications
        : [];
      // deno-lint-ignore no-explicit-any
      const out: Array<{ name: string; documentPath?: string }> = [];
      let mutated = false;
      for (let i = 0; i < rawCerts.length; i++) {
        const c = rawCerts[i] as { name?: unknown; documentPath?: unknown };
        const name = str(c?.name);
        if (!name) continue;
        let dp = str(c?.documentPath);
        if (dp && !dp.startsWith(`${userId}/`)) {
          const dest = `${userId}/certificate-${reg.id}-${i}.${extOf(dp)}`;
          dp = await moveToCanonical(admin, 'worker-certificates', dp, dest);
          mutated = true;
        }
        out.push(dp ? { name, documentPath: dp } : { name });
      }
      if (mutated) {
        await admin.from('registrations')
          .update({ data: { ...(reg.data ?? {}), certifications: out } })
          .eq('id', reg.id);
      }
      docOverrides.certifications = out;
    }
  } catch (e) {
    console.error('[approve-registration] document canonicalisation failed', {
      name: (e as Error)?.name,
      message: (e as Error)?.message,
    });
    // Nothing has been materialised yet — safe to retry.
    return json({ ok: false, error: 'document_materialisation_failed' }, 502);
  }

  // ---- atomic approval ----
  const { data, error } = await admin.rpc('approve_registration', {
    p_registration_id: registrationId,
    p_actor_id: callerId,
    p_message: message,
    p_doc_overrides: docOverrides,
  });
  if (error) {
    return json({ ok: false, error: 'approval_failed' }, rpcStatus((error as { code?: string }).code));
  }

  const approvedUserId = data as string;

  // Best-effort approval email to the applicant's real contact address.
  // `approve_registration` copies `auth.users.email` (the exact address the
  // applicant typed at sign-up — verified 1:1 with auth for every approved
  // user) into `profiles.email`, so that is the legitimate contact email.
  // sendEmail() also rejects any synthetic-looking address. A mail failure
  // NEVER affects the approval — the account is already materialised.
  try {
    const { data: prof2 } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', approvedUserId)
      .maybeSingle();
    const to = (prof2 as { email?: string; full_name?: string } | null)?.email ?? '';
    if (to) {
      const { subject, html } = registrationApproved(
        (prof2 as { full_name?: string } | null)?.full_name ?? ''
      );
      await sendEmail({ to, subject, html });
    }
  } catch (e) {
    console.error('[approve-registration] email step failed', { name: (e as Error)?.name });
  }

  return json({ ok: true, userId: approvedUserId });
});
