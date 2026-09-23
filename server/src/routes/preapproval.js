import { Router } from 'express';
import {
  incPreApprovals,
  addPreApproval,
  getPreApprovals,
  addAssignment,
  getAssignmentsByOwner,
  findAssignmentById,
  updateAssignment,
  deleteAssignment,
} from '../store.js';
import { requireAuth } from '../auth.js';
import { streamLetterPdf } from '../lib/letterPdfRender.js';
import { cappedPrice } from '../lib/assignmentLetter.js';

const router = Router();
const str = (v, fallback = '') => (v == null ? fallback : String(v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keep only the keys the letter renderer understands, so an assignment never stores
// arbitrary caller data. streamLetterPdf re-coerces each field, so loose typing is safe.
const LETTER_KEYS = ['style', 'showHeadshot', 'date', 'title', 'reLine', 'salutation', 'paragraphs', 'terms', 'validity', 'closing', 'officer', 'lender', 'agentAck', 'logo', 'headshot', 'signature'];
const CTX_KEYS = ['p1Template', 'priceLabel', 'downLabel', 'loanAmount', 'showSubjectAddress', 'isRefi'];
function pick(src, keys) {
  const out = {};
  const o = src && typeof src === 'object' ? src : {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/** What the loan officer and the agent both see about an assignment (no internals). */
export function publicAssignment(a) {
  return {
    id: a.id,
    ownerName: a.ownerName || '',
    agentEmail: a.agentEmail,
    borrowerName: a.borrowerName || '',
    propertyAddress: a.propertyAddress || '',
    price: a.price || 0,
    approvedPrice: a.approvedPrice || 0,
    allowPriceChange: !!a.allowPriceChange,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    editedByAgentAt: a.editedByAgentAt || null,
  };
}

router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  streamLetterPdf(res, body);
  incPreApprovals();

  // Record the issued pre-approval so it shows in the history, tied to the borrower.
  const loan = body.loan && typeof body.loan === 'object' ? body.loan : {};
  addPreApproval(req.user.id, {
    borrowerName: str(body.borrowerName, '—'),
    propertyAddress: str(body.subjectAddress) || str(loan.propertyAddress),
    loanType: str(loan.loanType),
    transaction: str(loan.transaction),
    price: num(loan.price),
    loanAmount: num(loan.loanAmount),
    downPayment: num(loan.downPayment),
    rate: num(loan.rate),
    term: str(loan.term),
    monthlyPayment: num(loan.monthlyPayment),
    apr: num(loan.apr),
    reLine: str(body.reLine, 'Pre-Approval'),
    validityDays: num(loan.validityDays),
    kind: str(loan.kind),
    creditScore: str(loan.creditScore),
  });
});

// Issued-pre-approval history for the signed-in loan officer (newest first).
router.get('/history', requireAuth, (req, res) => {
  res.json({ history: getPreApprovals(req.user.id) });
});

// ---- Agent assignments (loan-officer side) -----------------------------
// List the assignments this loan officer created.
router.get('/assignments', requireAuth, (req, res) => {
  res.json({ assignments: getAssignmentsByOwner(req.user.id).map(publicAssignment) });
});

// Create an assignment from an already-built letter (the client sends the letter
// snapshot + a small ctx used to regenerate the address/price-dependent parts).
router.post('/assignments', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const agentEmail = String(body.agentEmail || '').trim().toLowerCase();
  const propertyAddress = String(body.propertyAddress || '').trim();
  if (!EMAIL_RE.test(agentEmail)) return res.status(400).json({ error: 'A valid agent email is required' });
  if (!propertyAddress) return res.status(400).json({ error: 'A property address is required' });

  const approvedPrice = Math.max(0, num(body.approvedPrice));
  const allowPriceChange = !!body.allowPriceChange;
  // The starting price can't exceed the approved ceiling.
  const price = cappedPrice(num(body.price) || approvedPrice, approvedPrice);

  const assignment = addAssignment({
    ownerId: req.user.id,
    ownerName: req.user.name || '',
    agentEmail,
    borrowerName: String(body.borrowerName || '').slice(0, 200),
    propertyAddress: propertyAddress.slice(0, 300),
    approvedPrice,
    price,
    allowPriceChange,
    letter: pick(body.letter, LETTER_KEYS),
    ctx: pick(body.ctx, CTX_KEYS),
  });
  res.status(201).json({ assignment: publicAssignment(assignment) });
});

// Loan officer updates the terms they control (agent email, address, price ceiling,
// current price, permission toggle). Never lets price exceed the approved ceiling.
router.patch('/assignments/:id', requireAuth, (req, res) => {
  const a = findAssignmentById(req.params.id);
  if (!a || a.ownerId !== req.user.id) return res.status(404).json({ error: 'Assignment not found' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const patch = {};
  if (body.agentEmail !== undefined) {
    const e = String(body.agentEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'A valid agent email is required' });
    patch.agentEmail = e;
  }
  if (body.propertyAddress !== undefined) patch.propertyAddress = String(body.propertyAddress || '').trim().slice(0, 300);
  if (body.allowPriceChange !== undefined) patch.allowPriceChange = !!body.allowPriceChange;
  if (body.approvedPrice !== undefined) patch.approvedPrice = Math.max(0, num(body.approvedPrice));
  // Re-clamp the current price against whichever ceiling ends up applying.
  const nextApproved = patch.approvedPrice !== undefined ? patch.approvedPrice : a.approvedPrice;
  if (body.price !== undefined) patch.price = cappedPrice(num(body.price), nextApproved);
  else if (patch.approvedPrice !== undefined) patch.price = cappedPrice(a.price, nextApproved);

  res.json({ assignment: publicAssignment(updateAssignment(a.id, patch)) });
});

router.delete('/assignments/:id', requireAuth, (req, res) => {
  const a = findAssignmentById(req.params.id);
  if (!a || a.ownerId !== req.user.id) return res.status(404).json({ error: 'Assignment not found' });
  deleteAssignment(a.id);
  res.json({ ok: true });
});

export default router;
