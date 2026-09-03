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

const str = (v, f = '') => (v == null ? f : String(v));
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
  officer = officer || {};
  lender = lender || {};
  sections = sections || [];

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

  // ---- Page-1 header ----
  let y = 44;
  try {
    if (logoBuf) {
      doc.image(logoBuf, LEFT, y, { height: 40 });
    }
  } catch {
    /* logo optional */
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(21).text('Loan Analysis Report', LEFT, y + (logoBuf ? 52 : 4), {
    width: RIGHT - LEFT,
  });
  y = doc.y + 4;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const by = [officer.name, officer.title].filter(Boolean).join(', ');
  const meta = [preparedFor ? `Prepared for ${preparedFor}` : '', by ? `By ${by}` : '', dateStr].filter(Boolean).join('   ·   ');
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(meta, LEFT, y, { width: RIGHT - LEFT });
  y = doc.y + 10;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(2).strokeColor(STEEL).stroke();
  y += 18;

  drawFooter();
  doc.on('pageAdded', () => {
    y = CONT_TOP;
    drawFooter();
  });

  const ensure = (h) => {
    if (y + h > BOTTOM) doc.addPage();
  };

  sections.forEach((sec) => {
    // Section header bar
    ensure(30 + (sec.headline ? 46 : 0));
    doc.save();
    doc.roundedRect(LEFT, y, RIGHT - LEFT, 26, 5).fill(NAVY);
    doc.restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12.5).text(sec.title, LEFT + 12, y + 7, { lineBreak: false });
    if (sec.subtitle) {
      doc.fillColor('#c9d6e8').font('Helvetica').fontSize(9).text(sec.subtitle, LEFT + 12, y + 8.5, {
        width: RIGHT - LEFT - 24,
        align: 'right',
        lineBreak: false,
      });
    }
    y += 26 + 12;

    // Headline
    if (sec.headline && (sec.headline.value || sec.headline.label)) {
      ensure(46);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text((sec.headline.label || '').toUpperCase(), LEFT, y, { characterSpacing: 0.3 });
      y = doc.y + 1;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(19).text(sec.headline.value, LEFT, y);
      y = doc.y + 1;
      if (sec.headline.sub) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(sec.headline.sub, LEFT, y);
        y = doc.y;
      }
      y += 8;
    }

    // Inputs (compact wrapped line)
    if (sec.inputs.length) {
      const inputsText = sec.inputs.map((i) => `${i.label}: ${i.value}`).join('    ·    ');
      ensure(22);
      doc.fillColor('#8a99ab').font('Helvetica-Bold').fontSize(8).text('ASSUMPTIONS', LEFT, y, { characterSpacing: 0.5 });
      y = doc.y + 2;
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(inputsText, LEFT, y, { width: RIGHT - LEFT, lineGap: 2 });
      y = doc.y + 8;
    }

    // Result rows
    sec.rows.forEach((row) => {
      ensure(19);
      const rowY = y;
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(row.label, LEFT, rowY, { width: (RIGHT - LEFT) * 0.62, lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(row.value, LEFT, rowY, { width: RIGHT - LEFT, align: 'right', lineBreak: false });
      y = rowY + 17;
      doc.moveTo(LEFT, y - 4).lineTo(RIGHT, y - 4).lineWidth(0.5).strokeColor('#e6eaf0').stroke();
    });

    y += 16;
  });

  if (!sections.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('No tools were added to this report.', LEFT, y);
  }
}

export default router;
