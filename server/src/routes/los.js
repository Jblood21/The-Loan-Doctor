import { Router } from 'express';
import { getLos, setLos } from '../store.js';
import { requireAuth } from '../auth.js';
import { ariveConfigured, ariveSearch } from '../los/arive.js';

const router = Router();

// Demo borrower pipeline used when a provider isn't configured with real API access.
const STUB = [
  { name: 'Michael & Laura Thompson', meta: 'Loan #LN-20471 · $425,000', address: '48 Birchwood Ln, Madison, WI 53703' },
  { name: 'Aisha Bennett', meta: 'Loan #LN-20493 · $310,000', address: '210 Cedar St, Austin, TX 78702' },
  { name: 'Robert & Diane Alvarez', meta: 'Loan #LN-20510 · $560,000', address: '12 Lakeshore Dr, Tampa, FL 33602' },
  { name: 'Kenji Watanabe', meta: 'Loan #LN-20528 · $389,000', address: '77 Maple Ct, Portland, OR 97214' },
  { name: 'Grace Mwangi', meta: 'Loan #LN-20544 · $612,000', address: '3 Highgate Rd, Atlanta, GA 30307' },
];

function stubSearch(q) {
  const query = String(q || '').trim().toLowerCase();
  return query ? STUB.filter((b) => b.name.toLowerCase().includes(query) || b.meta.toLowerCase().includes(query)) : STUB;
}

/** Whether a provider has real API access configured. */
function isLive(provider) {
  return provider === 'arive' && ariveConfigured();
}

router.post('/connect', requireAuth, async (req, res) => {
  const provider = req.body?.provider || 'arive';
  if (isLive(provider)) {
    // Validate the credentials by making a lightweight call.
    try {
      await ariveSearch('');
      setLos(req.user.id, provider, true);
      return res.json({ connected: true, provider, mode: 'live' });
    } catch (err) {
      return res.status(502).json({ error: `Could not reach ${provider}: ${err.message}` });
    }
  }
  setLos(req.user.id, provider, true);
  res.json({ connected: true, provider, mode: 'demo' });
});

router.post('/disconnect', requireAuth, (req, res) => {
  const provider = req.body?.provider || 'arive';
  setLos(req.user.id, provider, false);
  res.json({ connected: false, provider });
});

router.get('/borrowers', requireAuth, async (req, res) => {
  const provider = req.query.provider || 'arive';
  const connected = getLos(req.user.id)[provider];
  if (!connected) return res.status(409).json({ error: 'LOS provider not connected' });

  if (isLive(provider)) {
    try {
      const results = await ariveSearch(String(req.query.q || ''));
      return res.json({ results, mode: 'live' });
    } catch (err) {
      return res.status(502).json({ error: `${provider} API error: ${err.message}` });
    }
  }
  res.json({ results: stubSearch(req.query.q), mode: 'demo' });
});

export default router;
