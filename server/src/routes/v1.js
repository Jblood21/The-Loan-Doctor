// The public API: /api/v1. Meant for GoHighLevel (or Zapier, n8n, a script…) calling in with
// a key made on the Integrations screen.
//
//   Authorization: Bearer lbc_live_…
//
// Loan officer keys can list pre-approvals, move a loan to a new stage and invite agents.
// Agent keys can list their pre-approvals, update the address/price (when allowed) and ask
// for a refresh. Everything uses the same rules as the app screens.

import { Router } from 'express';
import { requireApiKey, onlyFor } from '../integrations/apiKeyAuth.js';
import { applyAgentEdit, applyStatus, requestRefresh } from '../lib/lifecycle.js';
import { buildRoster, inviteAgent } from '../lib/roster.js';
import { STATUSES, STATUS_LABELS, normalizeStatus } from '../lib/status.js';
import { findAssignmentById, getAssignmentsByAgentEmail, getAssignmentsByOwner } from '../store.js';
import { publicAssignment } from './preapproval.js';

const router = Router();
const baseUrl = (req) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

router.use(requireApiKey);

const shape = (a) => ({ ...publicAssignment(a), statusLabel: STATUS_LABELS[a.status || 'preapproved'] });

router.get('/me', (req, res) => {
  if (req.apiKind === 'user') {
    const u = req.user;
    return res.json({ type: 'loan_officer', name: u.name || '', email: u.email, company: u.company || '' });
  }
  const a = req.agent;
  res.json({ type: 'agent', name: a.name || '', email: a.email, brokerage: a.brokerage || '' });
});

router.get('/statuses', (_req, res) => {
  res.json({ statuses: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })) });
});

/** The pre-approvals this key can see. */
function mine(req) {
  return req.apiKind === 'user' ? getAssignmentsByOwner(req.user.id) : getAssignmentsByAgentEmail(req.agent.email);
}
function owned(req) {
  const a = findAssignmentById(req.params.id);
  if (!a) return null;
  if (req.apiKind === 'user' ? a.ownerId !== req.user.id : a.agentEmail !== req.agent.email) return null;
  return a;
}

router.get('/preapprovals', (req, res) => {
  let list = mine(req);
  const status = req.query.status ? normalizeStatus(req.query.status) : null;
  if (req.query.status && !status) return res.status(400).json({ error: `Unknown status. Use one of: ${STATUSES.join(', ')}.` });
  if (status) list = list.filter((a) => (a.status || 'preapproved') === status);
  if (req.apiKind === 'user' && req.query.agentEmail) {
    const e = String(req.query.agentEmail).trim().toLowerCase();
    list = list.filter((a) => a.agentEmail === e);
  }
  res.json({ preapprovals: list.map(shape) });
});

router.get('/preapprovals/:id', (req, res) => {
  const a = owned(req);
  if (!a) return res.status(404).json({ error: 'Pre-approval not found' });
  res.json({ preapproval: shape(a) });
});

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Move a loan to a new stage without knowing its id: say which loan by borrower name and
// (optionally) property address or agent email. Works only when exactly one loan matches,
// so an automation can never change the wrong one.
router.post('/preapprovals/status', onlyFor('user'), (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  let found;
  if (b.id) {
    found = mine(req).filter((a) => a.id === String(b.id));
  } else {
    if (!b.borrowerName && !b.propertyAddress && !b.agentEmail) {
      return res.status(400).json({ error: 'Say which loan: send id, or borrowerName (with propertyAddress or agentEmail if the name is not unique).' });
    }
    const addr = norm(b.propertyAddress);
    const email = String(b.agentEmail || '').trim().toLowerCase();
    found = mine(req).filter(
      (a) =>
        (!b.borrowerName || norm(a.borrowerName) === norm(b.borrowerName)) &&
        (!addr || norm(a.propertyAddress).includes(addr) || addr.includes(norm(a.propertyAddress))) &&
        (!email || a.agentEmail === email),
    );
    // Several matches: loans that are already closed or cancelled are probably not the one meant.
    const open = found.filter((a) => !['closed', 'cancelled'].includes(a.status || 'preapproved'));
    if (found.length > 1 && open.length >= 1) found = open;
  }
  if (!found.length) return res.status(404).json({ error: 'No pre-approval matches that.' });
  if (found.length > 1) {
    return res.status(409).json({ error: `${found.length} pre-approvals match. Add propertyAddress or agentEmail, or send the id.`, matches: found.length });
  }
  const r = applyStatus(found[0], b.status, { source: 'api', base: baseUrl(req) });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ changed: r.changed, preapproval: shape(r.assignment) });
});

// Move a loan to a new stage. POST, PUT and PATCH all work, since some automation tools
// can only send POST.
router.all('/preapprovals/:id/status', onlyFor('user'), (req, res) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Use POST.' });
  const a = owned(req);
  if (!a) return res.status(404).json({ error: 'Pre-approval not found' });
  const r = applyStatus(a, req.body?.status, { source: 'api', base: baseUrl(req) });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ changed: r.changed, preapproval: shape(r.assignment) });
});

// An agent key can update the address (and price, when the loan officer allows it).
router.all('/preapprovals/:id', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (req.apiKind !== 'agent') return res.status(403).json({ error: 'Only agent keys can edit a pre-approval here.' });
  const a = owned(req);
  if (!a) return res.status(404).json({ error: 'Pre-approval not found' });
  const r = applyAgentEdit(a, req.body, { source: 'api', base: baseUrl(req) });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ preapproval: shape(r.assignment) });
});

router.post('/preapprovals/:id/refresh-request', onlyFor('agent'), (req, res) => {
  const a = owned(req);
  if (!a) return res.status(404).json({ error: 'Pre-approval not found' });
  const r = requestRefresh(a, { source: 'api', base: baseUrl(req) });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ preapproval: shape(r.assignment) });
});

router.get('/agents', onlyFor('user'), (req, res) => {
  res.json({ agents: buildRoster(req.user.id) });
});

router.post('/agents/invite', onlyFor('user'), async (req, res) => {
  const r = await inviteAgent(req.user, { email: req.body?.email, name: String(req.body?.name || '').trim() }, baseUrl(req));
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.status(201).json({ emailed: r.emailed, link: r.link });
});

// Anything else under /api/v1 is not an endpoint.
router.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default router;
