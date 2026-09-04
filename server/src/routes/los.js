import { Router } from 'express';
import { getLos, setLos, getLosBorrowers, upsertLosBorrowers, clearLosBorrowers, findUserByWebhookToken, ensureWebhookToken, regenerateWebhookToken, sharedWebhookToken, primaryOwnerId, addWebhookLog, getWebhookLog, timingSafeEqualStr } from '../store.js';
import { requireAuth } from '../auth.js';
import { ariveConfigured, ariveSearch } from '../los/arive.js';

const router = Router();

// No demo/sample borrowers anywhere — the list only ever contains real loans
// pushed in from Zapier, so nothing fake can appear in any environment.

/** "John Michael Smith" → "John S." — enough to recognize a record in the diagnostics
 *  log without persisting a full borrower name. */
function maskName(n) {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${parts[0]}${lastInitial}`;
}

function filterByQuery(list, q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return list;
  return list.filter((b) =>
    [b.name, b.meta, b.address, b.loanType, b.purpose, b.phone, b.email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query)),
  );
}

// Build a lookup of the record's fields keyed by a normalized name (lowercase,
// alphanumeric only), flattening one level of common nested objects. This makes
// matching immune to how the Zap labels fields — "Borrower Name", "borrower_name",
// "borrowerName", "BORROWER NAME" all resolve the same.
function flattenFields(rec = {}) {
  const out = {};
  const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const absorb = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) continue; // nested handled below
      if (out[norm(k)] == null || out[norm(k)] === '') out[norm(k)] = v;
    }
  };
  absorb(rec);
  for (const nk of ['borrower', 'property', 'data', 'loan', 'fields', 'contact', 'applicant', 'lead']) {
    if (rec[nk] && typeof rec[nk] === 'object') absorb(rec[nk]);
  }
  return out;
}
function pick(fields, ...names) {
  for (const n of names) {
    const key = String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fields[key] != null && String(fields[key]).trim() !== '') return fields[key];
  }
  return '';
}

/** Map an inbound Zapier/LOS record (any field-naming style, flat or nested) to a borrower. */
function mapInbound(rec = {}) {
  const f = flattenFields(rec);
  const first = pick(f, 'firstName', 'borrowerFirstName', 'applicantFirstName', 'givenName');
  const last = pick(f, 'lastName', 'borrowerLastName', 'applicantLastName', 'surname', 'familyName');
  const name =
    String(
      pick(f, 'borrowerName', 'borrowerFullName', 'name', 'fullName', 'clientName', 'contactName', 'applicantName', 'primaryBorrower', 'borrower') ||
        [first, last].filter(Boolean).join(' '),
    ).trim() || 'Borrower';
  const loanNo = pick(f, 'loanNumber', 'loanId', 'loanNo', 'loanNum', 'fileNumber', 'fileNo', 'applicationNumber', 'loanIdentifier');
  const amount = pick(f, 'loanAmount', 'baseLoanAmount', 'amount', 'loanAmt', 'totalLoanAmount', 'noteAmount');
  const address =
    String(
      pick(f, 'propertyAddress', 'address', 'fullAddress', 'subjectAddress', 'subjectPropertyAddress', 'streetAddress', 'propertyStreetAddress') ||
        [
          pick(f, 'street', 'propertyStreet', 'addressLine1', 'addressLineText', 'streetAddress1'),
          pick(f, 'city', 'propertyCity', 'cityName'),
          pick(f, 'state', 'propertyState', 'stateCode'),
          pick(f, 'zip', 'zipCode', 'postalCode', 'propertyZip'),
        ]
          .filter(Boolean)
          .join(', '),
    ).trim();
  const amountNum = Number(String(amount).replace(/[^0-9.\-]/g, ''));
  const hasAmount = amount !== '' && Number.isFinite(amountNum) && amountNum > 0;
  const meta = [loanNo && `Loan #${loanNo}`, hasAmount && `$${amountNum.toLocaleString('en-US')}`].filter(Boolean).join(' · ');

  // Extra contact + loan details, so the search result shows more of what the Zap sent.
  const phone = String(pick(f, 'phone', 'borrowerPhone', 'phoneNumber', 'mobile', 'mobilePhone', 'cell', 'cellPhone', 'cellphone', 'homePhone', 'contactPhone', 'primaryPhone') || '');
  const email = String(pick(f, 'email', 'borrowerEmail', 'emailAddress', 'contactEmail', 'primaryEmail', 'mail') || '');
  const loanType = String(pick(f, 'loanType', 'mortgageType', 'mortgageAppliedFor', 'loanProgram', 'program', 'productType', 'product', 'productName') || '');
  const purpose = String(pick(f, 'loanPurpose', 'purpose', 'loanPurposeType', 'transactionType', 'loanTransaction') || '');
  const rateRaw = pick(f, 'rate', 'noteRate', 'interestRate', 'intRate');
  const rateNum = Number(String(rateRaw).replace(/[^0-9.\-]/g, ''));
  const rate = rateRaw !== '' && Number.isFinite(rateNum) && rateNum > 0 ? `${rateNum}%` : '';

  return {
    name,
    meta,
    address: String(address || ''),
    loanNumber: String(loanNo || ''),
    amount: hasAmount ? `$${amountNum.toLocaleString('en-US')}` : '',
    phone,
    email,
    loanType,
    purpose,
    rate,
  };
}

