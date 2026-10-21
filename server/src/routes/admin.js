import { Router } from 'express';
import { findOrg, findUserById, getAccessCodes, getCounters, getOrgs, getUsers, publicUser, scenarioCount, updateUserBilling } from '../store.js';
import { requireAdmin } from '../auth.js';
import { billingConfig, billingEnabled } from '../billing/config.js';
import { createAccessCode, describeCode, revokeAccessCode } from '../billing/codes.js';
import { subscriptionActive } from '../billing/entitlement.js';
import { entitlement } from '../billing/service.js';
import { stripeConfigured, webhookConfigured } from '../billing/stripe.js';

const router = Router();

// Admin access is granted by a JWT with role=admin (see requireAdmin). There is no
// separate password endpoint — that would be a second, weaker credential path.

/** What the admin table shows next to a user's name: a short state + a human label. */
function accessSummary(user, now) {
  const ent = entitlement(user, now);
  const labels = {
    off: 'Billing off',
    exempt: 'Owner / exempt',
    comp: ent.forever ? 'Free (no end)' : `Free until ${new Date(ent.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    team: 'Team plan',
    subscribed: ent.paymentIssue ? 'Subscribed · payment issue' : 'Subscribed',
    trial: `Trial · ${ent.daysLeft} day${ent.daysLeft === 1 ? '' : 's'} left`,
    locked: 'Locked',
  };
  return { state: ent.state, label: labels[ent.state] || ent.state };
}

router.get('/users', requireAdmin, (req, res) => {
  const now = Date.now();
  res.json({
    users: getUsers().map((u) => ({ ...publicUser(u), access: accessSummary(u, now), team: findOrg(u.orgId)?.name || null })),
  });
});

router.get('/stats', requireAdmin, (req, res) => {
  const users = getUsers();
  const counters = getCounters();
  const scenariosSaved = users.reduce((sum, u) => sum + scenarioCount(u.id), 0);
  const activeToday = users.filter((u) => u.status === 'Active').length;

  // Real counts only — no fabricated baselines.
  const fmt = (n) => n.toLocaleString('en-US');
  res.json({
    stats: [
      { label: 'Total Users', value: fmt(users.length), delta: `${users.length} registered` },
      { label: 'Scenarios Saved', value: fmt(scenariosSaved), delta: 'across all users' },
      { label: 'Active Users', value: fmt(activeToday), delta: 'status: Active' },
      { label: 'Pre-Approvals', value: fmt(counters.preApprovals || 0), delta: 'generated to date' },
    ],
  });
});

// ---- billing overview, access codes, and free-access grants ---------------

const publicCode = (c) => ({
  id: c.id,
  code: c.code,
  label: c.label,
  kind: c.kind,
  months: c.months ?? null,
  until: c.until ?? null,
  trialDays: c.trialDays ?? null,
  maxUses: c.maxUses,
  uses: c.uses,
  redeemBy: c.redeemBy,
  lockedEmail: c.lockedEmail,
  revoked: c.revoked,
  createdAt: c.createdAt,
  gives: describeCode(c),
  redemptions: c.redemptions,
});

router.get('/billing', requireAdmin, (req, res) => {
  const now = Date.now();
  const cfg = billingConfig();
  const counts = { trial: 0, subscribed: 0, team: 0, comp: 0, locked: 0, exempt: 0 };
  for (const u of getUsers()) {
    const state = entitlement(u, now).state;
    if (state in counts) counts[state] += 1;
  }

  // Estimated monthly recurring revenue from list prices (promo codes aren't reflected).
  let mrrCents = 0;
  for (const u of getUsers()) {
    const sub = u.billing?.sub;
    if (!subscriptionActive(sub, now) || sub.status === 'trialing') continue;
    mrrCents += sub.interval === 'year' ? cfg.solo.annualMonthlyCents : cfg.solo.monthlyCents;
  }
  for (const org of getOrgs()) {
    if (!subscriptionActive(org.sub, now) || org.sub.status === 'trialing') continue;
    mrrCents += cfg.team.seatCents * (org.sub.quantity || 1);
  }

  res.json({
    enabled: billingEnabled(),
    stripeReady: stripeConfigured(),
    webhookReady: webhookConfigured(),
    webhookUrl: `${process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`}/api/billing/webhook`,
    counts,
    teams: getOrgs().length,
    mrrCents,
    codes: getAccessCodes().map(publicCode).reverse(),
  });
});

router.post('/codes', requireAdmin, (req, res) => {
  const out = createAccessCode(req.body || {}, req.user.id);
  if (out.error) return res.status(400).json({ error: out.error });
  res.status(201).json({ code: publicCode(out.code) });
});

router.patch('/codes/:id', requireAdmin, (req, res) => {
  const code = revokeAccessCode(req.params.id, req.body?.revoked !== false);
  if (!code) return res.status(404).json({ error: 'Code not found' });
  res.json({ code: publicCode(code) });
});

// Give one person free access directly (no code needed), or take it back.
router.post('/users/:id/comp', requireAdmin, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { mode, months, until, reason } = req.body || {};
  const now = Date.now();
  const stamp = { reason: String(reason || '').trim().slice(0, 160), grantedAt: new Date(now).toISOString(), grantedBy: req.user.id };
  let comp;
  if (mode === 'forever') {
    comp = { ...stamp, forever: true };
  } else if (mode === 'months') {
    const m = Number(months);
    if (!Number.isInteger(m) || m < 1 || m > 60) return res.status(400).json({ error: 'Months must be a whole number from 1 to 60.' });
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() + m);
    comp = { ...stamp, until: d.toISOString() };
  } else if (mode === 'until') {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(String(until)) ? Date.parse(`${until}T23:59:59Z`) : NaN;
    if (!Number.isFinite(t) || t <= now) return res.status(400).json({ error: 'Pick an end date in the future.' });
    comp = { ...stamp, until: new Date(t).toISOString() };
  } else {
    return res.status(400).json({ error: 'Choose forever, a number of months, or an end date.' });
  }
  updateUserBilling(user.id, { comp });
  res.json({ user: { ...publicUser(user), access: accessSummary(user, now) } });
});

router.delete('/users/:id/comp', requireAdmin, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  updateUserBilling(user.id, { comp: null });
  res.json({ user: { ...publicUser(user), access: accessSummary(user, Date.now()) } });
});

export default router;
