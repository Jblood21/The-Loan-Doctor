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
const LABEL = '#5b6b7b';
const VALUE = '#1f2d3d';
const MUTED = '#8b98a6';
const GO = '#0f9d58'; // bright "go" green — rate, monthly payment, cash to close

const PAGE_H = 792;
const LEFT = 40;
const RIGHT = 572;
const FOOT_Y = 752; // footer rule
const BOTTOM = 724; // content must stop above this
const TOP_CONT = 48; // top of continuation pages

const str = (v, f = '') => (v == null ? f : String(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Draw the whole dynamic comparison onto an existing PDFDocument (bufferPages:true).
 * Content only — the caller adds footers (needs the final page count) and ends the doc.
 * `d` fields are already coerced.
 */
export function renderComparisonPdf(doc, d) {
  const { title, borrowerName, propertyAddress, date, logoSource, model } = d;
  const rows = model.rows;
  const columns = model.columns;
  const cols = columns.length;

  const dense = cols >= 5;
  const labelW = dense ? 126 : 156;
  const colW = (RIGHT - LEFT - labelW) / cols;
  const colX = (i) => LEFT + labelW + i * colW;
  const F = cols >= 5 ? 0.82 : cols === 4 ? 0.92 : 1;
  const centerCol = (text, i, yy, { font = 'Helvetica', size = 9.5, color = VALUE } = {}) =>
    doc.fillColor(color).font(font).fontSize(size * F).text(text, colX(i) + 2, yy, { width: colW - 4, align: 'center', lineBreak: false });

  // ---- Page-1 letterhead ----
  let y = 40;
  const LOGO_W = 150;
  try {
    if (logoSource) {
      const img = doc.openImage(logoSource);
      const h = Math.min(60, (LOGO_W * img.height) / img.width);
      doc.image(logoSource, LEFT, 40, { fit: [LOGO_W, 60] });
      y = 40 + h;
    }
  } catch {
    /* logo optional */
  }
  const HX = LEFT + LOGO_W + 16;
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(date, LEFT, 44, { width: RIGHT - LEFT, align: 'right', lineBreak: false });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(str(title).toUpperCase(), HX, 46, { width: RIGHT - HX - 80, lineBreak: false });
  let metaY = 68;
  const meta = (text) => {
    doc.fillColor(LABEL).font('Helvetica').fontSize(10).text(text, HX, metaY, { width: RIGHT - HX, lineBreak: false });
    metaY += 15;
  };
  if (borrowerName) meta(`Prepared for ${borrowerName}`);
  if (propertyAddress) meta(`Property: ${propertyAddress}`);

  y = Math.max(y, metaY, 108) + 6;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(NAVY).stroke();
  y += 16;

  // ---- Column header band (repeats on continuation pages) ----
  const headH = 34;
  function drawColHeader() {
    doc.save();
    doc.roundedRect(LEFT, y, RIGHT - LEFT, headH, 4).fill(NAVY);
    doc.restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('LOAN DETAILS', LEFT + 10, y + 12, { width: labelW - 14, lineBreak: false });
    columns.forEach((c, i) => {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11 * F).text(c.typeLabel, colX(i) + 2, y + 6, { width: colW - 4, align: 'center', lineBreak: false });
      const sub = `${c.downPct}% down${c.credit ? ` · FICO ${c.credit}` : ''}`;
      doc.fillColor('#c7d4e6').font('Helvetica').fontSize(7 * F).text(sub, colX(i) + 2, y + 21, { width: colW - 4, align: 'center', lineBreak: false });
    });
    y += headH;
  }
  drawColHeader();

  // ---- Rows ----
  const rowH = 20;
  const hiRowH = 27;
  const ensureTable = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP_CONT;
      drawColHeader();
    }
  };
  let zebra = 0;
  rows.forEach((row) => {
    const isHi = row.key === 'totalMonthly' || row.key === 'cashToClose';
    const isRate = row.key === 'rate';
    const h = isHi ? hiRowH : rowH;
    ensureTable(h);
    if (isHi) {
      doc.save();
      doc.rect(LEFT, y, RIGHT - LEFT, h).fill(HILITE);
      doc.restore();
      doc.fillColor(GO).font('Helvetica-Bold').fontSize(dense ? 8.5 : 9.5).text(row.label, LEFT + 10, y + 9, { width: labelW - 14, lineBreak: false });
      columns.forEach((c, i) => centerCol(c.cells[row.key] || '—', i, y + 7, { font: 'Helvetica-Bold', size: 12.5, color: GO }));
      zebra = 0;
    } else {
      if (zebra % 2 === 1) {
        doc.save();
        doc.rect(LEFT, y, RIGHT - LEFT, h).fill(STRIPE);
        doc.restore();
      }
      zebra += 1;
      const labelColor = isRate ? GO : '#33414f';
      doc.fillColor(labelColor).font(isRate ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(row.label, LEFT + 10, y + 6, { width: labelW - 14, lineBreak: false });
      columns.forEach((c, i) =>
        centerCol(c.cells[row.key] || '—', i, y + 6, { size: 9.5, color: isRate ? GO : VALUE, font: isRate ? 'Helvetica-Bold' : 'Helvetica' }),
      );
    }
    doc.moveTo(LEFT, y + h).lineTo(RIGHT, y + h).lineWidth(0.5).strokeColor(RULE).stroke();
    y += h;
  });
  y += 16;

  const ensureFlow = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP_CONT;
    }
  };

  // ---- Program notes (dynamic) ----
  const notes = model.notes;
  if (notes.length) {
    ensureFlow(26);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('PROGRAM NOTES', LEFT, y, { lineBreak: false });
    y += 18;
    const noteW = RIGHT - LEFT - 14;
    notes.forEach((note) => {
      doc.font('Helvetica').fontSize(9);
      const nh = doc.heightOfString(note, { width: noteW, lineGap: 1.5 });
      ensureFlow(nh + 6);
      doc.fillColor(GO).font('Helvetica-Bold').fontSize(9).text('•', LEFT, y, { lineBreak: false });
      doc.fillColor('#44515f').font('Helvetica').fontSize(9).text(note, LEFT + 14, y, { width: noteW, lineGap: 1.5 });
      y += nh + 6;
    });
    y += 8;
  }

  // ---- Disclaimer ----
  const disclaimer =
    'Estimates only — this is not a Loan Estimate or a commitment to lend. Mortgage insurance, funding fees, APR, and ' +
    'total-interest figures are computed from standard program rules and national rate cards and can change until locked. ' +
    'Confirm exact lender factors and fees, and obtain an official Loan Estimate, before choosing a loan.';
  doc.font('Helvetica').fontSize(7.5);
  const dh = doc.heightOfString(disclaimer, { width: RIGHT - LEFT, lineGap: 1 });
  ensureFlow(dh + 4);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(disclaimer, LEFT, y, { width: RIGHT - LEFT, lineGap: 1 });
}

