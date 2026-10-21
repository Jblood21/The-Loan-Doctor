// Request guard for the paid workspace. Reading your own data always works; anything
// that creates or changes things (saving scenarios, making PDFs/links/letters, the AI
// assistant) needs an active plan. A person whose trial ended keeps their data and can
// still sign in, download it, and subscribe.

import { requireAuth } from '../auth.js';
import { entitlement } from './service.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

const LOCKED_MESSAGE = {
  trial_ended: 'Your free trial has ended. Choose a plan to keep creating — your data is safe.',
  canceled: 'Your subscription has ended. Choose a plan to keep creating — your data is safe.',
  comp_ended: 'Your free access has ended. Choose a plan to keep creating — your data is safe.',
};

export function requireAccess(req, res, next) {
  requireAuth(req, res, () => {
    if (READ_ONLY.has(req.method)) return next();
    const ent = entitlement(req.user);
    if (ent.allowed) {
      req.entitlement = ent;
      return next();
    }
    res.status(402).json({
      error: LOCKED_MESSAGE[ent.lockedReason] || LOCKED_MESSAGE.trial_ended,
      code: 'billing_required',
      reason: ent.lockedReason,
    });
  });
}
