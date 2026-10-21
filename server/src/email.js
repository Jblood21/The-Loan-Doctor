// Minimal transactional email via Resend (https://resend.com), configured by env:
//   RESEND_API_KEY   — your Resend API key
//   MAIL_FROM        — verified sender, e.g. "Loan Base Camp <no-reply@yourdomain.com>"
// If unset, sending is skipped (callers fall back to a dev link in non-production).
// Uses global fetch (Node 18+); no extra dependency.

const RESEND_URL = 'https://api.resend.com/emails';

/** Escape text that came from a user before it goes into an HTML email. */
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) return { sent: false, reason: 'not-configured' };
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: String(err && err.message ? err.message : err) };
  }
}

/** Branded password-reset email. */
export function resetEmail({ name, link, appName = 'Loan Base Camp' }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  const hiHtml = name ? `Hi ${esc(name)},` : 'Hi,';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ea;font-family:Arial,Helvetica,sans-serif;color:#1b2431">
  <div style="max-width:480px;margin:0 auto;padding:28px">
    <div style="background:#ffffff;border:1px solid #e2e0d6;border-radius:14px;padding:26px">
      <div style="font-size:18px;font-weight:700;color:#2f649c;margin-bottom:12px">${appName}</div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${hiHtml}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 18px">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
      <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#2f649c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">Reset password</a></p>
      <p style="font-size:12px;line-height:1.6;color:#4a5666;margin:0 0 6px">If the button doesn't work, copy and paste this link:</p>
      <p style="font-size:12px;line-height:1.5;word-break:break-all;margin:0 0 16px"><a href="${link}" style="color:#2f649c">${link}</a></p>
      <p style="font-size:12px;line-height:1.6;color:#4a5666;margin:0">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  </div></body></html>`;
  const text = `${hi}\n\nReset your ${appName} password (expires in 1 hour):\n${link}\n\nIf you didn't request this, ignore this email.`;
  return { html, text };
}

/** Team invitation email. */
export function inviteEmail({ inviterName, orgName, link, appName = 'Loan Base Camp' }) {
  const who = inviterName ? `${inviterName} invited you` : 'You were invited';
  const whoHtml = esc(who);
  const orgHtml = esc(orgName);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ea;font-family:Arial,Helvetica,sans-serif;color:#1b2431">
  <div style="max-width:480px;margin:0 auto;padding:28px">
    <div style="background:#ffffff;border:1px solid #e2e0d6;border-radius:14px;padding:26px">
      <div style="font-size:18px;font-weight:700;color:#2f649c;margin-bottom:12px">${appName}</div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${whoHtml} to join <strong>${orgHtml}</strong> on ${appName}.</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 18px">Your team covers the cost, so there's nothing to pay. Click below to create your account or sign in. This link expires in 14 days.</p>
      <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#2f649c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">Join ${orgHtml}</a></p>
      <p style="font-size:12px;line-height:1.6;color:#4a5666;margin:0 0 6px">If the button doesn't work, copy and paste this link:</p>
      <p style="font-size:12px;line-height:1.5;word-break:break-all;margin:0"><a href="${link}" style="color:#2f649c">${link}</a></p>
    </div>
  </div></body></html>`;
  const text = `${who} to join ${orgName} on ${appName}.\n\nYour team covers the cost, so there's nothing to pay. Create your account or sign in here (the link expires in 14 days):\n${link}`;
  return { html, text };
}
