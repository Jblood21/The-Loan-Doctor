// End to end: the real server, a stand-in for GoHighLevel's webhook, and plain HTTP.

import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from './helpers.mjs';

const startReceiver = () =>
  new Promise((resolve) => {
    const hits = [];
    let failNext = 0;
    let status = 200;
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(b);
        } catch {
          /* not JSON */
        }
        hits.push({ url: req.url, json, headers: req.headers });
        if (failNext > 0) {
          failNext--;
          res.writeHead(500);
          return res.end('nope');
        }
        res.writeHead(status);
        res.end('{}');
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({
        hits,
        url: (p = '/hooks/loc1/webhook-trigger/abc') => `http://127.0.0.1:${port}${p}`,
        failNext: (n) => (failNext = n),
        setStatus: (s) => (status = s),
        close: () => srv.close(),
      });
    });
  });

const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fn();
};

const letter = { officer: { name: 'Lou Officer', email: 'lou@lender.test', phone: '555-0100' }, lender: { name: 'Lender Co' }, paragraphs: ['x'] };

describe('GoHighLevel connection, activity events and the public API', () => {
  let s;
  let lo; // loan officer token
  let agent; // agent token
  let loHook;
  let agentHook;
  let asnId;

  beforeAll(async () => {
    s = await startServer({ WEBHOOK_ALLOWED_HOSTS: '127.0.0.1', WEBHOOK_ALLOW_HTTP: 'true', WEBHOOK_RETRY_MS: '20' });
    loHook = await startReceiver();
    agentHook = await startReceiver();
    lo = (await s.register('lou@lender.test', { name: 'Lou Officer', company: 'Lender Co' })).token;
  });
  afterAll(async () => {
    loHook.close();
    agentHook.close();
    await s.stop();
  });

  const asLo = (m, p, body) => s.call(m, p, { token: lo, body });
  const asAgent = (m, p, body) => s.call(m, p, { token: agent, body });

  describe('connecting a webhook address', () => {
    it('refuses addresses that are not GoHighLevel', async () => {
      for (const url of ['', 'not a url', 'https://evil.example.com/hook', 'https://user:pw@services.leadconnectorhq.com/x', 'ftp://services.leadconnectorhq.com/x']) {
        const r = await asLo('PUT', '/integrations/ghl', { url });
        expect(r.status, url).toBe(400);
        expect(r.json.error).toBeTruthy();
      }
      expect((await asLo('GET', '/integrations')).json.ghl.connected).toBe(false);
    });

    it('needs a sign-in', async () => {
      expect((await s.call('GET', '/integrations')).status).toBe(401);
      expect((await s.call('PUT', '/integrations/ghl', { body: { url: loHook.url() } })).status).toBe(401);
    });

    it('saves a good address and sends a test event that GoHighLevel receives', async () => {
      const saved = await asLo('PUT', '/integrations/ghl', { url: loHook.url() });
      expect(saved.status).toBe(200);
      expect(saved.json.ghl).toMatchObject({ connected: true, enabled: true });
      const t = await asLo('POST', '/integrations/ghl/test');
      expect(t.json).toMatchObject({ ok: true, status: 200 });
      const hit = loHook.hits.at(-1);
      expect(hit.json.event).toBe('test');
      expect(hit.json.test).toBe(true);
      expect(hit.headers['content-type']).toContain('application/json');
      expect(hit.json.account.type).toBe('loan_officer');
      // The other person is copied into flat fields a workflow can use directly.
      expect(hit.json.email).toBe('agent@example.com');
      expect(hit.json.first_name).toBe('Sample');
      const log = (await asLo('GET', '/integrations')).json.deliveries;
      expect(log[0]).toMatchObject({ event: 'test', channel: 'ghl', ok: true });
    });

    it('reports a failing address instead of pretending', async () => {
      loHook.setStatus(404);
      const t = await asLo('POST', '/integrations/ghl/test');
      expect(t.json.ok).toBe(false);
      expect(t.json.status).toBe(404);
      loHook.setStatus(200);
    });
  });

  describe('events reach the right people', () => {
    it('assigning a pre-approval notifies the loan officer’s GoHighLevel and the agent’s', async () => {
      agent = (await s.call('POST', '/agent/auth/register', { body: { email: 'amy@realty.test', password: 'password1', name: 'Amy Agent', phone: '555-0199' } })).json.token;
      expect(agent).toBeTruthy();
      await asAgent('PUT', '/agent/integrations/ghl', { url: agentHook.url('/hooks/agentloc/webhook-trigger/zzz') });

      loHook.hits.length = 0;
      const made = await asLo('POST', '/preapproval/assignments', {
        agentEmail: 'amy@realty.test', borrowerName: 'Bo Buyer', propertyAddress: '12 Oak St', approvedPrice: 500000, price: 450000, validityDays: 60, letter,
      });
      expect(made.status).toBe(201);
      asnId = made.json.assignment.id;
      expect(made.json.assignment.status).toBe('preapproved');
      expect(new Date(made.json.assignment.expiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * 86400000);

      const mine = await waitFor(() => loHook.hits.find((h) => h.json?.event === 'preapproval.assigned'));
      expect(mine.json.contact).toMatchObject({ type: 'agent', email: 'amy@realty.test', first_name: 'Amy', last_name: 'Agent' });
      expect(mine.json.preapproval).toMatchObject({ id: asnId, borrowerName: 'Bo Buyer', status: 'preapproved', propertyAddress: '12 Oak St' });

      const theirs = await waitFor(() => agentHook.hits.find((h) => h.json?.event === 'preapproval.assigned'));
      expect(theirs.json.account.type).toBe('agent');
      expect(theirs.json.contact).toMatchObject({ type: 'loan_officer', email: 'lou@lender.test' });
    });

    it('a loan officer moving the stage tells the agent, and an unknown stage is refused', async () => {
      agentHook.hits.length = 0;
      const bad = await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'sold to the moon' });
      expect(bad.status).toBe(400);
      const ok = await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'under_contract' });
      expect(ok.json.assignment.status).toBe('under_contract');
      const ev = await waitFor(() => agentHook.hits.find((h) => h.json?.event === 'preapproval.status_changed'));
      expect(ev.json.preapproval.statusLabel).toBe('Under contract');
      // The agent sees the stage and when it changed.
      const seen = (await asAgent('GET', '/agent/assignments')).json.assignments[0];
      expect(seen.status).toBe('under_contract');
      expect(seen.statusHistory.map((h) => h.status)).toEqual(['under_contract']);
      // Setting the same stage again is not news.
      agentHook.hits.length = 0;
      await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'under_contract' });
      await new Promise((r) => setTimeout(r, 150));
      expect(agentHook.hits.length).toBe(0);
    });

    it('an agent editing the address tells the loan officer (once, not for every keystroke)', async () => {
      loHook.hits.length = 0;
      expect((await asAgent('PATCH', `/agent/assignments/${asnId}`, { propertyAddress: '14 Elm St' })).status).toBe(200);
      const ev = await waitFor(() => loHook.hits.find((h) => h.json?.event === 'preapproval.updated_by_agent'));
      expect(ev.json.preapproval.propertyAddress).toBe('14 Elm St');
      // price changes still follow the loan officer's rule
      expect((await asAgent('PATCH', `/agent/assignments/${asnId}`, { price: 400000 })).status).toBe(403);
    });

    it('the first share link tells the loan officer; making it again does not', async () => {
      loHook.hits.length = 0;
      expect((await asAgent('POST', `/agent/assignments/${asnId}/share`)).status).toBe(201);
      await waitFor(() => loHook.hits.find((h) => h.json?.event === 'preapproval.shared'));
      loHook.hits.length = 0;
      expect((await asAgent('POST', `/agent/assignments/${asnId}/share`)).status).toBe(201);
      await new Promise((r) => setTimeout(r, 150));
      expect(loHook.hits.length).toBe(0);
    });

    it('a refresh request reaches the loan officer, once a day', async () => {
      loHook.hits.length = 0;
      expect((await asAgent('POST', `/agent/assignments/${asnId}/refresh-request`)).status).toBe(200);
      const ev = await waitFor(() => loHook.hits.find((h) => h.json?.event === 'preapproval.refresh_requested'));
      expect(ev.json.message).toMatch(/refreshed/);
      expect((await asAgent('POST', `/agent/assignments/${asnId}/refresh-request`)).status).toBe(429);
    });

    it('an agent can only touch their own pre-approvals', async () => {
      const other = (await s.call('POST', '/agent/auth/register', { body: { email: 'zed@realty.test', password: 'password1' } })).json.token;
      expect((await s.call('PATCH', `/agent/assignments/${asnId}`, { token: other, body: { propertyAddress: 'x' } })).status).toBe(404);
      expect((await s.call('POST', `/agent/assignments/${asnId}/refresh-request`, { token: other })).status).toBe(404);
    });
  });

  describe('delivery is dependable', () => {
    it('retries a flaky address and gives up on a refusal', async () => {
      loHook.hits.length = 0;
      loHook.failNext(2);
      const t = await asLo('POST', '/integrations/ghl/test');
      // the test button does not retry; it tells you straight away
      expect(t.json.ok).toBe(false);
      loHook.hits.length = 0;
      loHook.failNext(2);
      await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'appraisal' });
      // the event itself retries until it gets through (fail, fail, succeed)
      const got = await waitFor(() => loHook.hits.filter((h) => h.json?.event === 'preapproval.status_changed').length >= 3);
      expect(got).toBe(true);
      loHook.hits.length = 0;
      loHook.setStatus(400);
      await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'clear_to_close' });
      await waitFor(() => loHook.hits.length >= 1);
      await new Promise((r) => setTimeout(r, 200));
      expect(loHook.hits.length).toBe(1); // a 400 is not retried
      loHook.setStatus(200);
    });

    it('can be switched off and disconnected', async () => {
      await asLo('PUT', '/integrations/ghl', { enabled: false });
      loHook.hits.length = 0;
      await asLo('PATCH', `/preapproval/assignments/${asnId}`, { status: 'closed' });
      await new Promise((r) => setTimeout(r, 200));
      expect(loHook.hits.length).toBe(0);
      await asLo('PUT', '/integrations/ghl', { enabled: true });
      expect((await asLo('DELETE', '/integrations/ghl')).json.ghl.connected).toBe(false);
      expect((await asLo('PUT', '/integrations/ghl', { enabled: true })).status).toBe(400);
    });

    it('lets people turn the emails off and says why nothing was sent', async () => {
      const log = () => asAgent('GET', '/agent/integrations').then((r) => r.json.deliveries);
      expect((await asAgent('GET', '/agent/integrations')).json.notifyEmail).toBe(true);
      await asAgent('PUT', '/agent/integrations/preferences', { notifyEmail: false });
      await asLo('POST', '/preapproval/assignments', { agentEmail: 'amy@realty.test', borrowerName: 'Cy', propertyAddress: '1 A St', approvedPrice: 1, letter });
      await new Promise((r) => setTimeout(r, 200));
      expect((await log()).find((d) => d.channel === 'email')?.skipped).toMatch(/turned these emails off/);
      expect((await asAgent('PUT', '/agent/integrations/preferences', { notifyEmail: 'yes' })).status).toBe(400);
      await asAgent('PUT', '/agent/integrations/preferences', { notifyEmail: true });
    });
  });

  describe('API keys and /api/v1', () => {
    let key;
    let agentKey;

    it('only a signed-in account can make a key, and the key is shown once', async () => {
      expect((await s.call('POST', '/integrations/keys', { body: { name: 'x' } })).status).toBe(401);
      const made = await asLo('POST', '/integrations/keys', { name: 'GoHighLevel' });
      expect(made.status).toBe(201);
      key = made.json.key;
      expect(key).toMatch(/^lbc_live_[A-Za-z0-9_-]{20,}$/);
      const list = (await asLo('GET', '/integrations')).json.apiKeys;
      expect(list).toHaveLength(1);
      expect(JSON.stringify(list)).not.toContain(key); // only a fingerprint is kept
      expect(list[0].last4).toBe(key.slice(-4));
      agentKey = (await asAgent('POST', '/agent/integrations/keys', { name: 'Agent key' })).json.key;
    });

    it('rejects missing, wrong and revoked keys', async () => {
      expect((await s.call('GET', '/v1/me')).status).toBe(401);
      expect((await s.call('GET', '/v1/me', { token: 'lbc_live_nope' })).status).toBe(401);
      const tmp = (await asLo('POST', '/integrations/keys', { name: 'temp' })).json;
      expect((await s.call('GET', '/v1/me', { token: tmp.key })).status).toBe(200);
      expect((await asLo('DELETE', `/integrations/keys/${tmp.apiKey.id}`)).status).toBe(200);
      expect((await s.call('GET', '/v1/me', { token: tmp.key })).status).toBe(401);
    });

    it('works with an X-API-Key header too, and cannot reach the rest of the app', async () => {
      const r = await s.call('GET', '/v1/me', { headers: { 'X-API-Key': key } });
      expect(r.json).toMatchObject({ type: 'loan_officer', email: 'lou@lender.test' });
      expect((await s.call('GET', '/settings', { token: key })).status).toBe(401);
      expect((await s.call('PUT', '/auth/password', { token: key, body: { newPassword: 'hacked123' } })).status).toBe(401);
      expect((await s.call('GET', '/v1/nothing', { token: key })).status).toBe(404);
    });

    it('lists pre-approvals and moves a loan using friendly stage names', async () => {
      const list = (await s.call('GET', '/v1/preapprovals', { token: key })).json.preapprovals;
      expect(list.find((p) => p.id === asnId)).toMatchObject({ borrowerName: 'Bo Buyer', status: 'closed', statusLabel: 'Closed' });
      expect((await s.call('GET', '/v1/preapprovals?status=closed', { token: key })).json.preapprovals.length).toBeGreaterThan(0);
      expect((await s.call('GET', '/v1/preapprovals?status=bogus', { token: key })).status).toBe(400);
      // POST works as well as PATCH, because some automation tools can only POST
      const r = await s.call('POST', `/v1/preapprovals/${asnId}/status`, { token: key, body: { status: 'Under Contract' } });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ changed: true });
      expect(r.json.preapproval.status).toBe('under_contract');
      expect((await s.call('POST', `/v1/preapprovals/${asnId}/status`, { token: key, body: { status: 'nonsense' } })).status).toBe(400);
      expect((await s.call('POST', `/v1/preapprovals/${asnId}/status`, { token: key, body: { status: 'ctc' } })).json.preapproval.statusLabel).toBe('Clear to close');
    });

    it('finds the loan by borrower name, and only acts when exactly one matches', async () => {
      const post = (body) => s.call('POST', '/v1/preapprovals/status', { token: key, body });
      expect((await post({ status: 'appraisal' })).status).toBe(400); // which loan?
      expect((await post({ borrowerName: 'Nobody Here', status: 'appraisal' })).status).toBe(404);
      const one = await post({ borrowerName: '  bo   BUYER ', status: 'appraisal' });
      expect(one.status).toBe(200);
      expect(one.json.preapproval).toMatchObject({ id: asnId, status: 'appraisal' });
      // a second loan for the same name makes the name ambiguous: refuse rather than guess
      await asLo('POST', '/preapproval/assignments', { agentEmail: 'amy@realty.test', borrowerName: 'Bo Buyer', propertyAddress: '7 Birch Ln', approvedPrice: 300000, letter });
      const both = await post({ borrowerName: 'Bo Buyer', status: 'under_contract' });
      expect(both.status).toBe(409);
      expect(both.json.matches).toBe(2);
      // adding the address (or the id) picks one
      const picked = await post({ borrowerName: 'Bo Buyer', propertyAddress: 'birch', status: 'under_contract' });
      expect(picked.json.preapproval).toMatchObject({ propertyAddress: '7 Birch Ln', status: 'under_contract' });
      expect((await post({ id: asnId, status: 'clear_to_close' })).json.preapproval.id).toBe(asnId);
      // a closed loan is not what "Bo Buyer" means when an open one exists
      await post({ id: asnId, status: 'closed' });
      const open = await post({ borrowerName: 'Bo Buyer', status: 'appraisal' });
      expect(open.json.preapproval.propertyAddress).toBe('7 Birch Ln');
      // put things back for the tests that follow
      await post({ id: asnId, status: 'under_contract' });
    });

    it('keeps one account’s data away from another’s', async () => {
      const lo2 = (await s.register('other@lender.test')).token;
      const k2 = (await s.call('POST', '/integrations/keys', { token: lo2, body: {} })).json.key;
      expect((await s.call('GET', `/v1/preapprovals/${asnId}`, { token: k2 })).status).toBe(404);
      expect((await s.call('POST', `/v1/preapprovals/${asnId}/status`, { token: k2, body: { status: 'closed' } })).status).toBe(404);
      expect((await s.call('GET', '/v1/preapprovals', { token: k2 })).json.preapprovals).toEqual([]);
    });

    it('agent keys see only their own and cannot do loan-officer things', async () => {
      const mine = (await s.call('GET', '/v1/preapprovals', { token: agentKey })).json.preapprovals;
      expect(mine.every((p) => p.agentEmail === 'amy@realty.test')).toBe(true);
      expect((await s.call('POST', `/v1/preapprovals/${asnId}/status`, { token: agentKey, body: { status: 'closed' } })).status).toBe(403);
      expect((await s.call('POST', '/v1/agents/invite', { token: agentKey, body: { email: 'q@x.test' } })).status).toBe(403);
      const edit = await s.call('POST', `/v1/preapprovals/${asnId}`, { token: agentKey, body: { propertyAddress: '99 Pine Rd' } });
      expect(edit.json.preapproval.propertyAddress).toBe('99 Pine Rd');
      expect((await s.call('POST', `/v1/preapprovals/${asnId}`, { token: key, body: { propertyAddress: 'x' } })).status).toBe(403);
    });
  });

  describe('inviting agents', () => {
    it('invites by email, shows the roster, and links the agent when they join', async () => {
      const bad = await asLo('POST', '/preapproval/agents/invite', { email: 'nope' });
      expect(bad.status).toBe(400);
      const inv = await asLo('POST', '/preapproval/agents/invite', { email: 'New.Agent@Realty.test', name: 'Nina New' });
      expect(inv.status).toBe(201);
      expect(inv.json.link).toMatch(/^https:\/\/app\.test\/agent\?invite=/);
      const row = inv.json.agents.find((a) => a.email === 'new.agent@realty.test');
      expect(row).toMatchObject({ status: 'invited', name: 'Nina New', assignments: 0 });
      // inviting again re-sends rather than duplicating
      const again = await asLo('POST', '/preapproval/agents/invite', { email: 'new.agent@realty.test' });
      expect(again.json.agents.filter((a) => a.email === 'new.agent@realty.test')).toHaveLength(1);

      const token = new URL(inv.json.link).searchParams.get('invite');
      const info = await s.call('GET', `/agent/auth/invite-info?token=${encodeURIComponent(token)}`);
      expect(info.json).toMatchObject({ email: 'new.agent@realty.test', name: 'Nina New' });
      expect((await s.call('GET', '/agent/auth/invite-info?token=wrong')).status).toBe(404);

      await asLo('PUT', '/integrations/ghl', { url: loHook.url() });
      loHook.hits.length = 0;
      const joined = await s.call('POST', '/agent/auth/register', { body: { email: 'new.agent@realty.test', password: 'password1', name: 'Nina New', invite: token } });
      expect(joined.status).toBe(201);
      const ev = await waitFor(() => loHook.hits.find((h) => h.json?.event === 'agent.joined'));
      expect(ev.json.contact).toMatchObject({ email: 'new.agent@realty.test' });
      const after = (await asLo('GET', '/preapproval/agents')).json.agents.find((a) => a.email === 'new.agent@realty.test');
      expect(after.status).toBe('active');
      expect(after.lastLoginAt).toBeTruthy();
      // the link only works once
      expect((await s.call('GET', `/agent/auth/invite-info?token=${encodeURIComponent(token)}`)).status).toBe(404);
    });

    it('does not let an agent who already has an account be invited again', async () => {
      const r = await asLo('POST', '/preapproval/agents/invite', { email: 'amy@realty.test' });
      expect(r.status).toBe(409);
    });

    it('shows assignment counts in the roster, and the API returns the same list', async () => {
      const row = (await asLo('GET', '/preapproval/agents')).json.agents.find((a) => a.email === 'amy@realty.test');
      expect(row).toMatchObject({ status: 'active', name: 'Amy Agent', assignments: 3 });
      const key = (await asLo('POST', '/integrations/keys', { name: 'roster' })).json.key;
      const viaApi = (await s.call('GET', '/v1/agents', { token: key })).json.agents.find((a) => a.email === 'amy@realty.test');
      expect(viaApi.assignments).toBe(3);
    });

    it('can cancel an invitation that has not been used', async () => {
      const inv = await asLo('POST', '/preapproval/agents/invite', { email: 'later@realty.test' });
      const id = inv.json.agents.find((a) => a.email === 'later@realty.test').inviteId;
      const gone = await asLo('DELETE', `/preapproval/agents/invites/${id}`);
      expect(gone.json.agents.find((a) => a.email === 'later@realty.test')).toBeUndefined();
    });
  });
});

