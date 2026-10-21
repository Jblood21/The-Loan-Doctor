// End-to-end billing tests: the real server in a child process, a stand-in Stripe, and
// plain HTTP — the same path a browser takes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeStripe } from './fakeStripe.mjs';
import { startServer } from './helpers.mjs';
import { signWebhook } from '../src/billing/stripe.js';

const SECRET = 'whsec_test_secret';
const scenario = { name: 'Test scenario', loanType: 'conventional' };

let evtN = 0;
const subEvent = (type, sub, id = `evt_${++evtN}`) => ({ id, type, data: { object: sub } });
const subObject = (over = {}) => ({
  id: 'sub_x',
  status: 'active',
  customer: 'cus_x',
  metadata: {},
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  cancel_at_period_end: false,
  items: { data: [{ id: 'si_x', quantity: 1, price: { recurring: { interval: 'month' } } }] },
  ...over,
});

async function sendWebhook(server, event, { secret = SECRET, header } = {}) {
  const raw = JSON.stringify(event);
  return server.call('POST', '/billing/webhook', {
    raw,
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header ?? signWebhook(raw, secret) },
  });
}

describe('billing switched off (the default)', () => {
  let s;
  beforeAll(async () => {
    s = await startServer({});
  });
  afterAll(() => s.stop());

  it('leaves everything open and says so', async () => {
    const u = await s.register('a@test.local');
    expect(u.status).toBe(201);
    const status = (await s.call('GET', '/billing', { token: u.token })).json;
    expect(status.enabled).toBe(false);
    expect(status.access).toEqual({ allowed: true, state: 'off' });
    expect((await s.call('POST', '/scenarios', { token: u.token, body: scenario })).status).toBe(201);
  });

  it('refuses webhooks and checkout when Stripe is not set up', async () => {
    const u = await s.register('b@test.local');
    expect((await sendWebhook(s, { id: 'evt_1', type: 'x' })).status).toBe(503);
    const co = await s.call('POST', '/billing/checkout', { token: u.token, body: { plan: 'solo', interval: 'month' } });
    expect(co.status).toBe(503);
  });

  it('still lets an access code be redeemed before billing starts', async () => {
    const admin = await s.adminToken();
    const made = await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', label: 'early friend' } });
    expect(made.status).toBe(201);
    const u = await s.register('c@test.local');
    const r = await s.call('POST', '/billing/redeem', { token: u.token, body: { code: made.json.code.code } });
    expect(r.status).toBe(200);
    expect(r.json.message).toMatch(/free access/i);
  });
});

