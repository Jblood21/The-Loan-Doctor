import { Router } from 'express';
import { getSettings, setSettings } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Only these keys can be written — anything else in the body is ignored, so the
// settings blob can't be used to smuggle arbitrary data into the store.
const ALLOWED = new Set([
  'name', 'company', 'phone', 'nmls', 'email', 'officerTitle', 'logoDataUrl', 'signatureDataUrl',
  'lenderName', 'lenderNmls', 'website', 'lenderAddress', 'lenderPhone',
  'agentName', 'brokerage', 'agentPhone',
  'titleCompany', 'titleFeesPct', 'titleAgentName', 'feeDefaults', 'darkMode',
]);

router.get('/', requireAuth, (req, res) => {
  res.json({ settings: getSettings(req.user.id) || {} });
});

router.put('/', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const patch = {};
  for (const key of Object.keys(body)) if (ALLOWED.has(key)) patch[key] = body[key];
  res.json({ settings: setSettings(req.user.id, patch) });
});

export default router;
