// A stand-in for the parts of Stripe's API that billing uses, so the real server can be
// exercised end to end without a Stripe account. Not shipped to production.

import http from 'node:http';

/** Turn Stripe-style form fields (a[b][0][c]=1) back into nested objects. */
export function decodeForm(body) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const path = rawKey.replace(/\]/g, '').split('[');
    let cur = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) cur[part] = value;
      else cur = cur[part] ??= {};
    });
  }
  return out;
}

export async function startFakeStripe() {
  let n = 0;
  const sessions = new Map();
  const subs = new Map();
  const calls = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = Buffer.concat(chunks).toString('utf8');
      const params = decodeForm(req.method === 'GET' ? url.searchParams.toString() : body);
      calls.push({ method: req.method, path: url.pathname, params, auth: req.headers.authorization, version: req.headers['stripe-version'] });
      const send = (status, obj) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      let m;
      if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
        const id = `cs_test_${++n}`;
        sessions.set(id, { id, params, subscription: null });
        return send(200, { id, url: `https://checkout.fake/pay/${id}`, mode: 'subscription' });
      }
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) {
        const s = sessions.get(m[1]);
        if (!s) return send(404, { error: { message: 'No such checkout session' } });
        return send(200, { id: s.id, mode: 'subscription', metadata: s.params.metadata, client_reference_id: s.params.client_reference_id, subscription: s.subscription ? subs.get(s.subscription) : null });
      }
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) {
        const sub = subs.get(m[1]);
        return sub ? send(200, sub) : send(404, { error: { message: 'No such subscription' } });
      }
      if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) {
        const sub = subs.get(m[1]);
        if (!sub) return send(404, { error: { message: 'No such subscription' } });
        const item = params.items?.['0'];
        if (item?.quantity) sub.items.data[0].quantity = Number(item.quantity);
        return send(200, sub);
      }
      if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
        return send(200, { id: 'bps_1', url: `https://portal.fake/${params.customer}` });
      }
      return send(404, { error: { message: `Unhandled ${req.method} ${url.pathname}` } });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    calls,
    sessions,
    subs,
    /** Pretend the customer paid: create the subscription the session would have produced. */
    completeCheckout(sessionId, { status = 'active', periodDays = 30 } = {}) {
      const s = sessions.get(sessionId);
      const li = s.params.line_items['0'];
      const subId = `sub_${++n}`;
      const sub = {
        id: subId,
        status,
        customer: `cus_${n}`,
        metadata: s.params.subscription_data?.metadata || s.params.metadata,
        current_period_end: Math.floor(Date.now() / 1000) + periodDays * 86400,
        cancel_at_period_end: false,
        items: { data: [{ id: `si_${n}`, quantity: Number(li.quantity), price: { recurring: { interval: li.price_data.recurring.interval } } }] },
      };
      subs.set(subId, sub);
      s.subscription = subId;
      return sub;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
