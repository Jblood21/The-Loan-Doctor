import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../auth.js';

const router = Router();

// Summit Home Loans brand palette.
const NAVY = '#13355f';
const STEEL = '#5f7fa8';
const INK = '#1b2733';
const MUTED = '#5b6b7b';
const LEFT = 56;
const RIGHT = 556;
const PAGE_W = 612;
const PAGE_H = 792;
const BOTTOM = 726; // content stops here; footer sits below
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

router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const preparedFor = str(body.preparedFor).slice(0, 120);
  const officer = obj(body.officer);
  const lender = obj(body.lender);
  const logoBuf = decodeDataUrl(body.logo);

  const sections = arr(body.sections)
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
        inputs: arr(sec.inputs)
          .slice(0, 20)
          .map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        rows: arr(sec.rows)
          .slice(0, 40)
          .map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        table,
      };
    });

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 60, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="loan-analysis-report.pdf"`);
  doc.pipe(res);

  renderReport(doc, { preparedFor, officer, lender, logoBuf, sections });
  doc.end();
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

  function drawFooter() {
    const savedY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // footer sits in the bottom margin; don't let it paginate
    doc.save();
    const top = PAGE_H - 46;
    doc.moveTo(LEFT, top).lineTo(RIGHT, top).lineWidth(1).strokeColor('#d4dae3').stroke();
    let ty = top + 8;
    const center = (text, color, font, size) => {
      if (!text) return;
      doc.fillColor(color).font(font).fontSize(size).text(text, LEFT, ty, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
      ty += size + 3;
    };
    center(phoneEmail, NAVY, 'Helvetica-Bold', 9.5);
    center(nmlsLine, STEEL, 'Helvetica', 8.5);
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

  const titleY = y + (logoBuf ? 50 : 6);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('Loan Analysis Report', LEFT, titleY, { lineBreak: false });
  y = titleY + 26;

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
  y += 4;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(NAVY).stroke();
  y += 22;

  drawFooter();
  doc.on('pageAdded', () => {
    y = CONT_TOP;
    drawFooter();
  });

  const ensure = (h) => {
    if (y + h > BOTTOM) doc.addPage();
  };

  sections.forEach((sec, idx) => {
    if (idx > 0) y += 6;
    // --- Section header: light navy-tint band with navy title ---
    ensure(28 + (sec.headline ? 48 : 0));
    doc.save();
    doc.roundedRect(LEFT, y, contentW, 25, 4).fill('#eef2f8');
    doc.rect(LEFT, y, 3.5, 25).fill(NAVY); // left accent
    doc.restore();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(sec.title, LEFT + 14, y + 7.5, { lineBreak: false });
    if (sec.subtitle) {
      doc.fillColor(STEEL).font('Helvetica').fontSize(8.5).text(sec.subtitle, LEFT + 14, y + 9, {
        width: contentW - 28,
        align: 'right',
        lineBreak: false,
      });
    }
    y += 25 + 14;

    // --- Headline stat ---
    if (sec.headline && (sec.headline.value || sec.headline.label)) {
      ensure(48);
      if (sec.headline.label) {
        doc.fillColor('#8a99ab').font('Helvetica-Bold').fontSize(8).text(sec.headline.label.toUpperCase(), LEFT, y, { characterSpacing: 0.6, lineBreak: false });
        y += 12;
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(sec.headline.value, LEFT, y, { lineBreak: false });
      y += 24;
      if (sec.headline.sub) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(sec.headline.sub, LEFT, y, { width: contentW, lineBreak: false });
        y += 13;
      }
      y += 8;
    }

    // --- Assumptions panel (two-column key/value grid) ---
    if (sec.inputs.length) {
      const gap = 18;
      const colW = (contentW - gap) / 2;
      const nRows = Math.ceil(sec.inputs.length / 2);
      const cellH = 15;
      const padTop = 10;
      const padBot = 10;
      const labelY = y;
      doc.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text('ASSUMPTIONS', LEFT, labelY, { characterSpacing: 0.8, lineBreak: false });
      y += 12;
      const boxTop = y;
      const boxH = padTop + nRows * cellH + padBot - 4;
      ensure(boxH + 4);
      // re-anchor if a page break happened
      const bTop = y > boxTop ? y : boxTop;
      doc.save();
      doc.roundedRect(LEFT, bTop, contentW, boxH, 5).fill('#f6f8fb');
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
      y = bTop + boxH + 12;
    }

    // --- Multi-column comparison table (e.g. Rate Buydown) ---
    if (sec.table) {
      const tcols = sec.table.columns;
      const nC = Math.max(1, tcols.length);
      const labelColW = contentW * 0.34;
      const cW = (contentW - labelColW) / nC;
      const cX = (i) => LEFT + labelColW + i * cW;
      ensure(20);
      tcols.forEach((c, i) => doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text(c, cX(i) + 2, y + 3, { width: cW - 4, align: 'center', lineBreak: false }));
      y += 17;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.8).strokeColor('#c9d4e2').stroke();
      y += 2;
      sec.table.rows.forEach((r) => {
        ensure(17);
        const rowY = y;
        doc.fillColor('#33414f').font('Helvetica').fontSize(9).text(r.label, LEFT, rowY + 4, { width: labelColW - 6, lineBreak: false });
        r.cells.forEach((cell, i) => doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(cell, cX(i) + 2, rowY + 4, { width: cW - 4, align: 'center', lineBreak: false }));
        y = rowY + 17;
        doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#eaeef3').stroke();
      });
    } else {
      // --- Result rows ---
      sec.rows.forEach((row, i) => {
        ensure(20);
        const rowY = y;
        doc.fillColor('#33414f').font('Helvetica').fontSize(10.5).text(row.label, LEFT, rowY + 4, { width: contentW * 0.62, lineBreak: false });
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(row.value, LEFT, rowY + 4, { width: contentW, align: 'right', lineBreak: false });
        y = rowY + 20;
        if (i < sec.rows.length - 1) {
          doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#eaeef3').stroke();
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
