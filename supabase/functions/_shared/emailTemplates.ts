// =============================================================================
// BuildUp – transactional email templates (Hebrew, RTL)  (Phase 6)
// =============================================================================
// Small self-contained HTML. Every dynamic value is passed through escapeHtml
// by the builder here, so callers hand raw strings. NEVER interpolate a
// national ID, ID hash/enc, password, reset token, private document link or an
// internal synthetic auth address — templates only take a display name, a job
// title and an optional free-text message/reason.
// =============================================================================

import { escapeHtml } from './email.ts';

export interface EmailContent {
  subject: string;
  html: string;
}

const BRAND = 'BuildUp';

function shell(bodyHtml: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%">
<tr><td style="background:#1d4ed8;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">${BRAND}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.7;text-align:right">${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;text-align:right">
הודעה זו נשלחה אוטומטית ממערכת ${BRAND}. אין להשיב לכתובת זו.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px">${t}</p>`;
const quote = (t: string) =>
  `<blockquote style="margin:12px 0;padding:10px 14px;background:#f1f5f9;border-right:3px solid #1d4ed8;border-radius:6px">${escapeHtml(
    t
  )}</blockquote>`;

// ---- account / registration ------------------------------------------------

export function registrationApproved(fullName: string): EmailContent {
  return {
    subject: `${BRAND} · חשבונך אושר`,
    html: shell(
      p(`שלום ${escapeHtml(fullName || '')},`) +
        p('הרשמתך למערכת אושרה על ידי מנהל. ניתן כעת להתחבר לאפליקציה עם מספר תעודת הזהות והסיסמה שהגדרת.') +
        p('בהצלחה!')
    ),
  };
}

export function registrationRejected(fullName: string, reason?: string): EmailContent {
  return {
    subject: `${BRAND} · לגבי בקשת ההרשמה שלך`,
    html: shell(
      p(`שלום ${escapeHtml(fullName || '')},`) +
        p('לאחר בדיקה, בקשת ההרשמה שלך למערכת לא אושרה בשלב זה.') +
        (reason && reason.trim() ? p('נימוק:') + quote(reason.trim()) : '') +
        p('ניתן לפנות לתמיכה או להגיש בקשה מעודכנת.')
    ),
  };
}

// ---- staffing ------------------------------------------------------------

export function applicationAccepted(jobTitle: string): EmailContent {
  return {
    subject: `${BRAND} · הבקשה שלך אושרה`,
    html: shell(
      p(`הבקשה שלך למשרה "${escapeHtml(jobTitle || '')}" אושרה על ידי הקבלן.`) +
        p('נכנס/י לאפליקציה לצפייה בפרטי השיבוץ.')
    ),
  };
}

export function applicationRejected(jobTitle: string): EmailContent {
  return {
    subject: `${BRAND} · עדכון לגבי בקשתך למשרה`,
    html: shell(
      p(`התקבלה החלטה לגבי הבקשה שלך למשרה "${escapeHtml(jobTitle || '')}".`) +
        p('ניתן לצפות בפרטים באפליקציה ולהגיש מועמדות למשרות נוספות.')
    ),
  };
}

export function invitationReceived(company: string, jobTitle: string): EmailContent {
  return {
    subject: `${BRAND} · הזמנה חדשה לעבודה`,
    html: shell(
      p(
        `${escapeHtml(company || 'קבלן')} הזמין אותך לפרויקט "${escapeHtml(
          jobTitle || ''
        )}".`
      ) + p('נכנס/י לאפליקציה כדי לאשר או לדחות את ההזמנה.')
    ),
  };
}

export function assignmentCancelled(
  jobTitle: string,
  by: 'worker' | 'contractor'
): EmailContent {
  const line =
    by === 'contractor'
      ? `השיבוץ שלך למשרה "${escapeHtml(jobTitle || '')}" בוטל על ידי הקבלן.`
      : `עובד ויתר על השיבוץ למשרה "${escapeHtml(jobTitle || '')}".`;
  return {
    subject: `${BRAND} · עדכון שיבוץ`,
    html: shell(p(line) + p('פרטים מלאים באפליקציה.')),
  };
}

// ---- generic (used by notify-email for the in-app notification mirror) -----
// `title` / `body` come from a `public.notifications` row that was composed
// server-side from a display name + job title only (migration 032) — safe to
// forward verbatim, still escaped here as defence in depth.

export function genericNotice(title: string, body: string): EmailContent {
  return {
    subject: `${BRAND} · ${escapeHtml(title || 'עדכון')}`,
    html: shell(
      `<p style="margin:0 0 8px;font-weight:bold">${escapeHtml(title || '')}</p>` +
        `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(body || '')}</p>` +
        p('פרטים מלאים באפליקציה.')
    ),
  };
}
