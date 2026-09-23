// Open-house / listing payment flyer — a one-page, agent-co-branded sheet showing
// monthly-payment scenarios for a listing at several down-payment levels. The client
// computes the numbers (it has the finance library); this module only lays them out.

import PDFDocument from 'pdfkit';

const NAVY = '#13355f';
const STEEL = '#5f7fa8';
const INK = '#1b2733';
const MUTED = '#5b6b7b';
const LEFT = 56;
const RIGHT = 556;
const PAGE_H = 792;

const clean = (s) => String(s == null ? '' : s).replace(/−/g, '-').replace(/≈/g, '~').replace(/→/g, '->');

function decodeDataUrl(v) {
  if (typeof v !== 'string' || !v.startsWith('data:')) return null;
  const b64 = v.split(',')[1];
  if (!b64) return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/** Stream a payment-scenario flyer to `res`. `d` = { agent, listing, terms, scenarios }. */
export function streamFlyerPdf(res, d) {
  const data = d && typeof d === 'object' ? d : {};
  const agent = data.agent && typeof data.agent === 'object' ? data.agent : {};
  const listing = data.listing && typeof data.listing === 'object' ? data.listing : {};
  const terms = clean(data.terms || '');
  const scenarios = (Array.isArray(data.scenarios) ? data.scenarios : []).slice(0, 6).map((s) => {
    const o = s && typeof s === 'object' ? s : {};
    return { down: clean(o.down), loan: clean(o.loan), pi: clean(o.pi), taxesIns: clean(o.taxesIns), total: clean(o.total) };
  });
  const photoBuf = decodeDataUrl(agent.photo);

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 44, bottom: 56, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="payment-flyer.pdf"');
  doc.pipe(res);

  const contentW = RIGHT - LEFT;
  let y = 46;

  // ---- Agent header band ----
  const bandH = 74;
  doc.save();
  doc.roundedRect(LEFT, y, contentW, bandH, 8).fill('#f4f6f9');
  doc.restore();
  let tx = LEFT + 16;
  if (photoBuf) {
    try {
      const r = 26;
      const cx = LEFT + 16 + r;
      const cy = y + bandH / 2;
      doc.save();
      doc.circle(cx, cy, r).clip();
      doc.image(photoBuf, cx - r, cy - r, { cover: [r * 2, r * 2], align: 'center', valign: 'center' });
      doc.restore();
      doc.circle(cx, cy, r).lineWidth(1.5).strokeColor(STEEL).stroke();
      tx = cx + r + 16;
    } catch {
      /* photo optional */
    }
  }
  const nameLine = clean(agent.name || 'Your Real Estate Agent');
  const brokerage = clean(agent.brokerage || '');
  const contact = [clean(agent.phone), clean(agent.email)].filter(Boolean).join('   ·   ');
  const license = agent.license ? `License #${clean(agent.license)}` : '';
  let hy = y + 15;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(nameLine, tx, hy, { lineBreak: false });
  hy += 18;
  if (brokerage) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(brokerage, tx, hy, { lineBreak: false });
    hy += 13;
  }
  const sub = [contact, license].filter(Boolean).join('   ·   ');
  if (sub) doc.fillColor(STEEL).font('Helvetica').fontSize(9).text(sub, tx, hy, { lineBreak: false });
  y += bandH + 24;

  // ---- Title ----
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text('Monthly Payment Scenarios', LEFT, y, { lineBreak: false });
  y += 30;
  if (listing.address) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(clean(listing.address), LEFT, y, { width: contentW, lineBreak: false });
    y += 17;
  }
  const priceLine = [listing.price ? `List price ${clean(listing.price)}` : '', terms].filter(Boolean).join('   ·   ');
  if (priceLine) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10.5).text(priceLine, LEFT, y, { width: contentW, lineBreak: false });
    y += 16;
  }
  y += 10;

  // ---- Scenario table ----
  const cols = [
    { label: 'Down Payment', w: 0.24, align: 'left' },
    { label: 'Loan Amount', w: 0.19, align: 'right' },
    { label: 'Principal & Int.', w: 0.19, align: 'right' },
    { label: 'Taxes + Ins.', w: 0.19, align: 'right' },
    { label: 'Total / mo', w: 0.19, align: 'right' },
  ];
  const colX = [];
  let acc = LEFT;
  cols.forEach((c) => {
    colX.push(acc);
    acc += c.w * contentW;
  });
  const cellText = (i, text, yy, opts = {}) => {
    const c = cols[i];
    doc.text(text, colX[i] + 4, yy, { width: c.w * contentW - 8, align: c.align, lineBreak: false, ...opts });
  };

  // header row
  doc.save();
  doc.roundedRect(LEFT, y, contentW, 24, 4).fill(NAVY);
  doc.restore();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5);
  cols.forEach((c, i) => cellText(i, c.label, y + 8));
  y += 24;

  scenarios.forEach((s, ri) => {
    const rowH = 30;
    if (ri % 2 === 1) {
      doc.save();
      doc.rect(LEFT, y, contentW, rowH).fill('#f6f8fb');
      doc.restore();
    }
    const cy = y + 9;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    cellText(0, s.down, cy);
    doc.fillColor('#33414f').font('Helvetica').fontSize(11);
    cellText(1, s.loan, cy);
    cellText(2, s.pi, cy);
    cellText(3, s.taxesIns, cy);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5);
    cellText(4, s.total, cy);
    y += rowH;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#e3e8ee').stroke();
  });

  // ---- Disclaimer + footer ----
  y += 18;
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text(
    'Estimates only — not a loan commitment, pre-approval, or offer to lend. Monthly payments are approximate and include estimated property taxes and insurance; actual amounts depend on the property, loan program, credit, and final underwriting. Contact a licensed mortgage professional for an official quote.',
    LEFT,
    y,
    { width: contentW, lineGap: 2 },
  );

  // The footer sits in the bottom margin, so neutralize it to stop PDFKit from
  // paginating the last line onto a second page.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const footTop = PAGE_H - 40;
  doc.moveTo(LEFT, footTop).lineTo(RIGHT, footTop).lineWidth(1).strokeColor('#d4dae3').stroke();
  doc.fillColor(STEEL).font('Helvetica').fontSize(8.5).text('Prepared by ' + nameLine + (brokerage ? ' · ' + brokerage : ''), LEFT, footTop + 7, {
    width: contentW,
    align: 'center',
    lineBreak: false,
  });
  doc.page.margins.bottom = savedBottom;

  doc.end();
}
