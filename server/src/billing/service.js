// Billing logic that touches the store and Stripe: working out a person's access,
// starting Checkout, opening the customer portal, and keeping our records in step
// with Stripe's subscriptions.

import {
  findOrg,
  findUserById,
  getBillingMeta,
  noteBillingEnabled,
  orgMembers,
  updateOrg,
  updateUserBilling,
} from '../store.js';
import { billingConfig, billingEnabled, exemptEmails, DAY_MS } from './config.js';
import { entitlementFor, subscriptionActive, trialEndMs } from './entitlement.js';
import { BillingError } from './errors.js';
import { stripe, stripeConfigured } from './stripe.js';

// ---- access ---------------------------------------------------------------

export function entitlementContext(user, now = Date.now()) {
  const enabled = billingEnabled();
  const enabledAt = enabled ? noteBillingEnabled(now) : Date.parse(getBillingMeta().enabledAt || '') || null;
  return { enabled, now, enabledAt, cfg: billingConfig(), org: findOrg(user.orgId) || null, exempt: exemptEmails() };
}

export function entitlement(user, now = Date.now()) {
  return entitlementFor(user, entitlementContext(user, now));
}

// ---- Stripe subscription -> our record --------------------------------------

/** The few fields we keep from a Stripe subscription. Handles both API shapes: the
 *  period end is on the subscription in older versions and on its item in newer ones. */
