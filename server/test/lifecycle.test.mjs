// The pieces that don't need a running server: stage names, webhook address checks,
// what gets sent, and when expiry reminders go out.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DAY = 86400000;
let status;
let hooks;
let notes;
let life;
let store;
let tmp;
let recv;
const hits = [];

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'basecamp-unit-'));
  process.env.DATA_DIR = tmp;
  process.env.WEBHOOK_ALLOWED_HOSTS = '127.0.0.1';
  process.env.WEBHOOK_ALLOW_HTTP = 'true';
  process.env.WEBHOOK_RETRY_MS = '10';
  process.env.PUBLIC_BASE_URL = 'https://app.test';
  status = await import('../src/lib/status.js');
  hooks = await import('../src/integrations/webhooks.js');
  notes = await import('../src/integrations/notifications.js');
  life = await import('../src/lib/lifecycle.js');
  store = await import('../src/store.js');
  recv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      hits.push({ url: req.url, json: JSON.parse(b) });
      res.writeHead(200).end('{}');
    });
  });
  await new Promise((r) => recv.listen(0, '127.0.0.1', r));
});
afterAll(() => {
  recv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('loan stages', () => {
  it('understands the names people actually type', () => {
    const n = (v) => status.normalizeStatus(v);
    expect(n('under_contract')).toBe('under_contract');
    expect(n('Under Contract')).toBe('under_contract');
    expect(n('under-contract')).toBe('under_contract');
    expect(n('CTC')).toBe('clear_to_close');
    expect(n('Clear to Close')).toBe('clear_to_close');
    expect(n('canceled')).toBe('cancelled');
    expect(n('Pre-Approved')).toBe('preapproved');
    expect(n('funded')).toBe('closed');
  });
  it('rejects anything else', () => {
    for (const v of ['', null, undefined, 'banana', 42, '   ']) expect(status.normalizeStatus(v)).toBeNull();
  });
  it('has a label for every stage', () => {
    for (const s of status.STATUSES) expect(status.STATUS_LABELS[s]).toBeTruthy();
  });
});

describe('webhook addresses', () => {
  const check = (u) => hooks.checkWebhookUrl(u);
  it('accepts the shape GoHighLevel gives out', () => {
    const r = check('https://services.leadconnectorhq.com/hooks/AbC123/webhook-trigger/8d2b-4f');
    expect(r.ok).toBe(true);
    expect(check('https://hooks.gohighlevel.com/x').ok).toBe(true);
  });
  it('refuses lookalikes, other hosts, and anything that is not plain https', () => {
    for (const u of [
      'https://leadconnectorhq.com.evil.com/hooks/x', // suffix trick
      'https://evilleadconnectorhq.com/hooks/x', // no dot boundary
      'https://services.leadconnectorhq.com@evil.com/x', // credentials in front
      'https://user@services.leadconnectorhq.com/x',
      'http://services.leadconnectorhq.com/x', // not https (and http only opens for an explicitly allowed host)
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/hooks',
      'javascript:alert(1)',
      `https://services.leadconnectorhq.com/${'a'.repeat(700)}`,
    ]) {
      expect(check(u).ok, u).toBe(false);
    }
  });
});

describe('what is sent', () => {
  const ctx = {
    assignment: { id: 'asn_1', borrowerName: 'Bo Buyer', propertyAddress: '12 Oak St', price: 450000, approvedPrice: 500000, status: 'appraisal', expiresAt: '2027-01-10T00:00:00.000Z', createdAt: 'x', updatedAt: 'y' },
    lo: { name: 'Lou Officer', email: 'lou@lender.test', phone: '555-0100', company: 'Lender Co' },
    agent: { name: 'Amy Q Agent', email: 'amy@realty.test', phone: '555-0199', company: 'Realty Inc' },
    base: 'https://app.test',
  };
  it('copies the other person into flat fields so a workflow needs no mapping', () => {
    const toLo = notes.webhookPayload('preapproval.assigned', 'lo', ctx);
    expect(toLo).toMatchObject({ event: 'preapproval.assigned', first_name: 'Amy', last_name: 'Q Agent', email: 'amy@realty.test', phone: '555-0199', company: 'Realty Inc' });
    expect(toLo.contact.type).toBe('agent');
    const toAgent = notes.webhookPayload('preapproval.assigned', 'agent', ctx);
    expect(toAgent).toMatchObject({ first_name: 'Lou', email: 'lou@lender.test', account: { type: 'agent' } });
  });
  it('shares only a stage name, never rates or financial detail', () => {
    const p = notes.webhookPayload('preapproval.status_changed', 'agent', { ...ctx, assignment: { ...ctx.assignment, creditScore: '780', rate: 6.5, letter: { secret: 1 } } });
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/780|6\.5|secret/);
    expect(p.preapproval.statusLabel).toBe('Appraisal');
  });
  it('escapes what people typed before it goes into an email', () => {
    const mail = notes.activityEmail('preapproval.assigned', 'agent', { ...ctx, assignment: { ...ctx.assignment, borrowerName: '<img src=x onerror=alert(1)>' } });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img');
    const invite = notes.agentInviteEmail({ loName: '<b>Lou</b>', company: 'A&B', agentName: '"><script>', link: 'https://app.test/agent?invite=t' });
    expect(invite.html).not.toMatch(/<script|<b>Lou/);
  });
  it('has an email for each event an agent or loan officer can get', () => {
    for (const t of ['preapproval.assigned', 'preapproval.status_changed', 'preapproval.expiring']) expect(notes.activityEmail(t, 'agent', ctx)?.subject).toBeTruthy();
    for (const t of ['preapproval.updated_by_agent', 'preapproval.shared', 'preapproval.refresh_requested', 'preapproval.expiring', 'agent.joined']) expect(notes.activityEmail(t, 'lo', ctx)?.subject).toBeTruthy();
  });
});

describe('expiry reminders', () => {
  const made = (days, over = {}) => ({ id: 'a', status: 'preapproved', createdAt: new Date(0).toISOString(), expiresAt: new Date(days * DAY).toISOString(), ...over });

  it('goes out a week before a normal letter lapses', () => {
    const a = made(60);
    expect(life.dueForReminder([a], 52 * DAY)).toHaveLength(0);
    expect(life.dueForReminder([a], 53 * DAY)).toHaveLength(1);
    expect(life.dueForReminder([a], 59.9 * DAY)).toHaveLength(1);
  });
  it('does not nag about a letter that already lapsed', () => {
    expect(life.dueForReminder([made(60)], 61 * DAY)).toHaveLength(0);
  });
  it('gives a short letter a proportionally shorter warning', () => {
    const a = made(6);
    expect(life.dueForReminder([a], 3.9 * DAY)).toHaveLength(0);
    expect(life.dueForReminder([a], 4 * DAY)).toHaveLength(1);
  });
  it('ignores letters with no expiry, finished loans, and ones already reminded', () => {
    const now = 55 * DAY;
    expect(life.dueForReminder([made(60, { expiresAt: null })], now)).toHaveLength(0);
    expect(life.dueForReminder([made(60, { status: 'closed' })], now)).toHaveLength(0);
    expect(life.dueForReminder([made(60, { status: 'cancelled' })], now)).toHaveLength(0);
    expect(life.dueForReminder([made(60, { expiryReminderAt: 'x' })], now)).toHaveLength(0);
    expect(life.dueForReminder([made(60, { status: 'under_contract' })], now)).toHaveLength(1);
  });
  it('survives bad dates', () => {
    expect(life.dueForReminder([made(60, { expiresAt: 'garbage' }), made(60, { createdAt: 'nope' })], 55 * DAY)).toHaveLength(0);
  });

  it('notifies both people once, and only once', async () => {
    const lo = store.addUser({ email: 'lou@lender.test', password: 'password1', name: 'Lou Officer', company: 'Lender Co' });
    const agent = store.addAgent({ email: 'amy@realty.test', password: 'password1', name: 'Amy Agent' });
    const url = `http://127.0.0.1:${recv.address().port}/hooks/x/webhook-trigger/y`;
    store.setIntegrations(lo.id, { ghlUrl: url, ghlEnabled: true, notifyEmail: false });
    store.setIntegrations(agent.id, { ghlUrl: url, ghlEnabled: true, notifyEmail: false });
    const now = Date.now();
    const a = store.addAssignment({
      ownerId: lo.id, ownerName: 'Lou Officer', agentEmail: 'amy@realty.test', borrowerName: 'Bo', propertyAddress: '1 A St',
      approvedPrice: 1, price: 1, status: 'preapproved', letter: {},
      createdAt: new Date(now - 53 * DAY).toISOString(), expiresAt: new Date(now + 6 * DAY).toISOString(),
    });
    expect(life.runExpiryReminders(store.getAssignments(), now, 'https://app.test')).toBe(1);
    const deadline = Date.now() + 3000;
    while (hits.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(hits.map((h) => h.json.account.type).sort()).toEqual(['agent', 'loan_officer']);
    expect(hits.every((h) => h.json.event === 'preapproval.expiring' && h.json.preapproval.id === a.id)).toBe(true);
    expect(store.findAssignmentById(a.id).expiryReminderAt).toBeTruthy();
    // the next sweep finds nothing left to do
    expect(life.runExpiryReminders(store.getAssignments(), now + 3600_000, 'https://app.test')).toBe(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(hits).toHaveLength(2);
  });
});
