import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getScenarios, setScenarios, upsertScenarios } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Defensive server-side cap (the UI allows 6; this just stops API abuse from
// storing an unbounded blob). Non-object entries are dropped.
const MAX_SCENARIOS = 50;
const withId = (s) => ({ ...s, id: s.id || randomUUID() });
const sanitizeList = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
    .slice(0, MAX_SCENARIOS)
    .map(withId);

router.get('/', requireAuth, (req, res) => {
  res.json({ scenarios: getScenarios(req.user.id) });
});

// Merge the working scenarios into the bank by id (Compare's "Save"): existing ids are
// updated in place, new ones get an id. Returns the full bank plus the saved items (now
// with ids) so the client can reconcile. Registered before '/:id' so this path wins.
router.post('/upsert', requireAuth, (req, res) => {
  const saved = sanitizeList(req.body?.scenarios); // withId assigns ids to new ones
  const scenarios = upsertScenarios(req.user.id, saved);
  res.json({ scenarios, saved });
});

// Replace the whole set (the Compare screen's "Save").
router.put('/', requireAuth, (req, res) => {
  res.json({ scenarios: setScenarios(req.user.id, sanitizeList(req.body?.scenarios)) });
});

router.post('/', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid scenario' });
  const list = getScenarios(req.user.id);
  if (list.length >= MAX_SCENARIOS) return res.status(409).json({ error: 'Scenario limit reached' });
  const scenario = withId(body);
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