describe('marketing co-branded with a loan officer', () => {
  let s;
  let lo;
  let agent;
  let asn;
  const rich = {
    officer: { name: 'Lou Officer', title: 'Loan Officer', nmls: '123456', email: 'lou@lender.test', phone: '555-0100' },
    lender: { name: 'Lender Co', nmls: '987654', phone: '555-0111', website: 'lender.test' },
    paragraphs: ['x'],
  };
  beforeAll(async () => {
    s = await startServer({});
    lo = (await s.register('lou@lender.test', { name: 'Lou Officer' })).token;
    agent = (await s.call('POST', '/agent/auth/register', { body: { email: 'amy@realty.test', password: 'password1', name: 'Amy' } })).json.token;
    asn = (await s.call('POST', '/preapproval/assignments', { token: lo, body: { agentEmail: 'amy@realty.test', borrowerName: 'Bo', propertyAddress: '1 A St', approvedPrice: 400000, letter: rich } })).json.assignment.id;
  });
  afterAll(() => s.stop());

  const flyer = (token, extra = {}) =>
    s.call('POST', '/agent/flyer/pdf', { token, body: { listing: { address: '1 A St', price: '$400,000' }, terms: '7% · 30-yr', scenarios: [{ down: '5%', loan: '$1', pi: '$1', taxesIns: '$1', total: '$2' }], ...extra } });

  it('prints a flyer with or without a loan officer', async () => {
    expect((await flyer(agent)).text.startsWith('%PDF')).toBe(true);
    const withLo = await flyer(agent, { loanOfficerFrom: asn });
    expect(withLo.status).toBe(200);
    expect(withLo.text.startsWith('%PDF')).toBe(true);
  });

  it('only lets an agent pick a loan officer who actually sent them a pre-approval', async () => {
    const other = (await s.call('POST', '/agent/auth/register', { body: { email: 'zed@realty.test', password: 'password1' } })).json.token;
    expect((await flyer(other, { loanOfficerFrom: asn })).status).toBe(404);
    expect((await flyer(agent, { loanOfficerFrom: 'asn_nope' })).status).toBe(404);
    const afford = (extra) => s.call('POST', '/agent/share/afford', { token: other, body: { buyerName: 'X', maxPrice: '$1', rows: [], ...extra } });
    expect((await afford({ loanOfficerFrom: asn })).status).toBe(404);
  });

  it('shows the real license numbers on the buyer page, whatever the agent types', async () => {
    const made = await s.call('POST', '/agent/share/afford', {
      token: agent,
      body: { buyerName: 'The Smiths', maxPrice: '$450,000', rows: [], loanOfficerFrom: asn, lender: { officerName: 'Fake Person', officerNmls: '000' } },
    });
    expect(made.status).toBe(201);
    const view = (await s.call('GET', `/public/share/${made.json.token}`)).json.share;
    expect(view.lender).toMatchObject({ officerName: 'Lou Officer', officerNmls: '123456', company: 'Lender Co', companyNmls: '987654', phone: '555-0111' });
    expect(JSON.stringify(view)).not.toMatch(/Fake Person|"000"/);
    // without a loan officer there is no lender block at all
    const plain = await s.call('POST', '/agent/share/afford', { token: agent, body: { buyerName: 'Y', maxPrice: '$1', rows: [] } });
    expect((await s.call('GET', `/public/share/${plain.json.token}`)).json.share.lender).toBeNull();
  });
});

describe('invitation-only mode', () => {
  let s;
  beforeAll(async () => {
    s = await startServer({ ALLOW_SIGNUP: 'false' });
  });
  afterAll(() => s.stop());

  it('lets a real invitation through while public agent sign-up is closed', async () => {
    const admin = await s.adminToken();
    const closed = await s.call('POST', '/agent/auth/register', { body: { email: 'walkin@realty.test', password: 'password1' } });
    expect(closed.status).toBe(403);
    const inv = await s.call('POST', '/preapproval/agents/invite', { token: admin, body: { email: 'guest@realty.test' } });
    expect(inv.status).toBe(201);
    const token = new URL(inv.json.link).searchParams.get('invite');
    // the invitation only opens the door for the address it was sent to
    expect((await s.call('POST', '/agent/auth/register', { body: { email: 'someone.else@realty.test', password: 'password1', invite: token } })).status).toBe(403);
    expect((await s.call('POST', '/agent/auth/register', { body: { email: 'guest@realty.test', password: 'password1', invite: token } })).status).toBe(201);
  });
});
