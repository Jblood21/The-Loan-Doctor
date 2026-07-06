import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(__dirname, '..', 'assets', 'letterhead-logo.jpg');

const GREEN = '#1f3d25';
const GOLD = '#b18f3f';
const LEFT = 48;
const RIGHT = 564;
const PAGE_W = 612;

/** Branded side-by-side loan comparison sheet a borrower can keep. */
router.post('/pdf', requireAuth, (req, res) => {
  const {
    title = 'Loan Comparison',
    borrowerName = '',
    date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    names = [],
    metrics = [],
    bestIndex = -1,
    lender = {},
    logo = null,
  } = req.body || {};

  const cols = Math.max(1, Math.min(6, names.length));
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 56, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="loan-comparison.pdf"');
  doc.pipe(res);

  // Letterhead
  let logoSource = fs.existsSync(LOGO) ? LOGO : null;
  if (typeof logo === 'string' && logo.startsWith('data:')) {
    const b64 = logo.split(',')[1];
    if (b64) try { logoSource = Buffer.from(b64, 'base64'); } catch { /* default */ }
  }
  try {
    if (logoSource) doc.image(logoSource, LEFT, 44, { height: 40 });
  } catch { /* logo optional */ }
  doc.moveTo(LEFT, 96).lineTo(RIGHT, 96).lineWidth(3).strokeColor(GOLD).stroke();

  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(17).text(title, LEFT, 112);
  doc.fillColor('#555').font('Helvetica').fontSize(10).text([borrowerName, date].filter(Boolean).join('  ·  '), LEFT, doc.y + 2);

  // Table geometry
  const labelW = 158;
  const colW = (RIGHT - LEFT - labelW) / cols;
  let y = doc.y + 18;

  const cellX = (i) => LEFT + labelW + i * colW;

  // Header row: scenario names
  doc.save();
  doc.rect(LEFT, y - 4, RIGHT - LEFT, 24).fill('#f4f6f9');
  if (bestIndex >= 0 && bestIndex < cols) doc.rect(cellX(bestIndex), y - 4, colW, 24).fill('rgba(31,61,37,0.10)');
  doc.restore();
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9).text('SCENARIO', LEFT + 6, y, { width: labelW - 8 });
  names.slice(0, cols).forEach((n, i) => {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9).text(String(n), cellX(i) + 4, y, { width: colW - 8, align: 'right', lineBreak: false });
  });
  y += 24;

  // Metric rows
  metrics.forEach((m, ri) => {
    const rowH = 18;
    if (y + rowH > 720) {
      doc.addPage();
      y = 60;
    }
    if (ri % 2 === 0) {
      doc.save();
      doc.rect(LEFT, y - 3, RIGHT - LEFT, rowH).fill('#fafbfc');
      doc.restore();
    }
    doc.fillColor('#5b6b7b').font('Helvetica').fontSize(9.5).text(String(m.label), LEFT + 6, y, { width: labelW - 8, lineBreak: false });
    (m.values || []).slice(0, cols).forEach((v, i) => {
      const emphasize = i === bestIndex;
      doc.fillColor(emphasize ? GREEN : '#0c2238').font(emphasize ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
        .text(String(v), cellX(i) + 4, y, { width: colW - 8, align: 'right', lineBreak: false });
    });
    y += rowH;
  });

  // Footer
  const contact = [lender.name, lender.phone, lender.email, lender.nmls ? `NMLS# ${lender.nmls}` : ''].filter(Boolean).join('   ·   ');
  doc.moveTo(LEFT, 748).lineTo(RIGHT, 748).lineWidth(2).strokeColor(GOLD).stroke();
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(8.5).text(contact, LEFT, 754, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
  doc.fillColor('#888').font('Helvetica').fontSize(7.5).text(
    'Estimates only — not a commitment to lend. Rates, payments, and costs are subject to change and final underwriting.',
    LEFT, 766, { width: RIGHT - LEFT, align: 'center', lineBreak: false },
  );

  doc.end();
});

export default router;
