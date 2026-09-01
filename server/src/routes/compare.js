import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(__dirname, '..', 'assets', 'letterhead-logo.jpg');

// Summit Home Loans palette.
const NAVY = '#13355f'; // headings, table header band, bold labels
const NAVY_DK = '#0b2547'; // deepest navy (logo-adjacent)
const STRIP = '#f4f6f9'; // assumption strip / soft fills
const STRIPE = '#f8fafc'; // zebra row
const HILITE = '#e8eef7'; // estimated-monthly highlight row
const CARD_BG = '#f5f8fc';
const CARD_BORDER = '#d9e2ee';
const RULE = '#e3e8ee';
const LABEL = '#5b6b7b';
const VALUE = '#1f2d3d';
const MUTED = '#8b98a6';

const PAGE_W = 612;
const LEFT = 40;
const RIGHT = 572;

const str = (v, fallback = '') => (v == null ? fallback : String(v));

/** Branded "Home Financing Comparison" sheet a borrower can keep. */
router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  const title = str(body.title, 'Home Financing Comparison').slice(0, 120);
  const borrowerName = str(body.borrowerName).slice(0, 120);
  const programLabel = str(body.programLabel).slice(0, 90);
  const subLine = str(body.subLine).slice(0, 120);
  const rate = str(body.rate).slice(0, 24);
  const date =
    typeof body.date === 'string'
      ? body.date.slice(0, 60)
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const logo = body.logo ?? null;
  const lender = obj(body.lender);
  const assumptions = obj(body.assumptions);
  const insights = obj(body.insights);

  // Per-column loan data — coerce every field to a safe string up front so a malformed
  // payload fails as a clean 400, never as a corrupt half-streamed PDF.
  const columns = (Array.isArray(body.columns) ? body.columns : []).slice(0, 6).map((c) => {
    const o = obj(c);
    return {
      priceLabel: str(o.priceLabel),
      downLabel: str(o.downLabel),
      head1: str(o.head1) || str(o.priceLabel),
      head2: str(o.head2) || str(o.downLabel),
      cardLabel: str(o.cardLabel) || `${str(o.priceLabel)} · ${str(o.downLabel)}`,
      downPayment: str(o.downPayment),
      loanAmount: str(o.loanAmount),
      rate: str(o.rate),
      apr: str(o.apr),
      pi: str(o.pi),
      mi: str(o.mi),
      taxes: str(o.taxes),
      insurance: str(o.insurance),
      hoa: str(o.hoa),
      totalMonthly: str(o.totalMonthly),
      closing: str(o.closing),
      credits: str(o.credits),
      cashToClose: str(o.cashToClose),
    };
  });

  if (!columns.length) {
    return res.status(400).json({ error: 'Nothing to render — provide at least one scenario column.' });
  }

  const cols = columns.length;
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  const safeLast = (borrowerName.trim().split(/\s+/).pop() || '').replace(/[^A-Za-z0-9_-]/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="home-financing-comparison${safeLast ? '-' + safeLast : ''}.pdf"`);
  doc.pipe(res);

  // Column geometry (label column + N equal value columns). Tighten for 5–6 columns.
  const dense = cols >= 5;
  const labelW = dense ? 116 : 132;
  const colW = (RIGHT - LEFT - labelW) / cols;
  const colX = (i) => LEFT + labelW + i * colW;
  const F = dense ? 0.86 : 1; // font scale for dense layouts
  const centerCol = (text, i, y, { font = 'Helvetica', size = 9.5, color = VALUE } = {}) =>
    doc.fillColor(color).font(font).fontSize(size * F).text(text, colX(i), y, { width: colW, align: 'center', lineBreak: false });

  // --- Letterhead ---
  let logoSource = fs.existsSync(LOGO) ? LOGO : null;
  if (typeof logo === 'string' && logo.startsWith('data:')) {
    const b64 = logo.split(',')[1];
    if (b64) try { logoSource = Buffer.from(b64, 'base64'); } catch { /* default */ }
  }
  const LOGO_W = 150;
  try {
    if (logoSource) {
      const img = doc.openImage(logoSource);
      const h = Math.min(64, (LOGO_W * img.height) / img.width);
      doc.image(logoSource, LEFT, 40, { fit: [LOGO_W, 64] });
      if (lender.nmls) doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text(`NMLS ${str(lender.nmls)}`, LEFT, 40 + h + 6, { width: LOGO_W, align: 'center', lineBreak: false });
    }
  } catch { /* logo optional */ }

  const HX = LEFT + LOGO_W + 14;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(21).text(title.toUpperCase(), HX, 44, { width: RIGHT - HX, lineBreak: false });
  if (borrowerName) doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Prepared for ${borrowerName}`, HX, 72, { width: RIGHT - HX, lineBreak: false });

  // Program + rate box
  const boxY = 92;
  doc.save();
  doc.roundedRect(HX, boxY, RIGHT - HX, 40, 6).fill(STRIP);
  doc.restore();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(programLabel || 'Loan Comparison', HX + 14, boxY + 8, { width: RIGHT - HX - 120, lineBreak: false });
  if (subLine) doc.fillColor(LABEL).font('Helvetica').fontSize(9).text(subLine, HX + 14, boxY + 23, { width: RIGHT - HX - 120, lineBreak: false });
  if (rate) {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('RATE', RIGHT - 96, boxY + 8, { width: 82, align: 'right', lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(rate, RIGHT - 96, boxY + 18, { width: 82, align: 'right', lineBreak: false });
  }

  let y = 148;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(2).strokeColor(NAVY).stroke();
  y += 12;

  const heading = (text) => {
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12.5).text(text.toUpperCase(), LEFT, y, { width: RIGHT - LEFT, align: 'center' });
    y += 22;
  };

  // --- LOAN ASSUMPTIONS strip ---
  heading('Loan Assumptions');
  const aItems = [
    ['PURCHASE OPTIONS', str(assumptions.purchaseOptions, '—')],
    ['DOWN PAYMENT', str(assumptions.downPayment, '—')],
    ['HOMEOWNERS INS.', str(assumptions.insurance, '—')],
    ['PROPERTY TAXES', str(assumptions.taxes, '—')],
    ['HOA', str(assumptions.hoa, '—')],
  ];
  const stripH = 40;
  doc.save();
  doc.roundedRect(LEFT, y, RIGHT - LEFT, stripH, 6).fill(STRIP);
  doc.restore();
  const aW = (RIGHT - LEFT) / aItems.length;
  aItems.forEach(([k, v], i) => {
    const ax = LEFT + i * aW;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5).text(k, ax + 4, y + 9, { width: aW - 8, align: 'center', lineBreak: false });
    doc.fillColor(VALUE).font('Helvetica').fontSize(9).text(v, ax + 4, y + 22, { width: aW - 8, align: 'center', lineBreak: false });
    if (i > 0) doc.moveTo(ax, y + 8).lineTo(ax, y + stripH - 8).lineWidth(0.5).strokeColor('#dbe2ea').stroke();
  });
  y += stripH + 16;

  // --- MONTHLY PAYMENT COMPARISON table ---
  heading('Monthly Payment Comparison');

  // Header band (navy)
  const headH = 30;
  doc.save();
  doc.roundedRect(LEFT, y, RIGHT - LEFT, headH, 4).fill(NAVY);
  doc.restore();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('LOAN DETAILS', LEFT + 10, y + 11, { width: labelW - 12, lineBreak: false });
  columns.forEach((c, i) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11 * F).text(c.head1, colX(i), y + 5, { width: colW, align: 'center', lineBreak: false });
    doc.fillColor('#c7d4e6').font('Helvetica-Bold').fontSize(7 * F).text(c.head2, colX(i), y + 19, { width: colW, align: 'center', lineBreak: false });
  });
  y += headH;

  const rowH = 20;
  const rows = [
    { label: 'Down Payment', key: 'downPayment' },
    { label: 'Loan Amount', key: 'loanAmount' },
    { label: 'Interest Rate', key: 'rate', boldLabel: true },
    { label: 'APR (Estimated)', key: 'apr', boldLabel: true },
    { label: 'Principal & Interest', key: 'pi' },
    { label: 'Mortgage Insurance', key: 'mi' },
    { label: 'Property Taxes', key: 'taxes' },
    { label: 'Homeowners Insurance', key: 'insurance' },
    { label: 'HOA', key: 'hoa' },
  ];
  rows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      doc.save();
      doc.rect(LEFT, y, RIGHT - LEFT, rowH).fill(STRIPE);
      doc.restore();
    }
    doc.fillColor(row.boldLabel ? NAVY : '#33414f').font(row.boldLabel ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => centerCol(c[row.key] || '—', i, y + 6, { size: 9.5 }));
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });

  // Estimated monthly payment (highlight)
  const emH = 28;
  doc.save();
  doc.rect(LEFT, y, RIGHT - LEFT, emH).fill(HILITE);
  doc.restore();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(dense ? 8 : 9).text('ESTIMATED MONTHLY PAYMENT', LEFT + 10, y + 10, { width: labelW - 8, lineBreak: false });
  columns.forEach((c, i) => centerCol(c.totalMonthly, i, y + 7, { font: 'Helvetica-Bold', size: 13, color: NAVY }));
  y += emH + 18;

  // --- ESTIMATED CASH TO CLOSE ---
  heading('Estimated Cash to Close');
  const cardH = 42;
  const cardGap = 8;
  const cardW = (RIGHT - LEFT - cardGap * (cols - 1)) / cols;
  columns.forEach((c, i) => {
    const cx = LEFT + i * (cardW + cardGap);
    doc.save();
    doc.roundedRect(cx, y, cardW, cardH, 6).fill(CARD_BG);
    doc.roundedRect(cx, y, cardW, cardH, 6).lineWidth(1).strokeColor(CARD_BORDER).stroke();
    doc.restore();
    doc.fillColor(LABEL).font('Helvetica-Bold').fontSize(7 * F).text(c.cardLabel, cx + 4, y + 8, { width: cardW - 8, align: 'center', lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14 * F).text(c.cashToClose, cx + 4, y + 20, { width: cardW - 8, align: 'center', lineBreak: false });
  });
  y += cardH + 12;

  // Cash-to-close breakdown table
  const cRows = [
    { label: 'Down Payment', key: 'downPayment' },
    { label: 'Closing Costs (Est.)', key: 'closing' },
    { label: 'Credits Applied', key: 'credits' },
  ];
  cRows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      doc.save();
      doc.rect(LEFT, y, RIGHT - LEFT, rowH).fill(STRIPE);
      doc.restore();
    }
    doc.fillColor('#33414f').font('Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => centerCol(c[row.key] || '—', i, y + 6, { size: 9.5 }));
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });
  y += 16;

  // --- Insight boxes ---
  const diffs = (Array.isArray(insights.paymentDiff) ? insights.paymentDiff : []).slice(0, 4).map((s) => str(s));
  const takeaway = str(insights.keyTakeaway);
  if (diffs.length || takeaway) {
    const halfW = (RIGHT - LEFT - 16) / 2;
    const boxTop = y;
    const boxH = 56;
    // Payment difference
    if (diffs.length) {
      doc.save();
      doc.roundedRect(LEFT, boxTop, halfW, boxH, 6).fill(STRIP);
      doc.restore();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('PAYMENT DIFFERENCE', LEFT + 12, boxTop + 9, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(8.5).text(diffs.join('\n'), LEFT + 12, boxTop + 22, { width: halfW - 24, lineGap: 1.5 });
    }
    // Key takeaway
    if (takeaway) {
      const rx = LEFT + halfW + 16;
      doc.save();
      doc.roundedRect(rx, boxTop, halfW, boxH, 6).fill(STRIP);
      doc.restore();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('KEY TAKEAWAY', rx + 12, boxTop + 9, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(8.5).text(takeaway, rx + 12, boxTop + 22, { width: halfW - 24, lineGap: 1.5 });
    }
    y = boxTop + boxH + 14;
  }

  // --- Disclaimer + footer ---
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(
    'Rates, APRs, costs and payments may change until locked. This is not a commitment to lend. Get an official Loan Estimate before choosing a loan.',
    LEFT, Math.min(y, 726), { width: RIGHT - LEFT, lineBreak: false },
  );

  const footY = 748;
  doc.page.margins.bottom = 0; // keep the footer on page 1 (it sits below the text margin)
  doc.moveTo(LEFT, footY).lineTo(RIGHT, footY).lineWidth(1).strokeColor(NAVY).stroke();
  const officer = [
    str(lender.officer),
    lender.officerNmls ? `NMLS ${str(lender.officerNmls)}` : '',
    str(lender.name),
    lender.nmls ? `Company NMLS ${str(lender.nmls)}` : '',
  ].filter(Boolean).join('  |  ');
  doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(officer, LEFT, footY + 8, { width: RIGHT - LEFT - 160, lineBreak: false });
  const right = [str(lender.phone), str(lender.website)].filter(Boolean).join('  |  ');
  doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(right, RIGHT - 200, footY + 8, { width: 200, align: 'right', lineBreak: false });

  doc.end();
});

export default router;
