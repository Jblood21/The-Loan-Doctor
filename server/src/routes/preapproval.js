import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { incPreApprovals } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.post('/pdf', requireAuth, (req, res) => {
  const {
    borrowerName = '—',
    propertyAddress = '',
    lender = {},
    officer = {},
    type = 'Conventional',
    terms = [],
    expDate = '',
    today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  } = req.body || {};

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 64, bottom: 64, left: 64, right: 64 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${String(borrowerName).split(' ').pop() || 'letter'}.pdf"`);
  doc.pipe(res);

  const navy = '#0c2238';
  const muted = '#5b6b7b';

  // Letterhead
  doc.fillColor(navy).fontSize(20).font('Helvetica-Bold').text(lender.name || 'ABC Mortgage');
  doc.moveDown(0.2);
  doc.fillColor(muted).fontSize(9).font('Helvetica');
  if (lender.address) doc.text(lender.address);
  doc.text(`${lender.phone || '(800) 555-1234'}  ·  NMLS #${lender.nmls || '123456'}`);
  doc.moveTo(64, doc.y + 6).lineTo(548, doc.y + 6).strokeColor(navy).lineWidth(2).stroke();
  doc.moveDown(1.4);

  // Date + title
  doc.fillColor(muted).fontSize(10).text(today);
  doc.moveDown(0.6);
  doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text('Pre-Approval Letter');
  doc.moveDown(0.8);

  // Body
  doc.fillColor('#1b2733').fontSize(11).font('Helvetica');
  doc.text(`Dear ${borrowerName},`);
  doc.moveDown(0.6);
  doc.text(
    `Congratulations! Based on a review of your credit, income, and assets, you have been pre-approved for a ${type} mortgage loan${
      propertyAddress ? ` for the property at ${propertyAddress}` : ''
    } under the following terms:`,
    { lineGap: 3 },
  );
  doc.moveDown(0.8);

  // Terms table
  const left = 72;
  const right = 540;
  terms.forEach((row) => {
    const y = doc.y;
    doc.fillColor(muted).font('Helvetica').fontSize(11).text(row.label, left, y);
    doc.fillColor(navy).font('Helvetica-Bold').text(row.value, left, y, { width: right - left, align: 'right' });
    doc.moveDown(0.2);
    doc.strokeColor('#e3e8ee').lineWidth(0.5).moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).stroke();
    doc.moveDown(0.4);
  });

  doc.moveDown(0.8);
  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(
    `This pre-approval is valid through ${expDate} and is subject to property appraisal, title review, and final underwriting verification.`,
    { lineGap: 3 },
  );
  doc.moveDown(1.2);

  // Signature
  doc.text('Sincerely,');
  doc.moveDown(0.3);
  doc.fillColor(navy).font('Helvetica-Oblique').fontSize(14).text(officer.name || 'John Smith');
  doc.fillColor(muted).font('Helvetica').fontSize(10).text(`Loan Officer · NMLS #${officer.nmls || '123456'} · ${officer.company || lender.name || 'ABC Mortgage'}`);

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#9aa7b4').text(
    'Equal Housing Lender. This is not a commitment to lend. All loans are subject to credit approval, verification of information, and satisfactory appraisal.',
    { lineGap: 2 },
  );

  doc.end();
  incPreApprovals();
});

export default router;
