import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { addUser, findUserByEmail, findUserById, publicUser, updateUser, normalizeEmail, bumpSessionEpoch } from '../store.js';
import { requireAuth, signToken } from '../auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Registration is OPEN and FREE — anyone can create an account (no access code). Each
// account's data (scenarios, borrowers, settings) is private to that user, so open
// signup doesn't expose anyone else's information. An operator can still close signups
// entirely for abuse by setting ALLOW_SIGNUP=false in the environment.
const SIGNUPS_OPEN = process.env.ALLOW_SIGNUP !== 'false';

router.post('/register', (req, res) => {
  const { password, name = '', company = '' } = req.body || {};
  const email = normalizeEmail(req.body?.email);

  if (!SIGNUPS_OPEN) {
    return res.status(403).json({ error: 'Account creation is temporarily closed. Please try again later.' });
  }

  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

  const user = addUser({ email, password, name, company, role: 'user', status: 'Active' });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
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

// Server-side logout — invalidates this user's outstanding tokens everywhere.
router.post('/logout', requireAuth, (req, res) => {
  bumpSessionEpoch(req.user.id);
  res.json({ ok: true });
});

export default router;
