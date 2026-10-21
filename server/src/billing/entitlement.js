// Who gets to use the paid workspace, decided from stored facts only (no network).
// Kept pure — `now` and every setting come in through `ctx` — so it can be tested
// exhaustively and reused by the request guard, the billing page and the admin list.

import { DAY_MS } from './config.js';

// Stripe statuses that still mean "paid up" (past_due keeps access while Stripe retries the card).
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);
// If a subscription's period ended this long ago and we never heard about a renewal,
// stop trusting it (a cancel webhook may have been missed).
const STALE_AFTER_MS = 7 * DAY_MS;

const ms = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : null;
};

export function subscriptionActive(sub, now) {
  if (!sub || !PAID_STATUSES.has(sub.status)) return false;
  const end = ms(sub.currentPeriodEnd);
  return !(end !== null && now > end + STALE_AFTER_MS);
}

/** When the free trial ends for this user (a later `billing.trialEndsAt` from a code wins). */
export function trialEndMs(user, { now, enabledAt, cfg }) {
  const created = ms(user.createdAt) ?? now;
  const switchedOn = enabledAt ?? now;
  const base =
    created < switchedOn
      ? switchedOn + cfg.existingAccountTrialDays * DAY_MS // account predates billing
      : created + cfg.trialDays * DAY_MS;
  const extended = ms(user.billing?.trialEndsAt) ?? 0;
  return Math.max(base, extended);
}

const daysUntil = (t, now) => Math.max(0, Math.ceil((t - now) / DAY_MS));

/**
 * ctx: { enabled, now, enabledAt, cfg, org, exempt }
 *   org     — the team the user belongs to (or null)
 *   exempt  — Set of lower-cased emails that never pay
 */
export function entitlementFor(user, ctx) {
  const { enabled, now, org, exempt } = ctx;
  if (!enabled) return { allowed: true, state: 'off' };
  if (user.role === 'admin' || exempt?.has(String(user.email || '').toLowerCase())) {
    return { allowed: true, state: 'exempt' };
  }

  const b = user.billing || {};
  const comp = b.comp || null;
  const compUntil = ms(comp?.until);
  if (comp?.forever) return { allowed: true, state: 'comp', forever: true };
  if (compUntil !== null && compUntil > now) {
    return { allowed: true, state: 'comp', endsAt: new Date(compUntil).toISOString(), daysLeft: daysUntil(compUntil, now) };
  }

  if (org && subscriptionActive(org.sub, now)) {
    return {
      allowed: true,
      state: 'team',
      paymentIssue: org.sub.status === 'past_due',
      endsAt: org.sub.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!org.sub.cancelAtPeriodEnd,
    };
  }

  if (subscriptionActive(b.sub, now)) {
    return {
      allowed: true,
      state: 'subscribed',
      paymentIssue: b.sub.status === 'past_due',
      endsAt: b.sub.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!b.sub.cancelAtPeriodEnd,
    };
  }

  const trialEnd = trialEndMs(user, ctx);
  if (trialEnd > now) {
    return { allowed: true, state: 'trial', endsAt: new Date(trialEnd).toISOString(), daysLeft: daysUntil(trialEnd, now) };
  }

  let lockedReason = 'trial_ended';
  if (b.sub || org?.sub) lockedReason = 'canceled';
  else if (comp && compUntil !== null) lockedReason = 'comp_ended';
  return { allowed: false, state: 'locked', lockedReason };
}
