import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../auth.js';

const router = Router();

// Summit Home Loans brand palette.
const NAVY = '#13355f';
const STEEL = '#5f7fa8';
const INK = '#1b2733';
const MUTED = '#5b6b7b';
// Surface tints used for cards, bands, and zebra rows.
const HERO_BG = '#eef3fb'; // headline KPI card
const BAND_BG = '#e9eff7'; // section header band
const PANEL_BG = '#f6f8fb'; // assumptions grid
const ZEBRA_BG = '#f4f7fb'; // alternating table rows
const HAIRLINE = '#e7ecf2'; // row dividers
const LEFT = 56;
const RIGHT = 556;
const PAGE_W = 612;
const PAGE_H = 792;
const BOTTOM = 720; // content stops here; footer sits below
const CONT_TOP = 60; // top of continuation pages

// PDFKit's built-in fonts use WinAnsi encoding, which lacks a few symbols the
// calculators emit (the minus sign − and the approx sign ≈). Map those to ASCII
// so they don't render as garbage.
const clean = (s) =>
  String(s)
    .replace(/−/g, '-') // minus sign → hyphen
    .replace(/≈/g, '~') // ≈ → ~
    .replace(/→/g, '->'); // → → ->
const str = (v, f = '') => (v == null ? clean(f) : clean(String(v)));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

const decodeDataUrl = (v) => {
  if (typeof v !== 'string' || !v.startsWith('data:')) return null;
  const b64 = v.split(',')[1];
  if (!b64) return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
};

/** Coerce/cap the client's report sections + preparedFor to safe values. Shared by the
 *  loan-officer route and the agent route (each supplies its own branding). */
export function parseReportSections(body) {
  const b = body && typeof body === 'object' ? body : {};
  const preparedFor = str(b.preparedFor).slice(0, 120);
  const sections = arr(b.sections)
    .slice(0, 20)
    .map((s) => {
      const sec = obj(s);
      const h = obj(sec.headline);
      const t = obj(sec.table);
      const tableCols = arr(t.columns).slice(0, 4).map((c) => str(c));
      const table = tableCols.length
        ? {
            columns: tableCols,
            rows: arr(t.rows)
              .slice(0, 40)
              .map((r) => ({ label: str(obj(r).label), cells: arr(obj(r).cells).slice(0, tableCols.length).map((c) => str(c)) })),
          }
        : null;
      return {
        title: str(sec.title, 'Result'),
        subtitle: str(sec.subtitle),
        headline: sec.headline ? { label: str(h.label), value: str(h.value), sub: str(h.sub) } : null,
        inputs: arr(sec.inputs).slice(0, 20).map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        rows: arr(sec.rows).slice(0, 40).map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        table,
      };
    });
  return { preparedFor, sections };
}