describe('billing on, trial over', () => {
  let s, fake, admin;
  beforeAll(async () => {
    fake = await startFakeStripe();
    s = await startServer({
      BILLING_ENABLED: 'true',
      BILLING_TRIAL_DAYS: '0',
      BILLING_EXISTING_TRIAL_DAYS: '0',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_API_BASE: fake.base,
    });
    admin = await s.adminToken();
  });
  afterAll(async () => {
    await s.stop();
    await fake.close();
  });

  const lockedUser = async (email) => (await s.register(email)).token;

  describe('the read-only lock', () => {
    it('blocks creating things with a clear, machine-readable 402 but keeps reading open', async () => {
      const t = await lockedUser('lock1@test.local');
      const post = await s.call('POST', '/scenarios', { token: t, body: scenario });
      expect(post.status).toBe(402);
      expect(post.json).toMatchObject({ code: 'billing_required', reason: 'trial_ended' });
      expect(post.json.error).toMatch(/data is safe/i);
      expect((await s.call('GET', '/scenarios', { token: t })).status).toBe(200);
      expect((await s.call('POST', '/preapproval/pdf', { token: t, body: {} })).status).toBe(402);
      expect((await s.call('POST', '/compare/pdf', { token: t, body: {} })).status).toBe(402);
      expect((await s.call('POST', '/share', { token: t, body: {} })).status).toBe(402);
      expect((await s.call('POST', '/ai/compare', { token: t, body: {} })).status).toBe(402);
      expect((await s.call('GET', '/billing', { token: t })).json.access).toMatchObject({ allowed: false, state: 'locked' });
    });

    it('still lets a locked person take their data with them', async () => {
      const t = await lockedUser('lock2@test.local');
      const exp = await s.call('GET', '/billing/export', { token: t });
      expect(exp.status).toBe(200);
      expect(exp.json.profile.email).toBe('lock2@test.local');
      expect(exp.json.profile.passwordHash).toBeUndefined();
      expect(Array.isArray(exp.json.scenarios)).toBe(true);
    });

    it('never locks the admin, and agents are untouched', async () => {
      expect((await s.call('POST', '/scenarios', { token: admin, body: scenario })).status).toBe(201);
      const agent = await s.call('POST', '/agent/auth/register', { body: { email: 'agent@test.local', password: 'password1', name: 'Pat Agent' } });
      expect(agent.status).toBe(201);
      expect((await s.call('GET', '/agent/auth/me', { token: agent.json.token })).status).toBe(200);
    });

    it('rejects unauthenticated billing calls', async () => {
      expect((await s.call('GET', '/billing')).status).toBe(401);
      expect((await s.call('POST', '/billing/redeem', { body: { code: 'X' } })).status).toBe(401);
    });
  });

  describe('subscribing', () => {
    it('starts a monthly checkout with the app-defined price and the right owner', async () => {
      const t = await lockedUser('sub1@test.local');
      const co = await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'month' } });
      expect(co.status).toBe(200);
      expect(co.json.url).toMatch(/^https:\/\/checkout\.fake\/pay\/cs_test_/);
      const call = fake.calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').at(-1);
      expect(call.auth).toBe('Bearer sk_test_123');
      expect(call.version).toBe('2024-06-20');
      const p = call.params;
      expect(p.mode).toBe('subscription');
      expect(p.customer_email).toBe('sub1@test.local');
      expect(p.allow_promotion_codes).toBe('true');
      expect(p.line_items['0']).toMatchObject({ quantity: '1', price_data: { currency: 'usd', unit_amount: '5900', recurring: { interval: 'month' } } });
      expect(p.metadata.scope).toBe('user');
      expect(p.subscription_data.metadata.scope).toBe('user');
      expect(p.success_url).toBe('https://app.test/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}');
      expect(p.cancel_url).toBe('https://app.test/billing?checkout=canceled');
    });

    it('charges 12 x the discounted monthly price for the yearly plan', async () => {
      const t = await lockedUser('sub2@test.local');
      await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'year' } });
      const p = fake.calls.filter((c) => c.path === '/v1/checkout/sessions').at(-1).params;
      expect(p.line_items['0'].price_data.unit_amount).toBe(String(4900 * 12));
      expect(p.line_items['0'].price_data.recurring.interval).toBe('year');
    });

    it('rejects nonsense plans', async () => {
      const t = await lockedUser('sub3@test.local');
      expect((await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'gold' } })).status).toBe(400);
      expect((await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'weekly' } })).status).toBe(400);
      expect((await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'team' } })).status).toBe(400);
    });

    it('unlocks the account right after checkout (sync) and refuses a second subscription', async () => {
      const t = await lockedUser('sub4@test.local');
      const co = await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'month' } });
      const sessionId = co.json.url.split('/').pop();
      fake.completeCheckout(sessionId);
      const synced = await s.call('POST', '/billing/sync', { token: t, body: { sessionId } });
      expect(synced.status).toBe(200);
      expect(synced.json.access).toMatchObject({ allowed: true, state: 'subscribed' });
      expect(synced.json.subscription).toMatchObject({ status: 'active', interval: 'month' });
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(201);
      const again = await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'year' } });
      expect(again.status).toBe(409);
    });

    it("won't let one person claim another person's checkout", async () => {
      const a = await lockedUser('sub5a@test.local');
      const b = await lockedUser('sub5b@test.local');
      const co = await s.call('POST', '/billing/checkout', { token: a, body: { plan: 'solo', interval: 'month' } });
      const sessionId = co.json.url.split('/').pop();
      fake.completeCheckout(sessionId);
      expect((await s.call('POST', '/billing/sync', { token: b, body: { sessionId } })).status).toBe(403);
      expect((await s.call('GET', '/billing', { token: b })).json.access.state).toBe('locked');
      expect((await s.call('POST', '/billing/sync', { token: b, body: { sessionId: '../etc' } })).status).toBe(400);
    });

    it('opens the customer portal for a subscriber only', async () => {
      const t = await lockedUser('sub6@test.local');
      expect((await s.call('POST', '/billing/portal', { token: t, body: {} })).status).toBe(404);
      const co = await s.call('POST', '/billing/checkout', { token: t, body: { plan: 'solo', interval: 'month' } });
      const sessionId = co.json.url.split('/').pop();
      const sub = fake.completeCheckout(sessionId);
      await s.call('POST', '/billing/sync', { token: t, body: { sessionId } });
      const portal = await s.call('POST', '/billing/portal', { token: t, body: {} });
      expect(portal.status).toBe(200);
      expect(portal.json.url).toBe(`https://portal.fake/${sub.customer}`);
    });
  });

  describe('Stripe webhooks', () => {
    it('rejects missing, forged and stale signatures', async () => {
      const ev = subEvent('customer.subscription.updated', subObject());
      expect((await s.call('POST', '/billing/webhook', { raw: JSON.stringify(ev) })).status).toBe(400);
      expect((await sendWebhook(s, ev, { secret: 'whsec_wrong' })).status).toBe(400);
      expect((await sendWebhook(s, ev, { header: signWebhook(JSON.stringify(ev), SECRET, Math.floor(Date.now() / 1000) - 3600) })).status).toBe(400);
    });

    it('keeps a subscription in step: pay, fail a payment, recover, cancel', async () => {
      const t = await lockedUser('wh1@test.local');
      const id = (await s.call('GET', '/billing', { token: t })).json;
      const userId = (await s.call('GET', '/auth/me', { token: t })).json.user.id;
      const meta = { scope: 'user', ownerId: userId };

      const created = await sendWebhook(s, subEvent('customer.subscription.created', subObject({ id: 'sub_wh1', metadata: meta })));
      expect(created.status).toBe(200);
      expect((await s.call('GET', '/billing', { token: t })).json.access).toMatchObject({ allowed: true, state: 'subscribed', paymentIssue: false });

      await sendWebhook(s, subEvent('customer.subscription.updated', subObject({ id: 'sub_wh1', metadata: meta, status: 'past_due' })));
      expect((await s.call('GET', '/billing', { token: t })).json.access).toMatchObject({ allowed: true, paymentIssue: true });

      await sendWebhook(s, subEvent('customer.subscription.updated', subObject({ id: 'sub_wh1', metadata: meta, cancel_at_period_end: true })));
      expect((await s.call('GET', '/billing', { token: t })).json.access).toMatchObject({ allowed: true, cancelAtPeriodEnd: true });

      await sendWebhook(s, subEvent('customer.subscription.deleted', subObject({ id: 'sub_wh1', metadata: meta, status: 'canceled' })));
      const after = (await s.call('GET', '/billing', { token: t })).json.access;
      expect(after).toEqual({ allowed: false, state: 'locked', lockedReason: 'canceled' });
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(402);
      expect(id.access.state).toBe('locked');
    });

    it('ignores a late "active" event that arrives after the cancellation', async () => {
      const t = await lockedUser('wh2@test.local');
      const userId = (await s.call('GET', '/auth/me', { token: t })).json.user.id;
      const meta = { scope: 'user', ownerId: userId };
      await sendWebhook(s, subEvent('customer.subscription.deleted', subObject({ id: 'sub_wh2', metadata: meta, status: 'canceled' })));
      await sendWebhook(s, subEvent('customer.subscription.updated', subObject({ id: 'sub_wh2', metadata: meta, status: 'active' })));
      expect((await s.call('GET', '/billing', { token: t })).json.access.state).toBe('locked');
    });

    it('processes each event once even if Stripe retries it', async () => {
      const ev = subEvent('customer.subscription.updated', subObject({ id: 'sub_nobody', metadata: { scope: 'user', ownerId: 'nope' } }), 'evt_fixed_1');
      expect((await sendWebhook(s, ev)).json).toEqual({ received: true });
      expect((await sendWebhook(s, ev)).json).toEqual({ received: true, duplicate: true });
    });

    it('acknowledges event types it does not use', async () => {
      const r = await sendWebhook(s, { id: 'evt_unused', type: 'charge.refunded', data: { object: {} } });
      expect(r.status).toBe(200);
    });
  });

  describe('access codes', () => {
    const mk = async (body) => (await s.call('POST', '/admin/codes', { token: admin, body })).json;

    it('only admins can manage codes', async () => {
      const t = await lockedUser('codeuser@test.local');
      expect((await s.call('POST', '/admin/codes', { token: t, body: { kind: 'free_forever' } })).status).toBe(403);
      expect((await s.call('GET', '/admin/billing', { token: t })).status).toBe(403);
    });

    it('makes readable codes without look-alike characters', async () => {
      const { code } = await mk({ kind: 'free_forever', label: 'Sam at ABC Lending' });
      expect(code.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(code.label).toBe('Sam at ABC Lending');
      expect(code.uses).toBe(0);
    });

    it('free forever: unlocks with no card, counts the use, and is forgiving about typing', async () => {
      const { code } = await mk({ kind: 'free_forever', maxUses: 2 });
      const t = await lockedUser('code1@test.local');
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(402);
      const sloppy = ` ${code.code.toLowerCase().replace('-', ' ')} `;
      const r = await s.call('POST', '/billing/redeem', { token: t, body: { code: sloppy } });
      expect(r.status).toBe(200);
      expect(r.json.status.access).toMatchObject({ allowed: true, state: 'comp', forever: true });
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(201);
      // Same person again: harmless, not counted twice.
      const again = await s.call('POST', '/billing/redeem', { token: t, body: { code: code.code } });
      expect(again.json.already).toBe(true);
      const list = (await s.call('GET', '/admin/billing', { token: admin })).json.codes.find((c) => c.id === code.id);
      expect(list.uses).toBe(1);
      expect(list.redemptions[0].email).toBe('code1@test.local');
    });

    it('stops at the maximum number of uses', async () => {
      const { code } = await mk({ kind: 'free_forever', maxUses: 1 });
      const a = await lockedUser('max1@test.local');
      const b = await lockedUser('max2@test.local');
      expect((await s.call('POST', '/billing/redeem', { token: a, body: { code: code.code } })).status).toBe(200);
      const second = await s.call('POST', '/billing/redeem', { token: b, body: { code: code.code } });
      expect(second.status).toBe(400);
      expect((await s.call('GET', '/billing', { token: b })).json.access.state).toBe('locked');
    });

    it('can be locked to one email address', async () => {
      const { code } = await mk({ kind: 'free_forever', lockedEmail: 'Chosen@Test.local' });
      const other = await lockedUser('notchosen@test.local');
      const chosen = await lockedUser('chosen@test.local');
      expect((await s.call('POST', '/billing/redeem', { token: other, body: { code: code.code } })).status).toBe(400);
      expect((await s.call('POST', '/billing/redeem', { token: chosen, body: { code: code.code } })).status).toBe(200);
    });

    it('can be revoked, and gives the same vague answer as a code that never existed', async () => {
      const { code } = await mk({ kind: 'free_forever' });
      const rev = await s.call('PATCH', `/admin/codes/${code.id}`, { token: admin, body: { revoked: true } });
      expect(rev.json.code.revoked).toBe(true);
      const t = await lockedUser('rev@test.local');
      const revoked = await s.call('POST', '/billing/redeem', { token: t, body: { code: code.code } });
      const unknown = await s.call('POST', '/billing/redeem', { token: t, body: { code: 'ZZZZ-ZZZZ' } });
      expect(revoked.status).toBe(400);
      expect(revoked.json.error).toBe(unknown.json.error);
    });

    it('free for N months, free until a date, and extra trial days', async () => {
      const months = (await mk({ kind: 'free_months', months: 6 })).code;
      const t1 = await lockedUser('months@test.local');
      const r1 = await s.call('POST', '/billing/redeem', { token: t1, body: { code: months.code } });
      expect(r1.json.status.access).toMatchObject({ allowed: true, state: 'comp' });
      const days = (Date.parse(r1.json.status.access.endsAt) - Date.now()) / 86400000;
      expect(days).toBeGreaterThan(180);
      expect(days).toBeLessThan(186);

      const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const until = (await mk({ kind: 'free_until', until: tomorrow })).code;
      const t2 = await lockedUser('until@test.local');
      const r2 = await s.call('POST', '/billing/redeem', { token: t2, body: { code: until.code } });
      expect(r2.json.status.access).toMatchObject({ allowed: true, state: 'comp' });
      expect(r2.json.status.access.endsAt.slice(0, 10)).toBe(tomorrow);

      const trial = (await mk({ kind: 'trial_days', trialDays: 10 })).code;
      const t3 = await lockedUser('trialdays@test.local');
      const r3 = await s.call('POST', '/billing/redeem', { token: t3, body: { code: trial.code } });
      expect(r3.json.status.access).toMatchObject({ allowed: true, state: 'trial', daysLeft: 10 });
    });

    it('validates what an admin types', async () => {
      expect((await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'nope' } })).status).toBe(400);
      expect((await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_months', months: 0 } })).status).toBe(400);
      expect((await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_until', until: '2001-01-01' } })).status).toBe(400);
      expect((await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', code: 'a!' } })).status).toBe(400);
      const named = await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', code: 'alan vip' } });
      expect(named.json.code.code).toBe('ALAN-VIP');
      expect((await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', code: 'ALAN-VIP' } })).status).toBe(400);
    });

    it('lets the admin grant and remove free access directly', async () => {
      const t = await lockedUser('comp1@test.local');
      const userId = (await s.call('GET', '/auth/me', { token: t })).json.user.id;
      expect((await s.call('POST', `/admin/users/${userId}/comp`, { token: admin, body: { mode: 'forever', reason: 'Friend of the house' } })).json.user.access.state).toBe('comp');
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(201);
      await s.call('DELETE', `/admin/users/${userId}/comp`, { token: admin });
      expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(402);
      expect((await s.call('POST', `/admin/users/${userId}/comp`, { token: admin, body: { mode: 'months', months: 99 } })).status).toBe(400);
    });

    it('summarises billing for the admin', async () => {
      const b = (await s.call('GET', '/admin/billing', { token: admin })).json;
      expect(b).toMatchObject({ enabled: true, stripeReady: true, webhookReady: true, webhookUrl: 'https://app.test/api/billing/webhook' });
      expect(b.counts.locked).toBeGreaterThan(0);
      expect(b.counts.comp).toBeGreaterThan(0);
    });
  });

  describe('teams', () => {
    it('runs the whole life of a team: create, invite, join, pay for seats, add and remove people', async () => {
      const owner = await lockedUser('owner@acme.test');
      expect((await s.call('POST', '/billing/team', { token: owner, body: { name: 'Acme Lending' } })).status).toBe(201);
      const teamId = (await s.call('GET', '/billing', { token: owner })).json.team.id;

      // Invite two people.
      const inv1 = await s.call('POST', '/billing/team/invites', { token: owner, body: { email: 'one@acme.test' } });
      expect(inv1.status).toBe(201);
      const link1 = inv1.json.status.team.invites[0].link;
      expect(link1).toMatch(/^https:\/\/app\.test\/join-team\?token=[0-9a-f]{48}$/);
      const token1 = new URL(link1).searchParams.get('token');
      const info = await s.call('GET', `/billing/invite-info?token=${token1}`);
      expect(info.json).toEqual({ orgName: 'Acme Lending', email: 'one@acme.test' });
      expect((await s.call('GET', '/billing/invite-info?token=bogus')).status).toBe(400);

      // A different email can't use someone else's invitation, at signup or when signed in.
      const wrong = await s.register('thief@acme.test', { invite: token1 });
      expect(wrong.status).toBe(403);
      const stranger = await lockedUser('stranger@test.local');
      expect((await s.call('POST', '/billing/team/join', { token: stranger, body: { token: token1 } })).status).toBe(403);

      // The right person signs up from the invitation and lands on the team.
      const one = await s.register('one@acme.test', { invite: token1 });
      expect(one.status).toBe(201);
      const oneStatus = (await s.call('GET', '/billing', { token: one.token })).json;
      expect(oneStatus.team).toMatchObject({ name: 'Acme Lending', role: 'member' });
      expect(oneStatus.team.invites).toEqual([]); // members can't see invite links
      expect(oneStatus.access.state).toBe('locked'); // team isn't paying yet
      // Landing on the plan page with the same link afterwards is harmless, not an error.
      const again = await s.call('POST', '/billing/team/join', { token: one.token, body: { token: token1 } });
      expect(again.status).toBe(200);
      expect(again.json.team.members).toHaveLength(2);
      // ...but the link can't be reused by anyone else once it has been used.
      const late = await lockedUser('late@acme.test');
      expect((await s.call('POST', '/billing/team/join', { token: late, body: { token: token1 } })).status).toBe(400);

      // Only the owner pays for the team, and the bill never drops below 3 seats.
      expect((await s.call('POST', '/billing/checkout', { token: one.token, body: { plan: 'team' } })).status).toBe(400);
      const co = await s.call('POST', '/billing/checkout', { token: owner, body: { plan: 'team' } });
      expect(co.status).toBe(200);
      const p = fake.calls.filter((c) => c.path === '/v1/checkout/sessions').at(-1).params;
      expect(p.line_items['0']).toMatchObject({ quantity: '3', price_data: { unit_amount: '3900', recurring: { interval: 'month' } } });
      expect(p.metadata).toEqual({ scope: 'org', ownerId: teamId });

      // Stripe says it's paid: everyone on the team is in.
      const sessionId = co.json.url.split('/').pop();
      const sub = fake.completeCheckout(sessionId);
      await sendWebhook(s, subEvent('customer.subscription.created', { ...sub }));
      for (const t of [owner, one.token]) {
        expect((await s.call('GET', '/billing', { token: t })).json.access).toMatchObject({ allowed: true, state: 'team' });
        expect((await s.call('POST', '/scenarios', { token: t, body: scenario })).status).toBe(201);
      }

      // Third and fourth members: the seat count only moves once it passes the minimum.
      const seatCalls = () => fake.calls.filter((c) => c.method === 'POST' && c.path === `/v1/subscriptions/${sub.id}`);
      const join = async (email) => {
        const out = await s.call('POST', '/billing/team/invites', { token: owner, body: { email } });
        const tok = new URL(out.json.status.team.invites.find((i) => i.email === email).link).searchParams.get('token');
        return s.register(email, { invite: tok });
      };
      const three = await join('three@acme.test');
      expect(seatCalls()).toHaveLength(0);
      const four = await join('four@acme.test');
      expect(seatCalls()).toHaveLength(1);
      expect(seatCalls()[0].params.items['0']).toMatchObject({ id: sub.items.data[0].id, quantity: '4' });
      expect(seatCalls()[0].params.proration_behavior).toBe('create_prorations');
      expect(fake.subs.get(sub.id).items.data[0].quantity).toBe(4);
      expect((await s.call('GET', '/billing', { token: owner })).json.team.seatsBilled).toBe(4);

      // Removing someone brings the bill back down; the removed person loses access.
      const fourId = (await s.call('GET', '/auth/me', { token: four.token })).json.user.id;
      expect((await s.call('DELETE', `/billing/team/members/${fourId}`, { token: three.token })).status).toBe(403);
      expect((await s.call('DELETE', `/billing/team/members/${fourId}`, { token: owner })).status).toBe(200);
      expect(fake.subs.get(sub.id).items.data[0].quantity).toBe(3);
      expect((await s.call('GET', '/billing', { token: four.token })).json.access.state).toBe('locked');

      // A member can leave; the owner can't.
      expect((await s.call('POST', '/billing/team/leave', { token: three.token })).status).toBe(200);
      // Two people left, but the team is still billed for the 3-seat minimum.
      expect(fake.subs.get(sub.id).items.data[0].quantity).toBe(3);
      expect((await s.call('GET', '/billing', { token: owner })).json.team).toMatchObject({ seatsBilled: 3, members: expect.any(Array) });
      expect((await s.call('POST', '/billing/team/leave', { token: owner })).status).toBe(400);
      const ownerId = (await s.call('GET', '/auth/me', { token: owner })).json.user.id;
      expect((await s.call('DELETE', `/billing/team/members/${ownerId}`, { token: owner })).status).toBe(400);

      // Cancelling the team locks the people it covered.
      await sendWebhook(s, subEvent('customer.subscription.deleted', { ...fake.subs.get(sub.id), status: 'canceled' }));
      expect((await s.call('GET', '/billing', { token: one.token })).json.access).toMatchObject({ allowed: false, lockedReason: 'canceled' });
    });

    it('only owners can invite, and an address already on a team cannot be invited again', async () => {
      const owner = await lockedUser('o2@acme.test');
      await s.call('POST', '/billing/team', { token: owner, body: { name: 'Two' } });
      const outsider = await lockedUser('o2outsider@test.local');
      expect((await s.call('POST', '/billing/team/invites', { token: outsider, body: { email: 'x@y.test' } })).status).toBe(403);
      expect((await s.call('POST', '/billing/team/invites', { token: owner, body: { email: 'not-an-email' } })).status).toBe(400);
      expect((await s.call('POST', '/billing/team/invites', { token: owner, body: { email: 'o2@acme.test' } })).status).toBe(400);
      expect((await s.call('POST', '/billing/team', { token: owner, body: { name: 'Again' } })).status).toBe(409);
    });

    it('lets an owner cancel a pending invitation, which kills the link', async () => {
      const owner = await lockedUser('o3@acme.test');
      await s.call('POST', '/billing/team', { token: owner, body: { name: 'Three' } });
      const inv = await s.call('POST', '/billing/team/invites', { token: owner, body: { email: 'late@acme.test' } });
      const { id, link } = inv.json.status.team.invites[0];
      const tok = new URL(link).searchParams.get('token');
      const del = await s.call('DELETE', `/billing/team/invites/${id}`, { token: owner });
      expect(del.json.team.invites).toEqual([]);
      expect((await s.call('GET', `/billing/invite-info?token=${tok}`)).status).toBe(400);
    });
  });
});

describe('invitation-only sign-up (ALLOW_SIGNUP=false)', () => {
  let s, admin;
  beforeAll(async () => {
    s = await startServer({ BILLING_ENABLED: 'true', ALLOW_SIGNUP: 'false' });
    admin = await s.adminToken();
  });
  afterAll(() => s.stop());

  it('turns away strangers, and tells them how to get in', async () => {
    const r = await s.register('stranger@test.local');
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/access code/i);
  });

  it('lets a valid access code through, and refuses a wrong one without creating the account', async () => {
    const { code } = (await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', label: 'Beta tester' } })).json;
    const bad = await s.register('guest@test.local', { accessCode: 'ZZZZ-ZZZZ' });
    expect(bad.status).toBe(400);
    expect(bad.json.field).toBe('accessCode');
    expect(await s.login('guest@test.local', 'password1')).toBeUndefined(); // nothing was created

    const ok = await s.register('guest@test.local', { accessCode: code.code });
    expect(ok.status).toBe(201);
    expect(ok.json.notice).toMatch(/free access/i);
    const status = (await s.call('GET', '/billing', { token: ok.token })).json;
    expect(status.access).toMatchObject({ state: 'comp', forever: true });
  });

  it('lets a team invitation through, and a code locked to another email does not work', async () => {
    const { code } = (await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever', lockedEmail: 'vip@test.local' } })).json;
    const owner = await s.register('boss@test.local', { accessCode: (await s.call('POST', '/admin/codes', { token: admin, body: { kind: 'free_forever' } })).json.code.code });
    await s.call('POST', '/billing/team', { token: owner.token, body: { name: 'Boss Co' } });
    const inv = await s.call('POST', '/billing/team/invites', { token: owner.token, body: { email: 'invitee@test.local' } });
    const tok = new URL(inv.json.status.team.invites[0].link).searchParams.get('token');
    expect((await s.register('invitee@test.local', { invite: tok })).status).toBe(201);
    expect((await s.register('notvip@test.local', { accessCode: code.code })).status).toBe(400);
    expect((await s.register('vip@test.local', { accessCode: code.code })).status).toBe(201);
  });
});
