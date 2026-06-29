import { Router } from 'express';
import { getSettings, setSettings } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json({ settings: getSettings(req.user.id) || {} });
});

router.put('/', requireAuth, (req, res) => {
  const patch = req.body || {};
  delete patch.id;
  res.json({ settings: setSettings(req.user.id, patch) });
});

export default router;
