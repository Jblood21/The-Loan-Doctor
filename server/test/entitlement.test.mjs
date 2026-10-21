import { describe, expect, it, beforeAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// store.js reads DATA_DIR when it is first imported, so point it at a scratch folder.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'basecamp-unit-'));

const DAY = 24 * 60 * 60 * 1000;
const cfg = { trialDays: 14, existingAccountTrialDays: 30, solo: {}, team: { minSeats: 3, seatCents: 3900 } };
const NOW = Date.parse('2026-10-21T12:00:00Z');
const iso = (t) => new Date(t).toISOString();

let entitlementFor, subscriptionActive, trialEndMs, mapSubscription, encodeForm, verifyWebhook, signWebhook;
beforeAll(async () => {
  ({ entitlementFor, subscriptionActive, trialEndMs } = await import('../src/billing/entitlement.js'));
  ({ mapSubscription } = await import('../src/billing/service.js'));
  ({ encodeForm, verifyWebhook, signWebhook } = await import('../src/billing/stripe.js'));
});

const ctx = (over = {}) => ({ enabled: true, now: NOW, enabledAt: NOW - 100 * DAY, cfg, org: null, exempt: new Set(), ...over });
const user = (over = {}) => ({ id: 'u1', email: 'lo@x.com', role: 'user', createdAt: iso(NOW - 1 * DAY), ...over });

describe('entitlementFor', () => {
  it('lets everyone in while billing is off', () => {
    expect(entitlementFor(user({ createdAt: iso(NOW - 900 * DAY) }), ctx({ enabled: false }))).toEqual({ allowed: true, state: 'off' });
  });

  it('never charges admins or exempt emails', () => {
    const old = { createdAt: iso(NOW - 900 * DAY) };
    expect(entitlementFor(user({ ...old, role: 'admin' }), ctx()).state).toBe('exempt');
    expect(entitlementFor(user({ ...old, email: 'Owner@X.com' }), ctx({ exempt: new Set(['owner@x.com']) })).state).toBe('exempt');
  });

  it('gives a new account the trial counted from sign-up', () => {
    const e = entitlementFor(user({ createdAt: iso(NOW - 3 * DAY) }), ctx());
    expect(e).toMatchObject({ allowed: true, state: 'trial', daysLeft: 11 });
    expect(e.endsAt).toBe(iso(NOW - 3 * DAY + 14 * DAY));
  });

  it('locks a new account once the trial is over', () => {
    const e = entitlementFor(user({ createdAt: iso(NOW - 15 * DAY) }), ctx());
    expect(e).toEqual({ allowed: false, state: 'locked', lockedReason: 'trial_ended' });
  });

  it('gives accounts that predate billing the longer runway from the day billing started', () => {
    const old = user({ createdAt: iso(NOW - 400 * DAY) });
    const switchedOn = NOW - 10 * DAY;
    expect(entitlementFor(old, ctx({ enabledAt: switchedOn }))).toMatchObject({ state: 'trial', daysLeft: 20 });
    expect(entitlementFor(old, ctx({ enabledAt: NOW - 31 * DAY })).state).toBe('locked');
  });

  it('lets a code extend the trial but never shorten it', () => {
    const u = user({ createdAt: iso(NOW - 20 * DAY), billing: { trialEndsAt: iso(NOW + 5 * DAY) } });
    expect(entitlementFor(u, ctx())).toMatchObject({ state: 'trial', daysLeft: 5 });
    const shorter = user({ createdAt: iso(NOW - 1 * DAY), billing: { trialEndsAt: iso(NOW + 2 * DAY) } });
    expect(entitlementFor(shorter, ctx())).toMatchObject({ state: 'trial', daysLeft: 13 });
  });

  it('honours free access: forever, until a date, and expired', () => {
    const base = { createdAt: iso(NOW - 90 * DAY) };
    expect(entitlementFor(user({ ...base, billing: { comp: { forever: true } } }), ctx())).toMatchObject({ allowed: true, state: 'comp', forever: true });
    expect(entitlementFor(user({ ...base, billing: { comp: { until: iso(NOW + 10 * DAY) } } }), ctx())).toMatchObject({ allowed: true, state: 'comp', daysLeft: 10 });
    expect(entitlementFor(user({ ...base, billing: { comp: { until: iso(NOW - DAY) } } }), ctx())).toEqual({ allowed: false, state: 'locked', lockedReason: 'comp_ended' });
  });

  it('treats active, trialing and past-due subscriptions as paid, others as not', () => {
    const base = { createdAt: iso(NOW - 90 * DAY) };
    const sub = (status, extra = {}) => user({ ...base, billing: { sub: { status, currentPeriodEnd: iso(NOW + 5 * DAY), ...extra } } });
    expect(entitlementFor(sub('active'), ctx())).toMatchObject({ allowed: true, state: 'subscribed', paymentIssue: false });
    expect(entitlementFor(sub('trialing'), ctx()).state).toBe('subscribed');
    expect(entitlementFor(sub('past_due'), ctx())).toMatchObject({ allowed: true, paymentIssue: true });
    expect(entitlementFor(sub('active', { cancelAtPeriodEnd: true }), ctx()).cancelAtPeriodEnd).toBe(true);
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(entitlementFor(sub(status), ctx())).toEqual({ allowed: false, state: 'locked', lockedReason: 'canceled' });
    }
  });

  it('stops trusting a subscription whose period ended a week ago with no renewal on record', () => {
    expect(subscriptionActive({ status: 'active', currentPeriodEnd: iso(NOW - 3 * DAY) }, NOW)).toBe(true);
    expect(subscriptionActive({ status: 'active', currentPeriodEnd: iso(NOW - 8 * DAY) }, NOW)).toBe(false);
    expect(subscriptionActive({ status: 'active', currentPeriodEnd: null }, NOW)).toBe(true);
    expect(subscriptionActive(null, NOW)).toBe(false);
  });

  it('covers team members through the team subscription', () => {
    const member = user({ createdAt: iso(NOW - 90 * DAY) });
    const org = { sub: { status: 'active', currentPeriodEnd: iso(NOW + 9 * DAY) } };
    expect(entitlementFor(member, ctx({ org }))).toMatchObject({ allowed: true, state: 'team' });
    const lapsed = { sub: { status: 'canceled', currentPeriodEnd: iso(NOW - DAY) } };
    expect(entitlementFor(member, ctx({ org: lapsed }))).toEqual({ allowed: false, state: 'locked', lockedReason: 'canceled' });
  });

  it('falls back to the personal trial when the team plan is not active', () => {
    const member = user({ createdAt: iso(NOW - 2 * DAY) });
    expect(entitlementFor(member, ctx({ org: { sub: null } })).state).toBe('trial');
  });

  it('prefers free access over everything else', () => {
    const u = user({ createdAt: iso(NOW - 90 * DAY), billing: { comp: { forever: true }, sub: { status: 'canceled' } } });
    expect(entitlementFor(u, ctx()).state).toBe('comp');
  });

  it('computes trial end consistently', () => {
    expect(trialEndMs(user({ createdAt: iso(NOW) }), { now: NOW, enabledAt: NOW - DAY, cfg })).toBe(NOW + 14 * DAY);
  });
});

