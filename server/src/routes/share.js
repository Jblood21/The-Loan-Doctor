import { Router } from 'express';
import { createShare, getShare } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

function baseUrl(req) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return base.replace(/\/$/, '');
}

// Create a read-only shareable quote snapshot (authed).
router.post('/', requireAuth, (req, res) => {
  const body = req.body || {};
  const snapshot = {
    title: String(body.title || 'Loan Comparison').slice(0, 120),
    borrowerName: String(body.borrowerName || '').slice(0, 120),
    names: Array.isArray(body.names) ? body.names.slice(0, 6).map((n) => String(n).slice(0, 60)) : [],
    metrics: Array.isArray(body.metrics) ? body.metrics.slice(0, 40) : [],
    bestIndex: Number.isInteger(body.bestIndex) ? body.bestIndex : -1,
    lender: body.lender && typeof body.lender === 'object' && !Array.isArray(body.lender) ? body.lender : {},
  };
  if (!snapshot.names.length || !snapshot.metrics.length) return res.status(400).json({ error: 'Nothing to share' });
  const id = createShare(req.user.id, snapshot);
  res.status(201).json({ id, url: `${baseUrl(req)}/q/${id}` });
});

// Public read — the borrower opens the link, no login required.
router.get('/:id', (req, res) => {
  const share = getShare(req.params.id);
  if (!share) return res.status(404).json({ error: 'This quote link is no longer available.' });
  // Strip the owning user id before returning.
  const { userId, ...pub } = share;
  void userId;
  res.json({ share: pub });
});

export default router;
