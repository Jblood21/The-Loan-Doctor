// Authentication for /api/v1: a long-lived key made on the Integrations screen. A key can
// only reach /api/v1 — never the rest of the app — so a leaked key cannot change a password
// or read settings.

import { findAgentById, findApiKeyByRaw, findUserById, touchApiKey } from '../store.js';
import { entitlement } from '../billing/service.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireApiKey(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, bearer] = header.split(' ');
  const raw = String((scheme === 'Bearer' && bearer) || req.headers['x-api-key'] || '').trim();
  if (!raw) {
    return res.status(401).json({ error: 'Send your API key as "Authorization: Bearer <key>" (or an X-API-Key header).' });
  }
  const key = findApiKeyByRaw(raw);
  if (!key) return res.status(401).json({ error: 'That API key is not valid, or it was revoked.' });

  if (key.kind === 'user') {
    const user = findUserById(key.ownerId);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    // Same rule as the app: a lapsed plan can read but not change things.
    if (!READ_ONLY.has(req.method)) {
      const ent = entitlement(user);
      if (!ent.allowed) return res.status(402).json({ error: 'This account needs an active plan to make changes.', code: 'billing_required', reason: ent.lockedReason });
    }
    req.user = user;
  } else {
    const agent = findAgentById(key.ownerId);
    if (!agent) return res.status(401).json({ error: 'Account not found' });
    if (agent.status && agent.status !== 'Active') return res.status(403).json({ error: 'This account is inactive.' });
    req.agent = agent;
  }
  req.apiKey = key;
  req.apiKind = key.kind;
  touchApiKey(key);
  next();
}

/** Limit an endpoint to one kind of key. */
export const onlyFor = (kind) => (req, res, next) =>
  req.apiKind === kind ? next() : res.status(403).json({ error: kind === 'user' ? 'This endpoint is for loan officer keys.' : 'This endpoint is for agent keys.' });
