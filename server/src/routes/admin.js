import { Router } from 'express';
import { getCounters, getUsers, publicUser, scenarioCount } from '../store.js';
import { requireAdmin } from '../auth.js';

const router = Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Optional standalone admin password gate (kept from the original app).
router.post('/login', (req, res) => {
  if ((req.body?.password || '') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }
  res.json({ ok: true });
});

router.get('/users', requireAdmin, (req, res) => {
  res.json({ users: getUsers().map(publicUser) });
});

router.get('/stats', requireAdmin, (req, res) => {
  const users = getUsers();
  const counters = getCounters();
  const scenariosSaved = users.reduce((sum, u) => sum + scenarioCount(u.id), 0);
  const activeToday = users.filter((u) => u.status === 'Active').length;

  // Real counts only — no fabricated baselines.
  const fmt = (n) => n.toLocaleString('en-US');
  res.json({
    stats: [
      { label: 'Total Users', value: fmt(users.length), delta: `${users.length} registered` },
      { label: 'Scenarios Saved', value: fmt(scenariosSaved), delta: 'across all users' },
      { label: 'Active Users', value: fmt(activeToday), delta: 'status: Active' },
      { label: 'Pre-Approvals', value: fmt(counters.preApprovals || 0), delta: 'generated to date' },
    ],
  });
});

export default router;
