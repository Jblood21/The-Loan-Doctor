import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getScenarios, setScenarios } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

const withId = (s) => ({ ...s, id: s.id || randomUUID() });

router.get('/', requireAuth, (req, res) => {
  res.json({ scenarios: getScenarios(req.user.id) });
});

// Replace the whole set (the Compare screen's "Save").
router.put('/', requireAuth, (req, res) => {
  const list = Array.isArray(req.body?.scenarios) ? req.body.scenarios.map(withId) : [];
  res.json({ scenarios: setScenarios(req.user.id, list) });
});

router.post('/', requireAuth, (req, res) => {
  const list = getScenarios(req.user.id);
  const scenario = withId(req.body || {});
  setScenarios(req.user.id, [...list, scenario]);
  res.status(201).json({ scenario });
});

router.put('/:id', requireAuth, (req, res) => {
  const list = getScenarios(req.user.id);
  const idx = list.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Scenario not found' });
  list[idx] = { ...list[idx], ...req.body, id: req.params.id };
  setScenarios(req.user.id, list);
  res.json({ scenario: list[idx] });
});

router.delete('/:id', requireAuth, (req, res) => {
  const list = getScenarios(req.user.id);
  setScenarios(
    req.user.id,
    list.filter((s) => s.id !== req.params.id),
  );
  res.status(204).end();
});

export default router;
