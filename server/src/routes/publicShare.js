// Public, token-gated pages an agent publishes for buyers/listing agents — no login.
// Two kinds: a pre-approval letter (rendered from its assignment) and a buyer-facing
// affordability snapshot. The token is unguessable; only what a buyer should see is
// returned (never borrower financials or internal ids).

import { Router } from 'express';
import { findAgentShareByToken, findAssignmentById, findAgentById, publicAgent } from '../store.js';
import { assignmentLetterPayload } from '../lib/assignmentLetter.js';
import { streamLetterPdf } from '../lib/letterPdfRender.js';

const router = Router();
const str = (v) => (v == null ? '' : String(v));

function shareView(share) {
  if (!share) return null;
  if (share.kind === 'letter') {
    const a = findAssignmentById(share.assignmentId);
    if (!a) return null;
    const letter = a.letter && typeof a.letter === 'object' ? a.letter : {};
    const officer = letter.officer && typeof letter.officer === 'object' ? letter.officer : {};
    const lender = letter.lender && typeof letter.lender === 'object' ? letter.lender : {};
    return {
      kind: 'letter',
      borrowerName: a.borrowerName || '',
      propertyAddress: a.propertyAddress || '',
      loanOfficer: { name: str(officer.name), title: str(officer.title), email: str(officer.email), phone: str(officer.phone), company: str(lender.name) },
      agent: publicAgent(findAgentById(share.agentId)),
      createdAt: share.createdAt,
    };
  }
  if (share.kind === 'afford') {
    return { kind: 'afford', agent: share.agent || {}, data: share.data || {}, createdAt: share.createdAt };
  }
  return null;
}

router.get('/:token', (req, res) => {
  const view = shareView(findAgentShareByToken(req.params.token));
  if (!view) return res.status(404).json({ error: 'This link is no longer available.' });
  res.json({ share: view });
});

// Letter PDF for a letter share — rebuilt from the assignment's current saved state.
router.get('/:token/pdf', (req, res) => {
  const share = findAgentShareByToken(req.params.token);
  if (!share || share.kind !== 'letter') return res.status(404).json({ error: 'Not found' });
  const a = findAssignmentById(share.assignmentId);
  if (!a) return res.status(404).json({ error: 'Not found' });
  streamLetterPdf(res, assignmentLetterPayload(a));
});

export default router;
