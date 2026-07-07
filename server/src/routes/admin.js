import { Router } from 'express';
import { getCounters, getUsers, publicUser, scenarioCount } from '../store.js';
import { requireAdmin } from '../auth.js';

const router = Router();

// Admin access is granted by a JWT with role=admin (see requireAdmin). There is no
// separate password endpoint — that would be a second, weaker credential path.

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
