import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { addUser, findUserByEmail, findUserById, publicUser, updateUser, normalizeEmail, bumpSessionEpoch } from '../store.js';
import { requireAuth, signToken } from '../auth.js';
import { checkAccessCode, redeemAccessCode } from '../billing/codes.js';
import { entitlementContext, syncSeats } from '../billing/service.js';
import { acceptInvite, checkInvite } from '../billing/team.js';
import { requestPasswordReset, performPasswordReset } from '../passwordReset.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicBaseUrl = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

// Registration is open unless ALLOW_SIGNUP=false. When it is closed the site is
// invitation-only: a valid access code (issued from the admin console) or a team
// invitation link still lets that person create an account. Each account's data is
// private to that user, so open signup doesn't expose anyone else's information.
const SIGNUPS_OPEN = process.env.ALLOW_SIGNUP !== 'false';

router.post('/register', async (req, res, next) => {
  try {
    const { password, name = '', company = '' } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    const accessCode = String(req.body?.accessCode || '').trim();
    const inviteToken = String(req.body?.invite || '').trim();

    // Closed to the public: only someone presenting a code or an invitation may continue
    // (and each is verified below before any account is created).
    if (!SIGNUPS_OPEN && !accessCode && !inviteToken) {
      return res.status(403).json({ error: 'Sign-ups are by invitation right now. Enter the access code you were given, or use your team invitation link.' });
    }

    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (findUserByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

    // Check the code and the invitation BEFORE creating anything, so a typo is fixed
    // on the same form rather than discovered after the account exists.
    if (accessCode) {
      const check = checkAccessCode(accessCode, email);
      if (!check.ok) return res.status(400).json({ error: check.error, field: 'accessCode' });
    }
    let invitedOrg = null;
    if (inviteToken) {
      try {
        invitedOrg = checkInvite(inviteToken, email).org;
      } catch (err) {
        return res.status(err.status || 400).json({ error: err.message, field: 'invite' });
      }
    }

    const user = addUser({ email, password, name, company, role: 'user', status: 'Active' });
    let redeemed = null;
    if (accessCode) redeemed = redeemAccessCode(user, accessCode, entitlementContext(user));
    if (invitedOrg) {
      acceptInvite(user, inviteToken);
      await syncSeats(invitedOrg.id);
    }
    res.status(201).json({ token: signToken(user), user: publicUser(user), notice: redeemed?.message || null });
  } catch (err) {
    next(err);
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  // A deactivated account must not be able to authenticate.
  if (user.status && user.status !== 'Active') {
    return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put('/profile', requireAuth, (req, res) => {
  const { name, company, phone, nmls, email } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (company !== undefined) patch.company = company;
  if (phone !== undefined) patch.phone = phone;
  if (nmls !== undefined) patch.nmls = nmls;
  if (email !== undefined && EMAIL_RE.test(email)) {
    const existing = findUserByEmail(email);
    if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'Email already in use' });
    patch.email = String(email).toLowerCase();
  }
  const user = updateUser(req.user.id, patch);
  res.json({ user: publicUser(user) });
});

router.put('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = findUserById(req.user.id);
  if (!bcrypt.compareSync(currentPassword || '', user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  updateUser(user.id, { passwordHash: bcrypt.hashSync(newPassword, 12) });
  // Invalidate every previously-issued token, then hand back a fresh one so the
  // current session stays signed in with the new epoch.
  bumpSessionEpoch(user.id);
  res.json({ ok: true, token: signToken(findUserById(user.id)) });
});

// Self-serve password reset (no auth). forgot-password always returns ok so it can't
// be used to probe which emails are registered; the token arrives only by email.
router.post('/forgot-password', async (req, res) => {
  const out = await requestPasswordReset({ kind: 'user', email: req.body?.email, baseUrl: publicBaseUrl(req) });
  res.json(out);
});
router.post('/reset-password', (req, res) => {
  const r = performPasswordReset({ token: req.body?.token, newPassword: req.body?.newPassword });
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json({ ok: true });
});

// Server-side logout — invalidates this user's outstanding tokens everywhere.
router.post('/logout', requireAuth, (req, res) => {
  bumpSessionEpoch(req.user.id);
  res.json({ ok: true });
});

export default router;