// ---- inbound webhook (public; one shared URL for the whole deployment) ---
// Zapier "Webhooks by Zapier → POST" sends Arive loan data here. Accepts a single
// record, an array, or { borrowers: [...] } / { loans: [...] }. The shared token
// routes to one pool everyone sees; a legacy per-user token still routes to that user.
function resolveWebhookTarget(token) {
  const user = findUserByWebhookToken(token);
  if (user) return user.id;
  // Back-compat: a Zap still pointing at the pre-isolation shared URL now feeds the
  // owner's private list, so an existing integration doesn't silently break.
  if (timingSafeEqualStr(token, sharedWebhookToken())) return primaryOwnerId();
  return null;
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
  const mappedAll = records.map(mapInbound);
  const mapped = mappedAll
    .filter((b) => b.name && b.name !== 'Borrower')
    .map((b, i) => ({ id: `${now}-${i}`, receivedAt: now, ...b }));

  // Log enough to inspect the pipeline — the field NAMES Zapier sent, counts, and
  // masked borrower names — WITHOUT persisting raw borrower PII (no raw payload
  // values), since this diagnostics log is readable by signed-in users.
  addWebhookLog(target, {
    at: new Date(now).toISOString(),
    recordsReceived: records.length,
    borrowersStored: mapped.length,
    fieldNames: Object.keys(flattenFields(records[0] || {})).slice(0, 40),
    extractedNames: mappedAll.map((b) => maskName(b.name)).filter(Boolean).slice(0, 20),
  });

  // A test POST with no recognizable fields still succeeds (200) with a hint, so a
  // Zapier setup test doesn't hard-fail — but nothing is stored until real fields arrive.
  if (!mapped.length) {
    return res.json({
      ok: true,
      received: 0,
      warning: 'No borrower fields recognized. Map a borrower name (and ideally loan number, amount, address) in your Zap.',
    });
  }
  upsertLosBorrowers(target, mapped);
  res.json({ ok: true, received: mapped.length });
});

// ---- webhook setup info (auth) -----------------------------------------
// Each officer gets their OWN webhook URL; loans posted to it are private to them.
function webhookUrl(req, token) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/api/los/webhook/${token}`;
}
router.get('/webhook-info', requireAuth, (req, res) => {
  const token = ensureWebhookToken(req.user.id);
  res.json({ token, url: webhookUrl(req, token), count: getLosBorrowers(req.user.id).length });
});
router.post('/webhook-info/regenerate', requireAuth, (req, res) => {
  // The URL is derived from the server secret + user id (stable), so this re-confirms
  // this officer's permanent webhook URL rather than issuing a throwaway one.
  const token = regenerateWebhookToken(req.user.id);
  res.json({ token, url: webhookUrl(req, token) });
});
router.post('/webhook-info/clear', requireAuth, (req, res) => {
  clearLosBorrowers(req.user.id);
  res.json({ ok: true });
});
// Recent webhook activity for THIS officer's URL (field names + counts, names masked).
router.get('/webhook-info/log', requireAuth, (req, res) => {
  res.json({ log: getWebhookLog(req.user.id), count: getLosBorrowers(req.user.id).length });
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
  const mode = getLosBorrowers(req.user.id).length ? 'zapier' : 'demo';
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
  const pushed = getLosBorrowers(req.user.id);
  if (pushed.length) return res.json({ results: filterByQuery(pushed, req.query.q), mode: 'zapier' });
  // No real loans pushed yet — honest empty state (never fake sample borrowers).
  res.json({ results: [], mode: 'demo' });
});

export default router;
