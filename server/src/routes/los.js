import { Router } from 'express';
import { getLos, setLos } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Stubbed borrower pipeline — replace with real per-provider LOS API calls.
const BORROWERS = [
  { name: 'Michael & Laura Thompson', meta: 'Loan #LN-20471 · $425,000', address: '48 Birchwood Ln, Madison, WI 53703' },
  { name: 'Aisha Bennett', meta: 'Loan #LN-20493 · $310,000', address: '210 Cedar St, Austin, TX 78702' },
  { name: 'Robert & Diane Alvarez', meta: 'Loan #LN-20510 · $560,000', address: '12 Lakeshore Dr, Tampa, FL 33602' },
  { name: 'Kenji Watanabe', meta: 'Loan #LN-20528 · $389,000', address: '77 Maple Ct, Portland, OR 97214' },
  { name: 'Grace Mwangi', meta: 'Loan #LN-20544 · $612,000', address: '3 Highgate Rd, Atlanta, GA 30307' },
];

router.post('/connect', requireAuth, (req, res) => {
  const provider = req.body?.provider || 'arive';
  setLos(req.user.id, provider, true);
  res.json({ connected: true, provider });
});

router.post('/disconnect', requireAuth, (req, res) => {
  const provider = req.body?.provider || 'arive';
  setLos(req.user.id, provider, false);
  res.json({ connected: false, provider });
});

router.get('/borrowers', requireAuth, (req, res) => {
  const provider = req.query.provider || 'arive';
  const connected = getLos(req.user.id)[provider];
  if (!connected) return res.status(409).json({ error: 'LOS provider not connected' });
  const q = String(req.query.q || '').trim().toLowerCase();
  const results = q
    ? BORROWERS.filter((b) => b.name.toLowerCase().includes(q) || b.meta.toLowerCase().includes(q))
    : BORROWERS;
  res.json({ results });
});

export default router;
