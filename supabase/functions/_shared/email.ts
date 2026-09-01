// =============================================================================
// BuildUp – shared transactional-email helper  (Phase 6)
// =============================================================================
// Server-only. Called from Edge Functions (never the app). Sends one email via
// Resend's REST API. The provider secret lives ONLY as a Supabase Edge Function
// secret (`RESEND_API_KEY`) — never in Expo, never `EXPO_PUBLIC_*`, never git.
//
// CONTRACT
//   • Best-effort: never throws. Returns { ok, skipped?, status? } so a caller
//     can log the outcome but MUST NOT roll back its business transaction when
//     email fails (see each Edge Function).
//   • No-op (ok:false, skipped:true) with a single structured warn line when
//     `RESEND_API_KEY` is unset — so the feature is inert until you add the
//     secret, and no delivery is ever faked.
//   • Recipient is validated. `html` is assembled by the caller from templates
//     that escape untrusted content. This module never logs the html/body or
//     any recipient PII beyond a boolean.
// =============================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
// A verified sender for your Resend account/domain. For a demo you may use
// Resend's shared sender `onboarding@resend.dev` (no domain setup needed).
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'BuildUp <onboarding@resend.dev>';
const EMAIL_REPLY_TO = Deno.env.get('EMAIL_REPLY_TO') ?? '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * True for an address that looks like an INTERNAL / non-deliverable identity
 * rather than a real applicant contact email.
 *
 * In BuildUp this should never match: `register` creates the Auth user with the
 * exact email the applicant typed (validated `EMAIL_RE`), `registrations` has NO
 * email column (migration 016: "the email lives on auth.users"), and
 * `approve_registration` copies `auth.users.email` verbatim into
 * `profiles.email`. Recipient resolution + normal email validation are the real
 * protection; this only rejects addresses that CANNOT be a real mailbox
 * (localhost / reserved non-routable TLDs / an explicit internal domain).
 * It never judges by a legitimate public domain or by the local part, so a
 * real address like `123456@gmail.com` is fine.
 */
export function isLikelySyntheticEmail(email: string): boolean {
  const e = (email ?? '').trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return true;
  const domain = e.slice(e.lastIndexOf('@') + 1);
  return (
    domain === 'localhost' ||
    /\.(local|invalid|internal|localhost)$/.test(domain)
  );
}

export interface SendEmailResult {
  ok: boolean;
  /** true when RESEND_API_KEY is unset — nothing was sent, nothing faked */
  skipped?: boolean;
  status?: number;
}

/** HTML-escape untrusted text before it goes into a template. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const to = (opts.to ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) {
    console.warn('[email] invalid recipient — not sent', { subjectLen: opts.subject.length });
    return { ok: false };
  }
  // Never send a business email to a synthetic / internal identity.
  if (isLikelySyntheticEmail(to)) {
    console.warn('[email] recipient looks synthetic — not sent', { subjectLen: opts.subject.length });
    return { ok: false };
  }
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — email skipped', { subject: opts.subject });
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: opts.subject,
        html: opts.html,
        ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      // log status only — never the response body (may echo the payload)
      console.error('[email] provider rejected', { status: res.status });
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.error('[email] send failed', { name: (e as Error)?.name });
    return { ok: false };
  }
}
