// Real-estate agent portal API — a separate login surface from loan-officer users.
// Agents sign up with name / phone / email + password, then see and lightly edit the
// pre-approvals a loan officer has assigned to their email.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  addAgent,
  findAgentByEmail,
  findAgentById,
  publicAgent,
  normalizeEmail,
  getAssignmentsByAgentEmail,
  findAssignmentById,
  updateAssignment,
} from '../store.js';
import { requireAgent, signAgentToken } from '../auth.js';
import { streamLetterPdf } from '../lib/letterPdfRender.js';
import { assignmentLetterPayload, cappedPrice } from '../lib/assignmentLetter.js';
import { publicAssignment } from './preapproval.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Open registration — agents self-serve, exactly like loan officers. Set
// ALLOW_SIGNUP=false to close both surfaces for abuse.
const SIGNUPS_OPEN = process.env.ALLOW_SIGNUP !== 'false';

router.post('/auth/register', (req, res) => {
  const { password, name = '', phone = '' } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!SIGNUPS_OPEN) return res.status(403).json({ error: 'Sign-up is temporarily closed. Please try again later.' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (findAgentByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

  const agent = addAgent({ email, password, name: String(name).slice(0, 120), phone: String(phone).slice(0, 40) });
  res.status(201).json({ token: signAgentToken(agent), agent: publicAgent(agent) });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const agent = findAgentByEmail(email);
  if (!agent || !bcrypt.compareSync(password || '', agent.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (agent.status && agent.status !== 'Active') return res.status(403).json({ error: 'This account is inactive.' });
  res.json({ token: signAgentToken(agent), agent: publicAgent(agent) });
});

router.get('/auth/me', requireAgent, (req, res) => {
  res.json({ agent: publicAgent(req.agent) });
});

// The agent sees only pre-approvals assigned to their email.
router.get('/assignments', requireAgent, (req, res) => {
  res.json({ assignments: getAssignmentsByAgentEmail(req.agent.email).map(publicAssignment) });
});

/** Load an assignment and confirm it belongs to this agent, else 404. */
function ownedAssignment(req) {
  const a = findAssignmentById(req.params.id);
  if (!a || a.agentEmail !== req.agent.email) return null;
  return a;
}

router.get('/assignments/:id', requireAgent, (req, res) => {
  const a = ownedAssignment(req);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  res.json({ assignment: publicAssignment(a) });
});

// Agent edits: the property address always; the price only when the loan officer
// enabled it, and never above the approved ceiling.
router.patch('/assignments/:id', requireAgent, (req, res) => {
  const a = ownedAssignment(req);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const patch = { editedByAgentAt: new Date().toISOString() };
  if (body.propertyAddress !== undefined) {
    const addr = String(body.propertyAddress || '').trim();
    if (!addr) return res.status(400).json({ error: 'A property address is required' });
    patch.propertyAddress = addr.slice(0, 300);
  }
  if (body.price !== undefined) {
    if (!a.allowPriceChange) return res.status(403).json({ error: 'Price changes are not enabled for this pre-approval.' });
    patch.price = cappedPrice(body.price, a.approvedPrice);
  }
  res.json({ assignment: publicAssignment(updateAssignment(a.id, patch)) });
});

// Render the assignment's letter (server rebuilds it from the stored snapshot + the
// agent's saved address/price — the agent can never alter loan terms or branding).
router.post('/assignments/:id/pdf', requireAgent, (req, res) => {
  const a = ownedAssignment(req);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  streamLetterPdf(res, assignmentLetterPayload(a));
});

export default router;
