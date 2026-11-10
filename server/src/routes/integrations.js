// The Integrations screen's backend, for both kinds of account (loan officer and agent):
// connect a GoHighLevel webhook, choose whether to get activity emails, make API keys.

import { Router } from 'express';
import { requireAgent, requireAuth } from '../auth.js';
import { addApiKey, ensureWebhookToken, getIntegrations, listApiKeys, revokeApiKey, setIntegrations } from '../store.js';
import { mailConfigured } from '../email.js';
import { EVENTS, eventsFor, sendTestEvent } from '../integrations/events.js';
import { checkWebhookUrl, getDeliveryLog } from '../integrations/webhooks.js';

const MAX_KEYS = 10;
const baseUrl = (req) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

const publicKey = (k) => ({ id: k.id, name: k.name, last4: k.last4, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });

/** kind: 'user' (loan officer) or 'agent'. */
export function integrationsRouter(kind) {
  const router = Router();
  const audience = kind === 'user' ? 'lo' : 'agent';
  router.use(kind === 'user' ? requireAuth : requireAgent);
  const me = (req) => (kind === 'user' ? req.user : req.agent);
  const logKey = (req) => `${kind}:${me(req).id}`;

  const view = (req) => {
    const a = me(req);
    const prefs = getIntegrations(a.id);
    const base = baseUrl(req);
    return {
      kind: audience,
      ghl: { connected: !!prefs.ghlUrl, enabled: !!prefs.ghlEnabled, url: prefs.ghlUrl || '' },
      notifyEmail: prefs.notifyEmail !== false,
      emailConfigured: mailConfigured(),
      events: eventsFor(audience),
      apiKeys: listApiKeys(kind, a.id).map(publicKey),
      deliveries: getDeliveryLog(logKey(req)),
      apiBase: `${base}/api/v1`,
      // Loan officers can also send contacts INTO Basecamp from GoHighLevel at this address.
      inboundUrl: kind === 'user' ? `${base}/api/los/webhook/${ensureWebhookToken(a.id)}` : null,
    };
  };

  router.get('/', (req, res) => res.json(view(req)));

  router.put('/ghl', (req, res) => {
    const a = me(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const prefs = getIntegrations(a.id);
    let url = prefs.ghlUrl || '';
    if (body.url !== undefined) {
      const c = checkWebhookUrl(body.url);
      if (!c.ok) return res.status(400).json({ error: c.error });
      url = c.url;
    }
    if (!url) return res.status(400).json({ error: 'Paste the webhook address from GoHighLevel first.' });
    setIntegrations(a.id, { ghlUrl: url, ghlEnabled: body.enabled === undefined ? true : !!body.enabled });
    res.json(view(req));
  });

  router.delete('/ghl', (req, res) => {
    setIntegrations(me(req).id, { ghlUrl: '', ghlEnabled: false });
    res.json(view(req));
  });

  // Sends one sample event right now and reports what GoHighLevel answered.
  router.post('/ghl/test', async (req, res) => {
    const a = me(req);
    const url = getIntegrations(a.id).ghlUrl;
    if (!url) return res.status(400).json({ error: 'Save a webhook address first.' });
    const r = await sendTestEvent(logKey(req), audience, url, { name: a.name || '', email: a.email });
    res.json({ ok: r.ok, status: r.status, error: r.error || null, deliveries: getDeliveryLog(logKey(req)) });
  });

  router.put('/preferences', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof b.notifyEmail !== 'boolean') return res.status(400).json({ error: 'notifyEmail must be true or false.' });
    setIntegrations(me(req).id, { notifyEmail: b.notifyEmail });
    res.json(view(req));
  });

  router.post('/keys', (req, res) => {
    const a = me(req);
    if (listApiKeys(kind, a.id).length >= MAX_KEYS) return res.status(400).json({ error: `You can have up to ${MAX_KEYS} keys. Delete one you no longer use.` });
    const { key, record } = addApiKey({ kind, ownerId: a.id, name: String(req.body?.name || '').trim() || 'GoHighLevel' });
    // The key is shown this one time only; after this we keep just a fingerprint.
    res.status(201).json({ key, apiKey: publicKey(record), apiKeys: listApiKeys(kind, a.id).map(publicKey) });
  });

  router.delete('/keys/:id', (req, res) => {
    const a = me(req);
    if (!revokeApiKey(req.params.id, kind, a.id)) return res.status(404).json({ error: 'Key not found' });
    res.json({ apiKeys: listApiKeys(kind, a.id).map(publicKey) });
  });

  return router;
}

export { EVENTS };
