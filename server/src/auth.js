// JWT helpers + auth middleware.

import jwt from 'jsonwebtoken';
import { findUserById, findAgentById, serverSecret } from './store.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2d';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, epoch: user.sessionEpoch || 0 },
    serverSecret(),
    { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
  );
}

/** Agent tokens carry kind:'agent' so they can never be used on loan-officer routes. */
export function signAgentToken(agent) {
  return jwt.sign(
    { sub: agent.id, email: agent.email, kind: 'agent', epoch: agent.sessionEpoch || 0 },
    serverSecret(),
    { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN },
  );
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, serverSecret(), { algorithms: ['HS256'] });
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    // Reject tokens issued before the user's last logout / password change.
    if ((payload.epoch || 0) !== (user.sessionEpoch || 0)) {
      return res.status(401).json({ error: 'Session expired — please sign in again.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

/** Authenticate a real-estate agent (kind:'agent' token). Kept separate from
 *  requireAuth so agent tokens can never reach loan-officer endpoints. */
export function requireAgent(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, serverSecret(), { algorithms: ['HS256'] });
    if (payload.kind !== 'agent') return res.status(401).json({ error: 'Invalid token' });
    const agent = findAgentById(payload.sub);
    if (!agent) return res.status(401).json({ error: 'Account not found' });
    if (agent.status && agent.status !== 'Active') return res.status(403).json({ error: 'This account is inactive.' });
    if ((payload.epoch || 0) !== (agent.sessionEpoch || 0)) {
      return res.status(401).json({ error: 'Session expired — please sign in again.' });
    }
    req.agent = agent;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