/** Stream a report PDF to `res` with the given branding + already-parsed sections. */
export function streamReportPdf(res, { preparedFor, officer, lender, logoBuf, sections }) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 60, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="loan-analysis-report.pdf"`);
  doc.pipe(res);
  renderReport(doc, { preparedFor, officer, lender, logoBuf, sections });
  doc.end();
}

router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { preparedFor, sections } = parseReportSections(body);
  streamReportPdf(res, {
    preparedFor,
    officer: obj(body.officer),
    lender: obj(body.lender),
    logoBuf: decodeDataUrl(body.logo),
    sections,
  });
});

// Draw the whole report onto an existing PDFDocument (shared with render tests).
export function renderReport(doc, { preparedFor, officer, lender, logoBuf, sections }) {
  // Sanitize every string for the PDF's WinAnsi fonts (drop unsupported symbols),
  // so the function is safe to call directly, not only through the route.
  const C = (s) => clean(String(s ?? ''));
  preparedFor = C(preparedFor);
  officer = officer || {};
  officer = { name: C(officer.name), title: C(officer.title) };
  const L = lender || {};
  lender = {
    name: C(L.name),
    phone: C(L.phone),
    email: C(L.email),
    nmls: C(L.nmls),
    website: C(L.website),
    address: C(L.address),
  };
  sections = (sections || []).map((sec) => ({
    title: C(sec.title),
    subtitle: C(sec.subtitle),
    headline: sec.headline ? { label: C(sec.headline.label), value: C(sec.headline.value), sub: C(sec.headline.sub) } : null,
    inputs: (sec.inputs || []).map((i) => ({ label: C(i.label), value: C(i.value) })),
    rows: (sec.rows || []).map((r) => ({ label: C(r.label), value: C(r.value) })),
    table: sec.table
      ? {
          columns: (sec.table.columns || []).map((c) => C(c)),
          rows: (sec.table.rows || []).map((r) => ({ label: C(r.label), cells: (r.cells || []).map((c) => C(c)) })),
        }
      : null,
  }));

  const phoneEmail = [lender.phone, lender.email].filter(Boolean).join('   ·   ');
  const nmlsLine = [lender.nmls ? `NMLS# ${lender.nmls}` : '', lender.website || '', lender.address || '']
    .filter(Boolean)
    .join('   ·   ');

  let pageNo = 1;
  function drawFooter() {
    const savedY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // footer sits in the bottom margin; don't let it paginate
    doc.save();
    const top = PAGE_H - 52;
    // Two-tone rule to match the header accent.
    doc.moveTo(LEFT, top).lineTo(RIGHT, top).lineWidth(1).strokeColor('#d4dae3').stroke();
    doc.moveTo(LEFT, top).lineTo(LEFT + 70, top).lineWidth(2).strokeColor(NAVY).stroke();
    let ty = top + 8;
    const center = (text, color, font, size) => {
      if (!text) return;
      doc.fillColor(color).font(font).fontSize(size).text(text, LEFT, ty, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
      ty += size + 3;
    };
    center(phoneEmail, NAVY, 'Helvetica-Bold', 9.5);
    center(nmlsLine, STEEL, 'Helvetica', 8.5);
    center(`Page ${pageNo}`, '#9aa7b5', 'Helvetica', 8);
    doc.restore();
    doc.page.margins.bottom = savedBottom;
    doc.y = savedY;
  }

  const contentW = RIGHT - LEFT;

  // ---- Page-1 header ----
  let y = 46;
  try {
    if (logoBuf) doc.image(logoBuf, LEFT, y, { height: 36 });
  } catch {
    /* logo optional */
  }
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  // Date sits top-right, aligned with the logo.
  doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(dateStr, LEFT, y + 2, { width: contentW, align: 'right', lineBreak: false });

  const titleY = y + (logoBuf ? 50 : 4);
  doc.fillColor(STEEL).font('Helvetica-Bold').fontSize(8.5).text('MORTGAGE ANALYSIS', LEFT, titleY, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(21).text('Loan Analysis Report', LEFT, titleY + 12, { lineBreak: false });
  y = titleY + 12 + 28;

  const by = [officer.name, officer.title].filter(Boolean).join(', ');
  const primary = preparedFor ? `Prepared for ${preparedFor}` : by || lender.name || '';
  const secondary = preparedFor ? [by, lender.name].filter(Boolean).join('  ·  ') : lender.name || '';
  if (primary) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(primary, LEFT, y, { width: contentW, lineBreak: false });
    y += 15;
  }
  if (secondary) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(secondary, LEFT, y, { width: contentW, lineBreak: false });
    y += 15;
  }
  y += 5;
  // Two-tone divider: a full light rule with a short navy accent on the left.
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor('#d4dae3').stroke();
  doc.moveTo(LEFT, y).lineTo(LEFT + 96, y).lineWidth(2.5).strokeColor(NAVY).stroke();
  y += 24;

  drawFooter();
  doc.on('pageAdded', () => {
    pageNo += 1;
    y = CONT_TOP;
    drawFooter();
  });

  const ensure = (h) => {
    if (y + h > BOTTOM) doc.addPage();
  };

  sections.forEach((sec, idx) => {
    if (idx > 0) y += 12;
    // --- Section header: navy-tint band with a rounded left accent + navy title ---
    const bandH = 26;
    // Keep the band with at least the first block below it on the same page.
    ensure(bandH + 20 + (sec.headline ? 56 : 0));
    doc.save();
    doc.roundedRect(LEFT, y, contentW, bandH, 5).fill(BAND_BG);
    doc.roundedRect(LEFT, y + 4, 3.5, bandH - 8, 1.75).fill(NAVY); // left accent
    doc.restore();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12.5).text(sec.title, LEFT + 15, y + 7.5, { lineBreak: false });
    // Only show the band subtitle when it adds something the headline sub doesn't repeat.
    const bandSub = sec.subtitle && sec.subtitle !== (sec.headline && sec.headline.sub) ? sec.subtitle : '';
    if (bandSub) {
      doc.fillColor(STEEL).font('Helvetica').fontSize(8.5).text(bandSub, LEFT + 15, y + 9.5, { width: contentW - 30, align: 'right', lineBreak: false });
    }
    y += bandH + 14;

    // --- Headline KPI card ---
    if (sec.headline && (sec.headline.value || sec.headline.label)) {
      const hasLabel = !!sec.headline.label;
      const hasSub = !!sec.headline.sub;
      const cardH = 12 + (hasLabel ? 12 : 0) + 26 + (hasSub ? 13 : 0) + 2;
      ensure(cardH + 4);
      const top = y;
      doc.save();
      doc.roundedRect(LEFT, top, contentW, cardH, 6).fill(HERO_BG);
      doc.roundedRect(LEFT, top + 5, 3.5, cardH - 10, 1.75).fill(STEEL);
      doc.restore();
      let hy = top + 12;
      if (hasLabel) {
        doc.fillColor('#7d8ea3').font('Helvetica-Bold').fontSize(8).text(sec.headline.label.toUpperCase(), LEFT + 16, hy, { characterSpacing: 0.8, lineBreak: false });
        hy += 12;
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text(sec.headline.value, LEFT + 16, hy, { lineBreak: false });
      hy += 26;
      if (hasSub) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(sec.headline.sub, LEFT + 16, hy, { width: contentW - 32, lineBreak: false });
      }
      y = top + cardH + 14;
    }

    // --- Assumptions panel (two-column key/value grid) ---
    if (sec.inputs.length) {
      const gap = 18;
      const colW = (contentW - gap) / 2;
      const nRows = Math.ceil(sec.inputs.length / 2);
      const cellH = 15;
      const padTop = 10;
      const padBot = 10;
      doc.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text('ASSUMPTIONS', LEFT, y, { characterSpacing: 0.8, lineBreak: false });
      y += 12;
      const boxH = padTop + nRows * cellH + padBot - 4;
      ensure(boxH + 4);
      const bTop = y;
      doc.save();
      doc.roundedRect(LEFT, bTop, contentW, boxH, 5).fill(PANEL_BG);
      doc.restore();
      sec.inputs.forEach((inp, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cellLeft = LEFT + col * (colW + gap) + 12;
        const cellRight = LEFT + col * (colW + gap) + colW - 12;
        const cy = bTop + padTop + row * cellH;
        doc.fillColor(MUTED).font('Helvetica').fontSize(8.8).text(inp.label, cellLeft, cy, { width: (cellRight - cellLeft) * 0.62, lineBreak: false });
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.8).text(inp.value, cellLeft, cy, { width: cellRight - cellLeft, align: 'right', lineBreak: false });
      });
      y = bTop + boxH + 14;
    }

    // --- Multi-column comparison table (e.g. Rate Buydown) ---
    if (sec.table) {
      const tcols = sec.table.columns;
      const nC = Math.max(1, tcols.length);
      const labelColW = contentW * 0.32;
      const cW = (contentW - labelColW) / nC;
      const cX = (i) => LEFT + labelColW + i * cW;
      const headH = 22;
      ensure(headH + 20);
      // Header row: solid navy bar with white column labels.
      doc.save();
      doc.roundedRect(LEFT, y, contentW, headH, 4).fill(NAVY);
      doc.restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      tcols.forEach((c, i) => doc.text(c, cX(i) + 2, y + 7, { width: cW - 4, align: 'center', lineBreak: false }));
      y += headH;
      sec.table.rows.forEach((r, ri) => {
        const rowH = 19;
        ensure(rowH);
        const rowY = y;
        if (ri % 2 === 1) {
          doc.save();
          doc.rect(LEFT, rowY, contentW, rowH).fill(ZEBRA_BG);
          doc.restore();
        }
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(r.label, LEFT + 10, rowY + 5, { width: labelColW - 14, lineBreak: false });
        r.cells.forEach((cell, i) =>
          doc.fillColor('#33414f').font('Helvetica').fontSize(9).text(cell, cX(i) + 2, rowY + 5, { width: cW - 4, align: 'center', lineBreak: false }),
        );
        y = rowY + rowH;
      });
      // Close the table with a hairline.
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#d9e0ea').stroke();
    } else {
      // --- Result rows (the last "total"-style row gets a framed emphasis) ---
      sec.rows.forEach((row, i) => {
        const isTotal = i === sec.rows.length - 1 && sec.rows.length > 1 && /total|net|payment|savings|proceeds/i.test(row.label);
        const rowH = isTotal ? 24 : 21;
        ensure(rowH);
        const rowY = y;
        if (isTotal) {
          doc.save();
          doc.roundedRect(LEFT, rowY, contentW, rowH, 4).fill(HERO_BG);
          doc.restore();
        }
        const pad = isTotal ? 12 : 0;
        doc.fillColor(isTotal ? NAVY : '#33414f').font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 11 : 10.5).text(row.label, LEFT + pad, rowY + (isTotal ? 6 : 4), { width: contentW * 0.6, lineBreak: false });
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(isTotal ? 12 : 10.5).text(row.value, LEFT, rowY + (isTotal ? 6 : 4), { width: contentW - pad, align: 'right', lineBreak: false });
        y = rowY + rowH;
        if (!isTotal && i < sec.rows.length - 1) {
          doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
        }
      });
    }

    y += 18;
  });

  if (!sections.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('No tools were added to this report.', LEFT, y);
  }
}

export default router;