/** Draw the footer on every buffered page (called after content, needs the page count). */
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
    doc.page.margins.bottom = 0; // footer sits below the text margin
    doc.moveTo(LEFT, FOOT_Y).lineTo(RIGHT, FOOT_Y).lineWidth(1).strokeColor(NAVY).stroke();
    doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(officer, LEFT, FOOT_Y + 8, { width: RIGHT - LEFT - 210, lineBreak: false });
    doc.fillColor(NAVY_DK).font('Helvetica-Bold').fontSize(8).text(right, RIGHT - 260, FOOT_Y + 8, { width: 200, align: 'right', lineBreak: false });
    if (range.count > 1) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(`Page ${i + 1} of ${range.count}`, RIGHT - 60, FOOT_Y + 8, { width: 60, align: 'right', lineBreak: false });
    }
  }
}

/** Coerce the dynamic model from the request body into safe strings/arrays. */
function coerceModel(body) {
  const m = obj(body.model);
  const rows = arr(m.rows)
    .slice(0, 40)
    .map((r) => ({ key: str(obj(r).key), label: str(obj(r).label) }))
    .filter((r) => r.key);
  const columns = arr(m.columns)
    .slice(0, 6)
    .map((c) => {
      const o = obj(c);
      const cells = obj(o.cells);
      const safeCells = {};
      for (const r of rows) safeCells[r.key] = str(cells[r.key], '—');
      return {
        name: str(o.name),
        loanType: str(o.loanType),
        typeLabel: str(o.typeLabel, 'Loan'),
        credit: str(o.credit),
        downPct: Number.isFinite(Number(o.downPct)) ? Math.round(Number(o.downPct)) : 0,
        cells: safeCells,
      };
    });
  const notes = arr(m.notes).slice(0, 24).map((n) => str(n)).filter(Boolean);
  return { rows, columns, notes };
}

/** Branded, dynamic "Home Financing Comparison" sheet a borrower can keep. */
router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const title = str(body.title, 'Home Financing Comparison').slice(0, 120);
  const borrowerName = str(body.borrowerName).slice(0, 120);
  const propertyAddress = str(body.propertyAddress).slice(0, 160);
  const date =
    typeof body.date === 'string'
      ? body.date.slice(0, 60)
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lender = obj(body.lender);
  const model = coerceModel(body);

  if (!model.columns.length || !model.rows.length) {
    return res.status(400).json({ error: 'Nothing to render — refresh the Compare tab and try again.' });
  }

  // Resolve the letterhead logo (uploaded data URL overrides the built-in file).
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

  // Build into an in-memory buffer and only send on success, so a mid-render error
  // becomes a clean 500 instead of a corrupt, half-streamed download.
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
    renderComparisonPdf(doc, { title, borrowerName, propertyAddress, date, logoSource, lender, model });
    addFooters(doc, lender);
    doc.end();
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate the comparison PDF.' });
  }
});

export default router;
