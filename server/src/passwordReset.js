// Shared self-serve password-reset flow for both loan-officer users and agents.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  createResetToken,
  consumeResetToken,
  findUserByEmail,
  updateUser,
  findAgentByEmail,
  updateAgent,
  bumpSessionEpoch,
} from './store.js';
import { sendMail, mailConfigured, resetEmail } from './email.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Begin a reset. Always resolves to { ok: true } so callers never reveal whether an
 * email is registered. In non-production (or when email isn't configured) the reset
 * link is returned as `devLink` so the flow is testable without a mail provider.
 */
export async function requestPasswordReset({ kind, email, baseUrl }) {
  const e = String(email || '').trim().toLowerCase();
  const account = kind === 'agent' ? findAgentByEmail(e) : findUserByEmail(e);
  const out = { ok: true };
  if (!e || !account) return out; // silent no-op — don't leak account existence

  const raw = crypto.randomBytes(32).toString('hex');
  createResetToken(kind, account.id, sha(raw), Date.now() + TTL_MS);
  const link = `${String(baseUrl).replace(/\/$/, '')}/reset-password?token=${raw}&kind=${kind}`;
  const { html, text } = resetEmail({ name: account.name || '', link });
  const mail = await sendMail({ to: e, subject: 'Reset your Loan Base Camp password', html, text });

  if (!mail.sent) {
    console.warn(`[password-reset] email not sent to ${e}: ${mail.reason || mail.error || 'unknown'}`);
    if (process.env.NODE_ENV !== 'production') out.devLink = link; // testable locally
  }
  if (!mailConfigured()) out.emailConfigured = false;
  return out;
}

/** Complete a reset using the token from the emailed link. Returns {ok} or {ok:false,status,error}. */
export function performPasswordReset({ token, newPassword }) {
  const pw = String(newPassword || '');
  if (pw.length < 6) return { ok: false, status: 400, error: 'New password must be at least 6 characters' };
  const rec = consumeResetToken(sha(String(token || '')));
  if (!rec) return { ok: false, status: 400, error: 'This reset link is invalid or has expired. Request a new one.' };
  const passwordHash = bcrypt.hashSync(pw, 12);
  if (rec.kind === 'agent') {
    updateAgent(rec.id, { passwordHash });
  } else {
    updateUser(rec.id, { passwordHash });
    bumpSessionEpoch(rec.id); // invalidate any existing sessions after a reset
  }
  return { ok: true };
}
