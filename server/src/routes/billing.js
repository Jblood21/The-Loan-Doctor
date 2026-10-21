import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import {
  findOrg,
  getInvites,
  getScenarios,
  getSettings,
  markStripeEventSeen,
  orgMembers,
  publicUser,
  stripeEventSeen,
  findUserById,
} from '../store.js';
import { billingConfig, billingEnabled } from '../billing/config.js';
import { redeemAccessCode } from '../billing/codes.js';
import { BillingError } from '../billing/errors.js';
import {
  createCheckout,
  createPortal,
  entitlement,
  entitlementContext,
  handleStripeEvent,
  refreshIfStale,
  syncCheckoutSession,
  syncSeats,
} from '../billing/service.js';
import { stripeConfigured, StripeError, verifyWebhook, webhookConfigured } from '../billing/stripe.js';
import { acceptInvite, cancelInvite, checkInvite, createTeam, inviteMember, leaveTeam, removeMember } from '../billing/team.js';
import { inviteEmail, mailConfigured, sendMail } from '../email.js';

const router = Router();
const publicBaseUrl = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

// Entering codes is the one place someone could guess; keep it slow.
const redeemLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
const inviteLookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

/** Run a handler and turn the errors we expect into clean JSON responses. */
const guarded = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof BillingError || err instanceof StripeError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
};

const subSummary = (sub) =>
  sub
    ? {
        status: sub.status,
        interval: sub.interval,
        quantity: sub.quantity,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
      }
    : null;

function teamSummary(user, req) {
  const org = findOrg(user.orgId);
  if (!org) return null;
  const cfg = billingConfig();
  const owner = org.ownerId === user.id;
  const members = orgMembers(org.id).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.id === org.ownerId ? 'owner' : 'member',
  }));
  return {
    id: org.id,
    name: org.name,
    role: owner ? 'owner' : 'member',
    members,
    // Pending invitations (and their links) are the owner's business only.
    invites: owner
      ? getInvites(org.id).map((i) => ({
          id: i.id,
          email: i.email,
          createdAt: i.createdAt,
          expiresAt: i.expiresAt,
          link: `${publicBaseUrl(req)}/join-team?token=${i.token}`,
        }))
      : [],
    seatsBilled: Math.max(cfg.team.minSeats, members.length),
    seatCents: cfg.team.seatCents,
    minSeats: cfg.team.minSeats,
    subscription: subSummary(org.sub),
    seatSyncError: owner ? org.seatSyncError || null : null,
  };
}

export function buildStatus(user, req) {
  const cfg = billingConfig();
  const ctx = entitlementContext(user);
  return {
    enabled: ctx.enabled,
    stripeReady: stripeConfigured(),
    access: entitlement(user),
    plans: {
      trialDays: cfg.trialDays,
      soloMonthlyCents: cfg.solo.monthlyCents,
      soloAnnualMonthlyCents: cfg.solo.annualMonthlyCents,
      teamSeatCents: cfg.team.seatCents,
      teamMinSeats: cfg.team.minSeats,
    },
    subscription: subSummary(user.billing?.sub),
    team: teamSummary(user, req),
  };
}

router.get(
  '/',
  requireAuth,
  guarded(async (req, res) => {
    if (billingEnabled()) await refreshIfStale(req.user);
    res.json(buildStatus(req.user, req));
  }),
);

// Public: lets the sign-in page show which team an invitation is for.
router.get('/invite-info', inviteLookupLimiter, (req, res) => {
  try {
    const { invite, org } = checkInvite(String(req.query.token || ''));
    res.json({ orgName: org.name, email: invite.email });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post(
  '/redeem',
  redeemLimiter,
  requireAuth,
  guarded(async (req, res) => {
    const out = redeemAccessCode(req.user, req.body?.code, entitlementContext(req.user));
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ ok: true, message: out.message, already: !!out.already, status: buildStatus(findUserById(req.user.id), req) });
  }),
);

router.post(
  '/checkout',
  requireAuth,
  guarded(async (req, res) => {
    const { plan, interval } = req.body || {};
    res.json(await createCheckout({ user: req.user, plan, interval, baseUrl: publicBaseUrl(req) }));
  }),
);

router.post(
  '/portal',
  requireAuth,
  guarded(async (req, res) => {
    res.json(await createPortal({ user: req.user, scope: req.body?.scope, baseUrl: publicBaseUrl(req) }));
  }),
);

router.post(
  '/sync',
  requireAuth,
  guarded(async (req, res) => {
    const sessionId = String(req.body?.sessionId || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new BillingError('That checkout reference is not valid.', 400);
    await syncCheckoutSession(req.user, sessionId);
    res.json(buildStatus(findUserById(req.user.id), req));
  }),
);

// Everything the person has made, so a locked account can still take its data with it.
router.get('/export', requireAuth, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="basecamp-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    profile: publicUser(req.user),
    settings: getSettings(req.user.id) || {},
    scenarios: getScenarios(req.user.id),
  });
});

// ---- teams --------------------------------------------------------------

router.post(
  '/team',
  requireAuth,
  guarded(async (req, res) => {
    createTeam(req.user, req.body?.name);
    res.status(201).json(buildStatus(findUserById(req.user.id), req));
  }),
);

router.post(
  '/team/invites',
  requireAuth,
  guarded(async (req, res) => {
    const { org, invite } = inviteMember(req.user, req.body?.email);
    const link = `${publicBaseUrl(req)}/join-team?token=${invite.token}`;
    let emailed = false;
    if (mailConfigured()) {
      const { html, text } = inviteEmail({ inviterName: req.user.name, orgName: org.name, link });
      emailed = (await sendMail({ to: invite.email, subject: `Join ${org.name} on Loan Base Camp`, html, text })).sent;
    }
    res.status(201).json({ emailed, status: buildStatus(findUserById(req.user.id), req) });
  }),
);

router.delete(
  '/team/invites/:id',
  requireAuth,
  guarded(async (req, res) => {
    cancelInvite(req.user, req.params.id);
    res.json(buildStatus(findUserById(req.user.id), req));
  }),
);

router.post(
  '/team/join',
  requireAuth,
  guarded(async (req, res) => {
    const org = acceptInvite(req.user, String(req.body?.token || ''));
    await syncSeats(org.id);
    res.json(buildStatus(findUserById(req.user.id), req));
  }),
);

router.delete(
  '/team/members/:userId',
  requireAuth,
  guarded(async (req, res) => {
    const org = removeMember(req.user, req.params.userId);
    await syncSeats(org.id);
    res.json(buildStatus(findUserById(req.user.id), req));
  }),
);

router.post(
  '/team/leave',
  requireAuth,
  guarded(async (req, res) => {
    const org = leaveTeam(req.user);
    await syncSeats(org.id);
    res.json(buildStatus(findUserById(req.user.id), req));
  }),
);

// ---- Stripe webhook ------------------------------------------------------
// Mounted in index.js on the RAW body (the signature covers the exact bytes Stripe sent).
export async function stripeWebhook(req, res) {
  if (!webhookConfigured()) return res.status(503).json({ error: 'Webhook is not configured.' });
  let event;
  try {
    event = verifyWebhook(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    if (event.id && stripeEventSeen(event.id)) return res.json({ received: true, duplicate: true });
    await handleStripeEvent(event);
    if (event.id) markStripeEventSeen(event.id);
    res.json({ received: true });
  } catch (err) {
    // A 5xx makes Stripe retry later.
    console.error(`[billing] webhook ${event.type} failed:`, err);
    res.status(500).json({ error: 'Could not process the event.' });
  }
}

export default router;