describe('mapSubscription', () => {
  const item = { id: 'si_1', quantity: 4, price: { recurring: { interval: 'month' } } };
  it('reads the period end from the subscription (older API shape)', () => {
    const m = mapSubscription({ id: 's', status: 'active', customer: 'cus_1', current_period_end: 1800000000, items: { data: [item] } });
    expect(m).toMatchObject({ id: 's', status: 'active', customerId: 'cus_1', interval: 'month', quantity: 4, itemId: 'si_1', cancelAtPeriodEnd: false });
    expect(m.currentPeriodEnd).toBe(new Date(1800000000 * 1000).toISOString());
  });
  it('reads the period end from the item (newer API shape) and expanded customers', () => {
    const m = mapSubscription({ id: 's', status: 'active', customer: { id: 'cus_2' }, cancel_at: 1900000000, items: { data: [{ ...item, current_period_end: 1810000000 }] } });
    expect(m.currentPeriodEnd).toBe(new Date(1810000000 * 1000).toISOString());
    expect(m.customerId).toBe('cus_2');
    expect(m.cancelAtPeriodEnd).toBe(true);
  });
});

describe('Stripe helpers', () => {
  it('form-encodes nested objects and arrays the way Stripe expects', () => {
    const out = new URLSearchParams(
      encodeForm({ mode: 'subscription', line_items: [{ quantity: 2, price_data: { currency: 'usd', recurring: { interval: 'month' } } }], metadata: { a: 'b' }, skip: undefined }),
    );
    expect(out.get('mode')).toBe('subscription');
    expect(out.get('line_items[0][quantity]')).toBe('2');
    expect(out.get('line_items[0][price_data][recurring][interval]')).toBe('month');
    expect(out.get('metadata[a]')).toBe('b');
    expect(out.has('skip')).toBe(false);
  });

  it('accepts a correctly signed webhook and rejects tampering, stale and unsigned ones', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'x' });
    const secret = 'whsec_test';
    const t = Math.floor(NOW / 1000);
    expect(verifyWebhook(Buffer.from(body), signWebhook(body, secret, t), secret, NOW).id).toBe('evt_1');
    expect(() => verifyWebhook(Buffer.from(body + ' '), signWebhook(body, secret, t), secret, NOW)).toThrow(/does not match/);
    expect(() => verifyWebhook(Buffer.from(body), signWebhook(body, 'whsec_other', t), secret, NOW)).toThrow(/does not match/);
    expect(() => verifyWebhook(Buffer.from(body), signWebhook(body, secret, t - 3600), secret, NOW)).toThrow(/window/);
    expect(() => verifyWebhook(Buffer.from(body), '', secret, NOW)).toThrow(/signature/i);
    expect(() => verifyWebhook(Buffer.from(body), signWebhook(body, secret, t), '', NOW)).toThrow(/not configured/);
  });
});
