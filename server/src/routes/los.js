import { Router } from 'express';
import { getLos, setLos, getLosBorrowers, upsertLosBorrowers, clearLosBorrowers, findUserByWebhookToken, sharedWebhookToken, SHARED_LOS_KEY } from '../store.js';
import { requireAuth } from '../auth.js';
import { ariveConfigured, ariveSearch } from '../los/arive.js';

const router = Router();

// No demo/sample borrowers anywhere — the list only ever contains real loans
// pushed in from Zapier, so nothing fake can appear in any environment.

function filterByQuery(list, q) {
  const query = String(q || '').trim().toLowerCase();
  return query ? list.filter((b) => b.name.toLowerCase().includes(query) || (b.meta || '').toLowerCase().includes(query)) : list;
}

/** Map an inbound Zapier/LOS record (flat or nested) to a borrower. */
function mapInbound(rec = {}) {
  const b = rec.borrower || rec;
  const p = rec.property || rec;
  const name =
    (rec.borrowerName || rec.borrower_name || rec.name || [b.firstName || rec.firstName, b.lastName || rec.lastName].filter(Boolean).join(' ')).toString().trim() ||
    'Borrower';
  const loanNo = rec.loanNumber || rec.loan_number || rec.loanId || rec.id || '';
  const amount = rec.loanAmount || rec.loan_amount || rec.amount;
  const address =
    rec.propertyAddress ||
    rec.property_address ||
    rec.address ||
    p.fullAddress ||
    [rec.propertyStreet || p.street, rec.propertyCity || p.city, rec.propertyState || p.state, rec.propertyZip || p.zip].filter(Boolean).join(', ') ||
    '';
  const amountNum = Number(amount);
  const hasAmount = amount != null && amount !== '' && Number.isFinite(amountNum);
  const meta = [loanNo && `Loan #${loanNo}`, hasAmount && `$${amountNum.toLocaleString('en-US')}`].filter(Boolean).join(' · ');
  return { name, meta, address: String(address || ''), loanNumber: String(loanNo || '') };
}

// ---- inbound webhook (public; one shared URL for the whole deployment) ---
// Zapier "Webhooks by Zapier → POST" sends Arive loan data here. Accepts a single
// record, an array, or { borrowers: [...] } / { loans: [...] }. The shared token
// routes to one pool everyone sees; a legacy per-user token still routes to that user.
function resolveWebhookTarget(token) {
  if (token === sharedWebhookToken()) return SHARED_LOS_KEY;
  const user = findUserByWebhookToken(token);
  return user ? user.id : null;
}

// GET is a liveness/verification probe: opening the webhook URL in a browser (or a
// connectivity check from Zapier/monitoring) confirms the endpoint is active without
// sending data. A valid token returns 200 {active:true}; an unknown token 404s.
router.get('/webhook/:token', (req, res) => {
  const target = resolveWebhookTarget(req.params.token);
  if (!target) return res.status(404).json({ error: 'Unknown webhook token' });
  res.json({
    ok: true,
    active: true,
    message: 'Webhook is live. Send a POST with loan JSON to add borrowers.',
    received: getLosBorrowers(target).length,
  });
});

router.post('/webhook/:token', (req, res) => {
  const target = resolveWebhookTarget(req.params.token);
  if (!target) return res.status(404).json({ error: 'Unknown webhook token' });
  const body = req.body || {};
  const records = Array.isArray(body) ? body : body.borrowers || body.loans || [body];
  const now = Date.now();
  const mapped = records
    .map(mapInbound)
    .filter((b) => b.name && b.name !== 'Borrower')
    .map((b, i) => ({ id: `${now}-${i}`, receivedAt: now, ...b }));
  // A test POST with no recognizable fields still succeeds (200) with a hint, so a
  // Zapier setup test doesn't hard-fail — but nothing is stored until real fields arrive.
  if (!mapped.length) {
    return res.json({
      ok: true,
      received: 0,
      warning: 'No borrower fields recognized. Map borrowerName, loanNumber, loanAmount, and propertyAddress in your Zap.',
    });
  }
  upsertLosBorrowers(target, mapped);
  res.json({ ok: true, received: mapped.length });
});

// ---- webhook setup info (auth) -----------------------------------------
// One shared webhook URL is returned for everyone.
function webhookUrl(req, token) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/api/los/webhook/${token}`;
}
router.get('/webhook-info', requireAuth, (req, res) => {
  const token = sharedWebhookToken();
  res.json({ token, url: webhookUrl(req, token), count: getLosBorrowers(SHARED_LOS_KEY).length });
});
router.post('/webhook-info/regenerate', requireAuth, (req, res) => {
  // The shared URL is derived from the server secret and can't be rotated per user;
  // re-confirm it so the button still returns the current, permanent URL.
  const token = sharedWebhookToken();
  res.json({ token, url: webhookUrl(req, token) });
});
router.post('/webhook-info/clear', requireAuth, (req, res) => {
  clearLosBorrowers(SHARED_LOS_KEY);
  res.json({ ok: true });
});

// ---- connect / search ---------------------------------------------------
router.post('/connect', requireAuth, async (req, res) => {
  const provider = req.body?.provider || 'arive';
  // Direct API (only if a provider exposes one and it's configured via env).
  if (provider === 'arive' && ariveConfigured()) {
    try {
      await ariveSearch('');
      setLos(req.user.id, provider, true);
      return res.json({ connected: true, provider, mode: 'live' });
    } catch (err) {
      return res.status(502).json({ error: `Could not reach ${provider}: ${err.message}` });
    }
  }
  setLos(req.user.id, provider, true);
  const mode = getLosBorrowers(SHARED_LOS_KEY).length ? 'zapier' : 'demo';
  res.json({ connected: true, provider, mode });
});

router.post('/disconnect', requireAuth, (req, res) => {
  const provider = req.body?.provider || 'arive';
  setLos(req.user.id, provider, false);
  res.json({ connected: false, provider });
});

router.get('/borrowers', requireAuth, async (req, res) => {
  const provider = req.query.provider || 'arive';
  if (!getLos(req.user.id)[provider]) return res.status(409).json({ error: 'LOS provider not connected' });

  if (provider === 'arive' && ariveConfigured()) {
    try {
      return res.json({ results: await ariveSearch(String(req.query.q || '')), mode: 'live' });
    } catch (err) {
      return res.status(502).json({ error: `${provider} API error: ${err.message}` });
    }
  }
  const pushed = getLosBorrowers(SHARED_LOS_KEY);
  if (pushed.length) return res.json({ results: filterByQuery(pushed, req.query.q), mode: 'zapier' });
  // No real loans pushed yet — honest empty state (never fake sample borrowers).
  res.json({ results: [], mode: 'demo' });
});

export default router;
