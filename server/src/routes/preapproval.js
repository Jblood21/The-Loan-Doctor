import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { incPreApprovals } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.post('/pdf', requireAuth, (req, res) => {
  const {
    heading = 'Pre-Approval Letter',
    salutation,
    intro,
    blurb = '',
    validity,
    borrowerName = '—',
    propertyAddress = '',
    lender = {},
    officer = {},
    agent = null,
    type = 'Conventional',
    terms = [],
    expDate = '',
    today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  } = req.body || {};

  // Fall back to generic wording if the client didn't send the adaptive text.
  const introText =
    intro ||
    `Congratulations! Based on a review of your credit, income, and assets, you have been pre-approved for a ${type} mortgage loan${
      propertyAddress ? ` for the property at ${propertyAddress}` : ''
    } under the following terms:`;
  const salutationText = salutation || `Dear ${borrowerName},`;
  const validityText =
    validity || `This pre-approval is valid through ${expDate} and is subject to property appraisal, title review, and final underwriting verification.`;

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 64, bottom: 64, left: 64, right: 64 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${String(borrowerName).split(' ').pop() || 'letter'}.pdf"`);
  doc.pipe(res);

  const navy = '#0c2238';
  const muted = '#5b6b7b';
  const LEFT = 64;
  const RIGHT = 548;

  // Letterhead
  doc.fillColor(navy).fontSize(20).font('Helvetica-Bold').text(lender.name || 'ABC Mortgage');
  doc.moveDown(0.2);
  doc.fillColor(muted).fontSize(9).font('Helvetica');
  if (lender.address) doc.text(lender.address);
  doc.text(`${lender.phone || '(800) 555-1234'}  ·  NMLS #${lender.nmls || '123456'}`);
  doc.moveTo(LEFT, doc.y + 6).lineTo(RIGHT, doc.y + 6).strokeColor(navy).lineWidth(2).stroke();
  doc.moveDown(1.4);

  // Date + heading
  doc.fillColor(muted).fontSize(10).text(today);
  doc.moveDown(0.6);
  doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text(heading);
  doc.moveDown(0.8);

  // Body
  doc.fillColor('#1b2733').fontSize(11).font('Helvetica');
  doc.text(salutationText);
  doc.moveDown(0.6);
  doc.text(introText, { lineGap: 3 });
  doc.moveDown(0.8);

  // Terms table
  terms.forEach((row) => {
    const y = doc.y;
    doc.fillColor(muted).font('Helvetica').fontSize(11).text(row.label, LEFT + 8, y);
    doc.fillColor(navy).font('Helvetica-Bold').text(row.value, LEFT + 8, y, { width: RIGHT - LEFT - 16, align: 'right' });
    doc.moveDown(0.2);
    doc.strokeColor('#e3e8ee').lineWidth(0.5).moveTo(LEFT + 8, doc.y + 2).lineTo(RIGHT - 8, doc.y + 2).stroke();
    doc.moveDown(0.4);
  });
  doc.moveDown(0.8);

  if (blurb) {
    doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(blurb, { lineGap: 3 });
    doc.moveDown(0.6);
  }
  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(validityText, { lineGap: 3 });
  doc.moveDown(1.2);

  // Signature
  doc.text('Sincerely,');
  doc.moveDown(0.3);
  doc.fillColor(navy).font('Helvetica-Oblique').fontSize(14).text(officer.name || 'John Smith');
  doc.fillColor(muted).font('Helvetica').fontSize(10).text(`Loan Officer · NMLS #${officer.nmls || '123456'} · ${officer.company || lender.name || 'ABC Mortgage'}`);

  // Dual-branding block (loan officer + real-estate agent)
  if (agent && agent.name) {
    doc.moveDown(1.2);
    const top = doc.y;
    doc.strokeColor('#e3e8ee').lineWidth(0.5).moveTo(LEFT, top).lineTo(RIGHT, top).stroke();
    const colTop = top + 12;
    const col2 = 310;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9aa7b4').text('YOUR LOAN OFFICER', LEFT, colTop, { width: 230 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy).text(officer.name || 'John Smith', LEFT, colTop + 12, { width: 230 });
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`NMLS #${officer.nmls || '123456'} · ${officer.company || lender.name || ''}`, LEFT, colTop + 28, { width: 230 });
    if (officer.phone) doc.text(officer.phone, LEFT, colTop + 40, { width: 230 });

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9aa7b4').text('YOUR REAL ESTATE AGENT', col2, colTop, { width: 230 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(navy).text(agent.name, col2, colTop + 12, { width: 230 });
    if (agent.brokerage) doc.font('Helvetica').fontSize(9).fillColor(muted).text(agent.brokerage, col2, colTop + 28, { width: 230 });
    if (agent.phone) doc.font('Helvetica').fontSize(9).fillColor(muted).text(agent.phone, col2, colTop + 40, { width: 230 });
    doc.y = colTop + 58;
  }

  doc.moveDown(1.5);
  doc.font('Helvetica').fontSize(8).fillColor('#9aa7b4').text(
    'Equal Housing Lender. This is not a commitment to lend. All loans are subject to credit approval, verification of information, and satisfactory appraisal.',
    LEFT,
    doc.y,
    { lineGap: 2, width: RIGHT - LEFT },
  );

  doc.end();
  incPreApprovals();
});

export default router;
