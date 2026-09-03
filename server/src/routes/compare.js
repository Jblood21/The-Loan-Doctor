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
const NAVY = '#13355f';
const NAVY_DK = '#0b2547';
const STRIP = '#f4f6f9';
const STRIPE = '#f8fafc';
const HILITE = '#e8f5ee'; // green-tinted highlight for the payment / cash-to-close rows
const CARD_BG = '#f5f8fc';
const CARD_BORDER = '#d9e2ee';
const RULE = '#e3e8ee';
const LABEL = '#5b6b7b';
const VALUE = '#1f2d3d';
const MUTED = '#8b98a6';
const GO = '#0f9d58'; // bright "go" green — rate, monthly payment, cash to close

const PAGE_H = 792;
const LEFT = 40;
const RIGHT = 572;
const FOOT_Y = 752;
const BOTTOM = 724;
const TOP_CONT = 48;

const str = (v, f = '') => (v == null ? f : String(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

/** Draw the whole comparison onto a bufferPages document. Content only. */
export function renderComparisonPdf(doc, d) {
  const { title, borrowerName, propertyAddress, date, logoSource, programLabel, subLine, rate, assumptions, insights, model, legacy } = d;
  const columns = model.columns;
  const cols = columns.length;

  const dense = cols >= 5;
  const labelW = dense ? 128 : 150;
  const colW = (RIGHT - LEFT - labelW) / cols;
  const colX = (i) => LEFT + labelW + i * colW;
  const F = cols >= 5 ? 0.82 : cols === 4 ? 0.92 : 1;
  const centerCol = (text, i, yy, { font = 'Helvetica', size = 9.5, color = VALUE } = {}) =>
    doc.fillColor(color).font(font).fontSize(size * F).text(text, colX(i) + 2, yy, { width: colW - 4, align: 'center', lineBreak: false });

  // ---- Letterhead ----
  const LOGO_W = 150;
  let logoBottom = 40;
  try {
    if (logoSource) {
      const img = doc.openImage(logoSource);
      const h = Math.min(64, (LOGO_W * img.height) / img.width);
      doc.image(logoSource, LEFT, 40, { fit: [LOGO_W, 64] });
      logoBottom = 40 + h;
      if (legacy.nmls) doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text(`NMLS ${str(legacy.nmls)}`, LEFT, logoBottom + 6, { width: LOGO_W, align: 'center', lineBreak: false });
    }
  } catch {
    /* logo optional */
  }

  const HX = LEFT + LOGO_W + 16;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(str(title).toUpperCase(), HX, 44, { width: RIGHT - HX, lineBreak: false });
  let hy = 70;
  if (borrowerName) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Prepared for ${borrowerName}`, HX, hy, { width: RIGHT - HX, lineBreak: false });
    hy += 15;
  }
  if (propertyAddress) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(`Property: ${propertyAddress}`, HX, hy, { width: RIGHT - HX, lineBreak: false });
    hy += 15;
  }

  // Program + rate box
  const boxY = Math.max(hy + 2, 92);
  const boxH = 40;
  doc.save();
  doc.roundedRect(HX, boxY, RIGHT - HX, boxH, 6).fill(STRIP);
  doc.restore();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(programLabel || 'Loan Comparison', HX + 14, boxY + 8, { width: RIGHT - HX - 120, lineBreak: false });
  if (subLine) doc.fillColor(LABEL).font('Helvetica').fontSize(9).text(subLine, HX + 14, boxY + 23, { width: RIGHT - HX - 120, lineBreak: false });
  if (rate) {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('RATE', RIGHT - 96, boxY + 8, { width: 82, align: 'right', lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(rate, RIGHT - 96, boxY + 18, { width: 82, align: 'right', lineBreak: false });
  }

  let y = Math.max(boxY + boxH, logoBottom + 12) + 8;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(2).strokeColor(NAVY).stroke();
  y += 12;

  const heading = (text, color = NAVY) => {
    doc.fillColor(color).font('Helvetica-Bold').fontSize(12.5).text(text.toUpperCase(), LEFT, y, { width: RIGHT - LEFT, align: 'center' });
    y += 21;
  };
  const ensureFlow = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP_CONT;
    }
  };

  // ---- Loan Assumptions strip ----
  const aItems = [
    ['PURCHASE OPTIONS', str(assumptions.purchaseOptions, '—')],
    ['DOWN PAYMENT', str(assumptions.downPayment, '—')],
    ['HOMEOWNERS INS.', str(assumptions.insurance, '—')],
    ['PROPERTY TAXES', str(assumptions.taxes, '—')],
    ['HOA', str(assumptions.hoa, '—')],
  ];
  ensureFlow(22 + 40 + 16);
  heading('Loan Assumptions');
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
  y += stripH + 12;

  // ---- Monthly Payment Comparison (dynamic rows) ----
  ensureFlow(22 + 30);
  heading('Monthly Payment Comparison');
  const headH = 30;
  function drawTableHeader() {
    doc.save();
    doc.roundedRect(LEFT, y, RIGHT - LEFT, headH, 4).fill(NAVY);
    doc.restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('LOAN DETAILS', LEFT + 10, y + 11, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => {
      const lc = legacy.columns[i] || {};
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11 * F).text(str(lc.head1) || c.typeLabel, colX(i) + 2, y + 5, { width: colW - 4, align: 'center', lineBreak: false });
      doc.fillColor('#c7d4e6').font('Helvetica-Bold').fontSize(7 * F).text(str(lc.head2) || `${c.downPct}% DOWN`, colX(i) + 2, y + 19, { width: colW - 4, align: 'center', lineBreak: false });
    });
    y += headH;
  }
  drawTableHeader();

  const rowH = 20;
  const ensureTable = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP_CONT;
      drawTableHeader();
    }
  };
  const tableRows = model.rows.filter((r) => r.key !== 'price' && r.key !== 'totalMonthly' && r.key !== 'cashToClose');
  let z = 0;
  tableRows.forEach((row) => {
    ensureTable(rowH);
    if (z % 2 === 1) {
      doc.save();
      doc.rect(LEFT, y, RIGHT - LEFT, rowH).fill(STRIPE);
      doc.restore();
    }
    z += 1;
    const isRate = row.key === 'rate';
    const isApr = row.key === 'apr';
    const labelColor = isRate ? GO : isApr ? NAVY : '#33414f';
    doc.fillColor(labelColor).font(isRate || isApr ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => centerCol(c.cells[row.key] || '—', i, y + 6, { size: 9.5, color: isRate ? GO : VALUE, font: isRate ? 'Helvetica-Bold' : 'Helvetica' }));
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });

  // Estimated monthly payment (highlight)
  const emH = 28;
  ensureTable(emH);
  doc.save();
  doc.rect(LEFT, y, RIGHT - LEFT, emH).fill(HILITE);
  doc.restore();
  doc.fillColor(GO).font('Helvetica-Bold').fontSize(dense ? 7 : 8).text('ESTIMATED MONTHLY PAYMENT', LEFT, y + 11, { width: labelW, align: 'center', lineBreak: false });
  columns.forEach((c, i) => centerCol(c.cells.totalMonthly, i, y + 7, { font: 'Helvetica-Bold', size: 13, color: GO }));
  y += emH + 12;

  // ---- Estimated Cash to Close ----
  ensureFlow(22 + 42 + 12);
  heading('Estimated Cash to Close', GO);
  const cardH = 42;
  const cardGap = 8;
  const cardW = (RIGHT - LEFT - cardGap * (cols - 1)) / cols;
  columns.forEach((c, i) => {
    const lc = legacy.columns[i] || {};
    const cx = LEFT + i * (cardW + cardGap);
    doc.save();
    doc.roundedRect(cx, y, cardW, cardH, 6).fill(CARD_BG);
    doc.roundedRect(cx, y, cardW, cardH, 6).lineWidth(1).strokeColor(CARD_BORDER).stroke();
    doc.restore();
    doc.fillColor(LABEL).font('Helvetica-Bold').fontSize(7 * F).text(str(lc.cardLabel) || c.typeLabel, cx + 4, y + 8, { width: cardW - 8, align: 'center', lineBreak: false });
    doc.fillColor(GO).font('Helvetica-Bold').fontSize(14 * F).text(c.cells.cashToClose, cx + 4, y + 20, { width: cardW - 8, align: 'center', lineBreak: false });
  });
  y += cardH + 10;

  // Cash-to-close breakdown
  const cRows = [
    { label: 'Base Closing Costs (Est.)', get: (i) => str((legacy.columns[i] || {}).closing, '—') },
    { label: 'Credits Applied', get: (i) => str((legacy.columns[i] || {}).credits, '$0') },
    { label: 'Net Closing Costs', get: (i) => str((legacy.columns[i] || {}).netClosing, '—'), bold: true },
  ];
  let z2 = 0;
  cRows.forEach((row) => {
    ensureTable(rowH);
    if (z2 % 2 === 1) {
      doc.save();
      doc.rect(LEFT, y, RIGHT - LEFT, rowH).fill(STRIPE);
      doc.restore();
    }
    z2 += 1;
    doc.fillColor(row.bold ? NAVY : '#33414f').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => centerCol(row.get(i), i, y + 6, { size: 9.5, font: row.bold ? 'Helvetica-Bold' : 'Helvetica', color: row.bold ? NAVY : VALUE }));
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });
  y += 12;

  // ---- Payment Difference + Key Takeaway ----
  const diffs = arr(insights.paymentDiff).slice(0, 4).map((s) => str(s));
  const takeaway = str(insights.keyTakeaway);
  if (diffs.length || takeaway) {
    const halfW = (RIGHT - LEFT - 16) / 2;
    const boxH2 = 50;
    ensureFlow(boxH2 + 12);
    const boxTop = y;
    if (diffs.length) {
      doc.save();
      doc.roundedRect(LEFT, boxTop, halfW, boxH2, 6).fill(STRIP);
      doc.restore();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('PAYMENT DIFFERENCE', LEFT + 12, boxTop + 9, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(8.5).text(diffs.join('\n'), LEFT + 12, boxTop + 22, { width: halfW - 24, lineGap: 1.5 });
    }
    if (takeaway) {
      const rx = LEFT + halfW + 16;
      doc.save();
      doc.roundedRect(rx, boxTop, halfW, boxH2, 6).fill(STRIP);
      doc.restore();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('KEY TAKEAWAY', rx + 12, boxTop + 9, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(8.5).text(takeaway, rx + 12, boxTop + 22, { width: halfW - 24, lineGap: 1.5 });
    }
    y = boxTop + boxH2 + 12;
  }

  // ---- Program notes (dynamic) ----
  const notes = model.notes;
  if (notes.length) {
    ensureFlow(24);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text('PROGRAM NOTES', LEFT, y, { lineBreak: false });
    y += 15;
    const noteW = RIGHT - LEFT - 14;
    notes.forEach((note) => {
      doc.font('Helvetica').fontSize(8.5);
      const nh = doc.heightOfString(note, { width: noteW, lineGap: 1 });
      ensureFlow(nh + 5);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('•', LEFT, y, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(8.5).text(note, LEFT + 14, y, { width: noteW, lineGap: 1 });
      y += nh + 5;
    });
    y += 6;
  }

  // ---- Disclaimer ----
  const disclaimer =
    'Estimates only — not a Loan Estimate or a commitment to lend. Rates, APRs, mortgage insurance and fees may change until ' +
    'locked. Get an official Loan Estimate before choosing a loan.';
  doc.font('Helvetica').fontSize(7.5);
  const dh = doc.heightOfString(disclaimer, { width: RIGHT - LEFT, lineGap: 1 });
  // The disclaimer sits just above the footer; only push to a new page if it truly can't fit.
  if (y + dh > 742) {
    doc.addPage();
    y = TOP_CONT;
  }
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(disclaimer, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
}

/** Footer on every buffered page. */
export function addFooters(doc, lender) {
  const officer = [
    str(lender.officer),
    lender.officerNmls ? `NMLS ${str(lender.officerNmls)}` : '',
    str(lender.name),
    lender.nmls ? `Company NMLS ${str(lender.nmls)}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  const right = [str(lender.phone), str(lender.website)].filter(Boolean).join('  |  ');
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.moveTo(LEFT, FOOT_Y).lineTo(RIGHT, FOOT_Y).lineWidth(1).strokeColor(NAVY).stroke();
    doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(officer, LEFT, FOOT_Y + 8, { width: RIGHT - LEFT - 210, lineBreak: false });
    doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(right, RIGHT - 260, FOOT_Y + 8, { width: 200, align: 'right', lineBreak: false });
    if (range.count > 1) doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(`Page ${i + 1} of ${range.count}`, RIGHT - 60, FOOT_Y + 8, { width: 60, align: 'right', lineBreak: false });
  }
}

function coerceModel(body) {
  const m = obj(body.model);
  const rows = arr(m.rows).slice(0, 40).map((r) => ({ key: str(obj(r).key), label: str(obj(r).label) })).filter((r) => r.key);
  const columns = arr(m.columns).slice(0, 6).map((c) => {
    const o = obj(c);
    const cells = obj(o.cells);
    const safe = {};
    for (const r of rows) safe[r.key] = str(cells[r.key], '—');
    return { name: str(o.name), loanType: str(o.loanType), typeLabel: str(o.typeLabel, 'Loan'), credit: str(o.credit), downPct: Number.isFinite(Number(o.downPct)) ? Math.round(Number(o.downPct)) : 0, cells: safe };
  });
  const notes = arr(m.notes).slice(0, 24).map((n) => str(n)).filter(Boolean);
  return { rows, columns, notes };
}

/** Legacy per-column fields used for the header labels + cash-to-close breakdown. */
function coerceLegacy(body) {
  const lender = obj(body.lender);
  const columns = arr(body.columns).slice(0, 6).map((c) => {
    const o = obj(c);
    return {
      head1: str(o.head1) || str(o.priceLabel),
      head2: str(o.head2) || str(o.downLabel),
      cardLabel: str(o.cardLabel),
      closing: str(o.closing),
      credits: str(o.credits),
      netClosing: str(o.netClosing) || str(o.closing),
    };
  });
  return { columns, nmls: str(lender.nmls) };
}

/** Branded, dynamic "Home Financing Comparison" sheet a borrower can keep. */
router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const title = str(body.title, 'Home Financing Comparison').slice(0, 120);
  const borrowerName = str(body.borrowerName).slice(0, 120);
  const propertyAddress = str(body.propertyAddress).slice(0, 160);
  const programLabel = str(body.programLabel).slice(0, 90);
  const subLine = str(body.subLine).slice(0, 120);
  const rate = str(body.rate).slice(0, 24);
  const date =
    typeof body.date === 'string'
      ? body.date.slice(0, 60)
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lender = obj(body.lender);
  const assumptions = obj(body.assumptions);
  const insights = obj(body.insights);
  const model = coerceModel(body);
  const legacy = coerceLegacy(body);

  if (!model.columns.length || !model.rows.length) {
    return res.status(400).json({ error: 'Nothing to render — refresh the Compare tab and try again.' });
  }

  let logoSource = fs.existsSync(LOGO) ? LOGO : null;
  if (typeof body.logo === 'string' && body.logo.startsWith('data:')) {
    const b64 = body.logo.split(',')[1];
    if (b64) {
      try {
        logoSource = Buffer.from(b64, 'base64');
      } catch {
        /* keep default */
      }
    }
  }

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: LEFT, right: LEFT }, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    if (res.headersSent) return;
    const safeLast = (borrowerName.trim().split(/\s+/).pop() || '').replace(/[^A-Za-z0-9_-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="home-financing-comparison${safeLast ? '-' + safeLast : ''}.pdf"`);
    res.end(Buffer.concat(chunks));
  });
  doc.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate the comparison PDF.' });
  });

  try {
    renderComparisonPdf(doc, { title, borrowerName, propertyAddress, date, logoSource, programLabel, subLine, rate, assumptions, insights, model, legacy });
    addFooters(doc, lender);
    doc.end();
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate the comparison PDF.' });
  }
});

export default router;
