import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getScenarios, setScenarios, getSavedScenarios, addSavedScenario, deleteSavedScenario, SAVED_SCENARIO_LIMIT } from '../store.js';
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

// ---- saved-scenario library (find & reopen later) ----------------------
// Registered before the '/:id' routes so these fixed paths win.
router.get('/saved', requireAuth, (req, res) => {
  res.json({ saved: getSavedScenarios(req.user.id) });
});
router.post('/saved', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const scenario = body.scenario;
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    return res.status(400).json({ error: 'Invalid scenario' });
  }
  if (getSavedScenarios(req.user.id).length >= SAVED_SCENARIO_LIMIT) {
    return res.status(409).json({ error: `Saved-scenario limit reached (${SAVED_SCENARIO_LIMIT}). Delete a few to save more.` });
  }
  const name = String(body.name || scenario.name || 'Saved scenario').trim().slice(0, 80) || 'Saved scenario';
  const item = addSavedScenario(req.user.id, name, withId(scenario));
  res.status(201).json({ saved: item });
});
router.delete('/saved/:id', requireAuth, (req, res) => {
  deleteSavedScenario(req.user.id, req.params.id);
  res.status(204).end();
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