export function mapSubscription(sub) {
  const item = sub.items?.data?.[0];
  const endSec = sub.current_period_end ?? item?.current_period_end;
  return {
    id: sub.id,
    status: sub.status,
    interval: item?.price?.recurring?.interval || item?.plan?.interval || null,
    quantity: item?.quantity ?? 1,
    itemId: item?.id || null,
    currentPeriodEnd: endSec ? new Date(endSec * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!(sub.cancel_at_period_end || sub.cancel_at),
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
  };
}

const TERMINAL = new Set(['canceled', 'incomplete_expired']);

/** Stripe doesn't promise event order. Don't let a late, older event undo a newer state. */
function shouldReplace(existing, incoming) {
  if (!existing) return true;
  if (existing.id === incoming.id) return !(TERMINAL.has(existing.status) && !TERMINAL.has(incoming.status));
  // A different subscription: a new live one replaces an old record, a dead one never replaces a live one.
  return !(subscriptionActive(existing, Date.now()) && TERMINAL.has(incoming.status));
}

/** Store a Stripe subscription on whoever it belongs to (a person, or a team). */
export function applySubscription(raw) {
  const { scope, ownerId } = raw.metadata || {};
  const mapped = mapSubscription(raw);
  if (scope === 'org') {
    const org = findOrg(ownerId);
    if (!org) return { applied: false };
    if (!shouldReplace(org.sub, mapped)) return { applied: false };
    updateOrg(org.id, { sub: mapped, stripeCustomerId: mapped.customerId || org.stripeCustomerId, seatSyncError: null });
    return { applied: true, scope, ownerId };
  }
  if (scope === 'user') {
    const user = findUserById(ownerId);
    if (!user) return { applied: false };
    if (!shouldReplace(user.billing?.sub, mapped)) return { applied: false };
    updateUserBilling(user.id, { sub: mapped, stripeCustomerId: mapped.customerId || user.billing?.stripeCustomerId });
    return { applied: true, scope, ownerId };
  }
  return { applied: false };
}

/** Re-read a subscription from Stripe when our copy looks out of date (e.g. a missed webhook). */
export async function refreshIfStale(user, now = Date.now()) {
  if (!stripeConfigured()) return;
  const candidates = [
    { sub: user.billing?.sub, scope: 'user', ownerId: user.id },
    { sub: findOrg(user.orgId)?.sub, scope: 'org', ownerId: user.orgId },
  ];
  for (const { sub, scope, ownerId } of candidates) {
    const end = Date.parse(sub?.currentPeriodEnd || '');
    if (!sub?.id || !Number.isFinite(end) || now <= end) continue;
    try {
      const fresh = await stripe.getSubscription(sub.id);
      applySubscription({ ...fresh, metadata: fresh.metadata?.scope ? fresh.metadata : { scope, ownerId } });
    } catch (err) {
      console.warn(`[billing] couldn't refresh subscription ${sub.id}: ${err.message}`);
    }
  }
}

// ---- Checkout and the customer portal --------------------------------------

const money = (cents) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

/** Start a Stripe Checkout for a person ("solo") or for their team ("team"). Returns { url }. */
export async function createCheckout({ user, plan, interval, baseUrl, now = Date.now() }) {
  if (!stripeConfigured()) throw new BillingError('Payments are not set up yet. Please try again soon.', 503);
  const cfg = billingConfig();
  const base = String(baseUrl).replace(/\/$/, '');
  let scope, ownerId, quantity, unitAmount, billEvery, productName, customerId, trialEnd;

  if (plan === 'team') {
    const org = findOrg(user.orgId);
    if (!org || org.ownerId !== user.id) throw new BillingError('Create your team first, then subscribe it.', 400);
    if (subscriptionActive(org.sub, now)) throw new BillingError('Your team already has a subscription. Use Manage subscription.', 409);
    scope = 'org';
    ownerId = org.id;
    quantity = Math.max(cfg.team.minSeats, orgMembers(org.id).length);
    unitAmount = cfg.team.seatCents;
    billEvery = 'month';
    productName = `Loan Base Camp Team (${money(unitAmount)} per loan officer per month)`;
    customerId = org.stripeCustomerId;
  } else if (plan === 'solo') {
    if (!['month', 'year'].includes(interval)) throw new BillingError('Choose monthly or yearly billing.', 400);
    if (subscriptionActive(user.billing?.sub, now)) throw new BillingError('You already have a subscription. Use Manage subscription.', 409);
    const org = findOrg(user.orgId);
    if (org && subscriptionActive(org.sub, now)) throw new BillingError('Your team already covers you, so you don\'t need a separate plan.', 409);
    scope = 'user';
    ownerId = user.id;
    quantity = 1;
    billEvery = interval;
    unitAmount = interval === 'year' ? cfg.solo.annualMonthlyCents * 12 : cfg.solo.monthlyCents;
    productName = `Loan Base Camp ${interval === 'year' ? 'Solo (yearly)' : 'Solo (monthly)'}`;
    customerId = user.billing?.stripeCustomerId;
    // Subscribing partway through the free trial shouldn't waste the days left: the first
    // charge waits for the trial to end. (Stripe needs the end at least 48h away.)
    const left = trialEndMs(user, entitlementContext(user, now)) - now;
    if (left > 3 * DAY_MS) trialEnd = Math.floor((now + left) / 1000);
  } else {
    throw new BillingError('Choose a plan.', 400);
  }

  const session = await stripe.createCheckoutSession({
    mode: 'subscription',
    success_url: `${base}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing?checkout=canceled`,
    client_reference_id: ownerId,
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    ...(customerId ? { customer: customerId } : { customer_email: user.email }),
    line_items: [
      {
        quantity,
        price_data: { currency: 'usd', unit_amount: unitAmount, recurring: { interval: billEvery }, product_data: { name: productName } },
      },
    ],
    metadata: { scope, ownerId },
    subscription_data: { metadata: { scope, ownerId }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
  });
  if (!session?.url) throw new BillingError('Stripe did not return a checkout page. Please try again.', 502);
  return { url: session.url };
}

/** Open Stripe's customer portal (update card, cancel, download invoices). */
export async function createPortal({ user, scope, baseUrl }) {
  if (!stripeConfigured()) throw new BillingError('Payments are not set up yet.', 503);
  const org = findOrg(user.orgId);
  const orgCustomer = org && org.ownerId === user.id ? org.stripeCustomerId : null;
  const userCustomer = user.billing?.stripeCustomerId || null;
  const customer = scope === 'org' ? orgCustomer : scope === 'user' ? userCustomer : orgCustomer || userCustomer;
  if (!customer) throw new BillingError('There is no subscription to manage yet.', 404);
  const session = await stripe.createPortalSession({ customer, return_url: `${String(baseUrl).replace(/\/$/, '')}/billing` });
  return { url: session.url };
}

/** After Checkout redirects back, pull the new subscription straight from Stripe so the
 *  page updates immediately instead of waiting on the webhook. */
export async function syncCheckoutSession(user, sessionId) {
  if (!stripeConfigured()) throw new BillingError('Payments are not set up yet.', 503);
  const session = await stripe.getCheckoutSession(sessionId);
  const { scope, ownerId } = session.metadata || {};
  const mine =
    (scope === 'user' && ownerId === user.id) || (scope === 'org' && findOrg(ownerId)?.ownerId === user.id);
  if (!mine) throw new BillingError('That checkout does not belong to this account.', 403);
  let sub = session.subscription;
  if (typeof sub === 'string') sub = await stripe.getSubscription(sub);
  if (!sub) return { applied: false };
  return applySubscription({ ...sub, metadata: sub.metadata?.scope ? sub.metadata : { scope, ownerId } });
}

/** Process one verified Stripe webhook event. Throws on a failure Stripe should retry. */
export async function handleStripeEvent(event) {
  const obj = event?.data?.object;
  if (!obj) return { handled: false };
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { handled: true, ...applySubscription(obj) };
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription' || !obj.subscription) return { handled: false };
      const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id;
      const sub = await stripe.getSubscription(subId);
      return { handled: true, ...applySubscription({ ...sub, metadata: sub.metadata?.scope ? sub.metadata : obj.metadata }) };
    }
    default:
      return { handled: false };
  }
}

// ---- Team seats ------------------------------------------------------------

/** Make the number of seats Stripe bills match the team's size (never below the minimum). */
export async function syncSeats(orgId, now = Date.now()) {
  const org = findOrg(orgId);
  if (!org?.sub?.itemId || !subscriptionActive(org.sub, now)) return { changed: false };
  const want = Math.max(billingConfig().team.minSeats, orgMembers(org.id).length);
  if (want === org.sub.quantity) return { changed: false };
  try {
    await stripe.updateSubscriptionQuantity(org.sub.id, org.sub.itemId, want);
    updateOrg(org.id, { sub: { ...org.sub, quantity: want }, seatSyncError: null });
    return { changed: true, quantity: want };
  } catch (err) {
    updateOrg(org.id, { seatSyncError: err.message });
    console.warn(`[billing] seat sync failed for team ${org.id}: ${err.message}`);
    return { changed: false, error: err.message };
  }
}
