// JWT helpers + auth middleware.

import jwt from 'jsonwebtoken';
import { findUserById, serverSecret } from './store.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2d';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, epoch: user.sessionEpoch || 0 },
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
