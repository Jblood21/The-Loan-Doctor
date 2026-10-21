// A small Stripe client over plain HTTPS (no SDK). It only does what billing needs:
// Checkout, the customer portal, reading subscriptions, and changing seat counts.
//
// Configured by env:
//   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET  whsec_… (from the webhook endpoint in the Stripe dashboard)
//   STRIPE_API_BASE        optional override of https://api.stripe.com (used to test against a stand-in)
//
// The API version is pinned so response shapes stay the same no matter what version
// the Stripe account defaults to.

import { createHmac, timingSafeEqual } from 'node:crypto';

const API_VERSION = '2024-06-20';

export class StripeError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const webhookConfigured = () => Boolean(process.env.STRIPE_WEBHOOK_SECRET);

const apiBase = () => (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');

/** Stripe wants nested form fields like line_items[0][quantity]=1. */
export function encodeForm(obj) {
  const pairs = [];
  const walk = (value, key) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}[${k}]` : k);
    else pairs.push([key, String(value)]);
  };
  walk(obj, '');
  return new URLSearchParams(pairs).toString();
}

async function call(method, path, params) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new StripeError('Payments are not set up yet.', 503);
  const get = method === 'GET';
  const body = params ? encodeForm(params) : '';
  let res;
  try {
    res = await fetch(`${apiBase()}/v1${path}${get && body ? `?${body}` : ''}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Stripe-Version': API_VERSION,
        ...(get ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      body: get ? undefined : body,
    });
  } catch (err) {
    throw new StripeError(`Couldn't reach Stripe: ${err?.message || err}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe returned ${res.status}`, res.status >= 500 ? 502 : 400);
  return data;
}

export const stripe = {
  createCheckoutSession: (params) => call('POST', '/checkout/sessions', params),
  getCheckoutSession: (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`, { expand: ['subscription'] }),
  createPortalSession: (params) => call('POST', '/billing_portal/sessions', params),
  getSubscription: (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}`),
  updateSubscriptionQuantity: (subId, itemId, quantity) =>
    call('POST', `/subscriptions/${encodeURIComponent(subId)}`, {
      items: [{ id: itemId, quantity }],
      proration_behavior: 'create_prorations',
    }),
};

/**
 * Check a webhook's Stripe-Signature header against the raw request body and return the
 * parsed event. Throws StripeError(400) when it doesn't verify. `now` is in ms.
 */
export function verifyWebhook(rawBody, header, secret, now = Date.now(), toleranceSec = 300) {
  if (!secret) throw new StripeError('Webhook secret is not configured.', 503);
  const parts = String(header || '').split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) throw new StripeError('Missing or malformed signature.', 400);
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) throw new StripeError('Signature timestamp is outside the allowed window.', 400);
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new StripeError('Signature does not match.', 400);
  try {
    return JSON.parse(payload);
  } catch {
    throw new StripeError('Webhook body is not valid JSON.', 400);
  }
}

/** Build a valid Stripe-Signature header (used by tests and the local stand-in). */
export function signWebhook(rawBody, secret, tSec = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${tSec}.${rawBody}`).digest('hex');
  return `t=${tSec},v1=${sig}`;
}
