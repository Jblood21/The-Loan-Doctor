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
const STRIPE = '#f8fafc';
const HILITE = '#e8f5ee'; // green-tinted highlight for the payment / cash-to-close rows
const RULE = '#e3e8ee';
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
  const { title, borrowerName, propertyAddress, borrowerCredit, date, logoSource, model, legacy } = d;
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
  // Borrower credit score — shown just like the name/address, only when provided.
  if (borrowerCredit) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(`Credit Score: ${borrowerCredit}`, HX, hy, { width: RIGHT - HX, lineBreak: false });
    hy += 15;
  }

  let y = Math.max(hy + 6, logoBottom + 12) + 8;
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

  // ---- Monthly Payment Comparison (dynamic rows) ----
  ensureFlow(22 + 30);
  heading('Monthly Payment Comparison');
  const headH = 30;
  let activeHeaderLabel = 'LOAN DETAILS';
  function drawTableHeader() {
    doc.save();
    doc.roundedRect(LEFT, y, RIGHT - LEFT, headH, 4).fill(NAVY);
    doc.restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text(activeHeaderLabel, LEFT + 10, y + 11, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => {
      const lc = legacy.columns[i] || {};
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11 * F).text(str(lc.head1) || c.typeLabel, colX(i) + 2, y + 5, { width: colW - 4, align: 'center', lineBreak: false });
      // Show the borrower's credit alongside the down-payment in the column subheader.
      const sub = `${str(lc.head2) || `${c.downPct}% DOWN`}${c.credit ? ` · FICO ${c.credit}` : ''}`;
      doc.fillColor('#c7d4e6').font('Helvetica-Bold').fontSize(7 * F).text(sub, colX(i) + 2, y + 19, { width: colW - 4, align: 'center', lineBreak: false });
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
  y += emH + 14;

  // ---- Closing Costs (same table format as the monthly comparison) ----
  ensureFlow(22 + headH + rowH);
  heading('Closing Costs & Cash to Close');
  activeHeaderLabel = 'CLOSING COSTS';
  drawTableHeader();
  const cRows = [
    { label: 'Down Payment', get: (i) => columns[i].cells.downPayment },
    { label: 'Base Closing Costs (Est.)', get: (i) => str((legacy.columns[i] || {}).closing, '—') },
    { label: 'Credits Applied', get: (i) => str((legacy.columns[i] || {}).credits, '$0'), green: true },
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
    const lblColor = row.green ? GO : '#33414f';
    doc.fillColor(lblColor).font(row.green ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 12, lineBreak: false });
    columns.forEach((c, i) => centerCol(row.get(i), i, y + 6, { size: 9.5, color: row.green ? GO : VALUE, font: row.green ? 'Helvetica-Bold' : 'Helvetica' }));
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });

  // Estimated cash to close (green highlight) — sits UNDERNEATH the closing costs.
  const ecH = 28;
  ensureTable(ecH);
  doc.save();
  doc.rect(LEFT, y, RIGHT - LEFT, ecH).fill(HILITE);
  doc.restore();
  doc.fillColor(GO).font('Helvetica-Bold').fontSize(dense ? 7 : 8).text('ESTIMATED CASH TO CLOSE', LEFT, y + 11, { width: labelW, align: 'center', lineBreak: false });
  columns.forEach((c, i) => centerCol(c.cells.cashToClose, i, y + 7, { font: 'Helvetica-Bold', size: 13, color: GO }));
  y += ecH + 14;

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
    // Equal Housing Opportunity mark, bottom-left.
    drawEho(doc, LEFT, FOOT_Y + 19);
    doc.fillColor(MUTED).font('Helvetica').fontSize(6).text('EQUAL HOUSING OPPORTUNITY', LEFT + 19, FOOT_Y + 24, { lineBreak: false });
  }
}

/** Draw the Equal Housing Opportunity mark (a house with an "=" sign) as vectors. */
function drawEho(doc, x, top) {
  const s = 14;
  doc.save();
  doc.fillColor(NAVY_DK);
  // roof
  doc.moveTo(x + s / 2, top).lineTo(x, top + s * 0.5).lineTo(x + s, top + s * 0.5).fill();
  // walls
  doc.rect(x + s * 0.16, top + s * 0.5, s * 0.68, s * 0.5).fill();
  // equal sign (white knockout)
  doc.fillColor('#ffffff');
  doc.rect(x + s * 0.34, top + s * 0.6, s * 0.32, s * 0.1).fill();
  doc.rect(x + s * 0.34, top + s * 0.78, s * 0.32, s * 0.1).fill();
  doc.restore();
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
  const borrowerCredit = str(body.borrowerCredit).slice(0, 24);
  const date =
    typeof body.date === 'string'
      ? body.date.slice(0, 60)
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lender = obj(body.lender);
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
    renderComparisonPdf(doc, { title, borrowerName, propertyAddress, borrowerCredit, date, logoSource, model, legacy });
    addFooters(doc, lender);
    doc.end();
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate the comparison PDF.' });
  }
});

export default router;
