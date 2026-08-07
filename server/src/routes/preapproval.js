import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { incPreApprovals, addPreApproval, getPreApprovals } from '../store.js';
import { requireAuth } from '../auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = path.join(ASSETS, 'letterhead-logo.jpg');
const HEADSHOT = path.join(ASSETS, 'officer-headshot.png');

const GREEN = '#1f3d25';
const GOLD = '#b18f3f';
const LEFT = 64;
const RIGHT = 548;
const PAGE_W = 612;
const PAGE_H = 792;
const FOOTER_H = 104;

router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  // Coerce every field the PDF touches to a safe value up front. Destructuring
  // defaults only cover `undefined`, so an explicit `null` (e.g. "officer": null)
  // would otherwise throw mid-stream and corrupt the PDF. obj() null-guards objects.
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const str = (v, fallback = '') => (v == null ? fallback : String(v));

  const style = body.style === 'classic' ? 'classic' : 'mortgage-expert';
  const showHeadshot = body.showHeadshot !== false;
  const date =
    typeof body.date === 'string'
      ? body.date.slice(0, 80)
      : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const title = str(body.title);
  const reLine = str(body.reLine, 'Pre-Approval');
  const subjectAddress = str(body.subjectAddress);
  const salutation = str(body.salutation, 'To Whom It May Concern:');
  const paragraphs = (Array.isArray(body.paragraphs) ? body.paragraphs : []).slice(0, 40).map((p) => str(p));
  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .filter((t) => t && typeof t === 'object' && !Array.isArray(t))
    .slice(0, 40)
    .map((t) => ({ label: str(t.label), value: str(t.value) }));
  const validity = str(body.validity);
  const closing = str(body.closing, 'Best regards,');
  const borrowerName = str(body.borrowerName, '—');
  const officer = obj(body.officer);
  const lender = obj(body.lender);
  const agent = obj(body.agent);
  const logo = body.logo ?? null;
  const loan = obj(body.loan); // structured loan snapshot for the issued-pre-approvals history

  // Decode a data URL into a Buffer PDFKit can draw, or null if it isn't one.
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

  // Custom uploaded letterhead logo (data URL) overrides the built-in file.
  let logoSource = fs.existsSync(LOGO) ? LOGO : null;
  const logoBuf = decodeDataUrl(logo);
  if (logoBuf) logoSource = logoBuf;

  // Handwritten/uploaded signature drawn above the officer name (optional).
  const signatureBuf = decodeDataUrl(body.signature);

  const classic = style === 'classic';
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: FOOTER_H + 8, left: LEFT, right: 64 } });
  // Filename must be a safe token — control chars (\n, etc.) make setHeader throw.
  const lastName = (borrowerName.trim().split(/\s+/).pop() || '').replace(/[^A-Za-z0-9_-]/g, '') || 'letter';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${lastName}.pdf"`);
  doc.pipe(res);

  const phoneEmail = [lender.phone, lender.email].filter(Boolean).join('   ·   ');
  const nmlsLine = `NMLS# ${lender.nmls || ''}${lender.website ? `     ·     ${lender.website}` : ''}`;

  // Footer drawn on every page (absolute), so multi-page letters stay correct.
  function drawFooter() {
    const savedY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // prevent the footer's own text from paginating
    doc.save();

    if (classic) {
      const top = PAGE_H - FOOTER_H;
      doc.moveTo(LEFT, top).lineTo(RIGHT, top).lineWidth(3).strokeColor(GOLD).stroke();
      let ty = top + 10;
      if (showHeadshot && fs.existsSync(HEADSHOT)) {
        try {
          const r = 16;
          const cx = PAGE_W / 2;
          doc.save();
          doc.circle(cx, ty + r, r).clip();
          doc.image(HEADSHOT, cx - r, ty, { cover: [r * 2, r * 2], align: 'center', valign: 'top' });
          doc.restore();
          doc.circle(cx, ty + r, r).lineWidth(1.5).strokeColor(GOLD).stroke();
          ty += r * 2 + 5;
        } catch {
          /* optional */
        }
      }
      const center = (text, color, font = 'Helvetica', size = 9.5) => {
        doc.fillColor(color).font(font).fontSize(size).text(text, LEFT, ty, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
        ty += size + 3;
      };
      center(phoneEmail, GREEN, 'Helvetica-Bold', 10);
      if (lender.address) center(lender.address, '#3a4a3a');
      if (lender.name) center(lender.name, '#3a4a3a');
      center(nmlsLine, GOLD, 'Helvetica-Bold');
    } else {
      const bandY = PAGE_H - FOOTER_H;
      doc.rect(0, bandY, PAGE_W, FOOTER_H).fill(GREEN);
      doc.rect(0, bandY, PAGE_W, 4).fill(GOLD);
      let tx = LEFT;
      if (showHeadshot && fs.existsSync(HEADSHOT)) {
        try {
          const r = 31;
          const cx = LEFT + r;
          const cy = bandY + FOOTER_H / 2;
          doc.save();
          doc.circle(cx, cy, r).clip();
          doc.image(HEADSHOT, cx - r, cy - r, { cover: [r * 2, r * 2], align: 'center', valign: 'top' });
          doc.restore();
          doc.circle(cx, cy, r).lineWidth(2).strokeColor(GOLD).stroke();
          tx = LEFT + r * 2 + 18;
        } catch {
          /* optional */
        }
      }
      let ty = bandY + 24;
      const line = (text, color, font = 'Helvetica', size = 10) => {
        doc.fillColor(color).font(font).fontSize(size).text(text, tx, ty, { width: PAGE_W - tx - 24, lineBreak: false });
        ty += size + 5;
      };
      line(phoneEmail, '#ffffff', 'Helvetica-Bold', 10);
      if (lender.address) line(lender.address, '#dfeae0');
      if (lender.name) line(lender.name, '#dfeae0');
      line(nmlsLine, GOLD, 'Helvetica-Bold', 10);
    }

    doc.restore();
    doc.page.margins.bottom = savedBottom;
    doc.y = savedY;
  }

  // --- Letterhead (page 1 only) ---
  try {
    if (logoSource) {
      const img = doc.openImage(logoSource);
      const logoW = (46 * img.width) / img.height;
      const x = classic ? (PAGE_W - logoW) / 2 : LEFT;
      doc.image(logoSource, x, 48, { height: 46 });
    }
  } catch {
    /* logo optional */
  }
  doc.moveTo(LEFT, 108).lineTo(RIGHT, 108).lineWidth(3).strokeColor(GOLD).stroke();
  doc.y = 126;

  drawFooter(); // footer for page 1
  doc.on('pageAdded', drawFooter); // footer for any overflow page

  // --- Body ---
  if (title) {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(15).text(title, LEFT, doc.y, { width: RIGHT - LEFT, align: 'center' });
    doc.moveDown(0.5);
  }
  doc.fillColor('#555555').font('Helvetica').fontSize(10).text(date, LEFT, doc.y);
  doc.moveDown(0.9);

  doc.fillColor('#1b2733').font('Helvetica-Bold').fontSize(11).text('RE: ', LEFT, doc.y, { continued: true });
  doc.font('Helvetica').text(reLine);
  if (subjectAddress) doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(11).text(subjectAddress, LEFT + 26, doc.y);
  doc.moveDown(0.9);

  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(salutation, LEFT, doc.y);
  doc.moveDown(0.55);
  (Array.isArray(paragraphs) ? paragraphs : []).forEach((p) => {
    doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(p, LEFT, doc.y, { width: RIGHT - LEFT, lineGap: 1.5 });
    doc.moveDown(0.5);
  });

  if (Array.isArray(terms) && terms.length) {
    const rowH = 15;
    const padY = 7;
    const boxH = terms.length * rowH + padY * 2;
    doc.save();
    doc.roundedRect(LEFT, doc.y, RIGHT - LEFT, boxH, 6).fill('#f4f6f9');
    doc.restore();
    let ry = doc.y + padY + 1;
    terms.forEach((row) => {
      doc.fillColor('#5b6b7b').font('Helvetica').fontSize(9.5).text(row.label, LEFT + 12, ry);
      doc.fillColor('#0c2238').font('Helvetica-Bold').fontSize(9.5).text(row.value, LEFT + 12, ry, { width: RIGHT - LEFT - 24, align: 'right' });
      ry += rowH;
    });
    doc.y = doc.y + boxH + 7;
  }

  if (validity) {
    doc.fillColor('#444444').font('Helvetica').fontSize(10).text(validity, LEFT, doc.y, { width: RIGHT - LEFT, lineGap: 1.5 });
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(closing, LEFT, doc.y);

  // Signature above the name: constrain to a signature-sized box (never wider than
  // the text column) and keep it and the name together on one page.
  let signaturePlaced = false;
  if (signatureBuf) {
    try {
      const img = doc.openImage(signatureBuf);
      const maxH = 44;
      const maxW = 220;
      const scale = Math.min(maxH / img.height, maxW / img.width, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      // Page-break if the signature + name wouldn't fit above the footer.
      if (doc.y + drawH + 22 > PAGE_H - FOOTER_H - 8) doc.addPage();
      doc.moveDown(0.2);
      doc.image(signatureBuf, LEFT, doc.y, { width: drawW, height: drawH });
      doc.y += drawH + 2;
      signaturePlaced = true;
    } catch {
      /* signature optional — fall back to the plain name spacing */
    }
  }
  if (!signaturePlaced) doc.moveDown(0.35);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(13).text(officer.name || lender.name || 'Your Loan Officer', LEFT, doc.y);
  doc.fillColor('#5b6b7b').font('Helvetica').fontSize(10).text(officer.title || 'Mortgage Loan Officer', LEFT, doc.y);
  if (agent && agent.name) {
    doc.moveDown(0.35);
    doc.fillColor('#5b6b7b').font('Helvetica-Oblique').fontSize(9).text(
      `Prepared in partnership with ${agent.name}${agent.brokerage ? `, ${agent.brokerage}` : ''}${agent.phone ? ` · ${agent.phone}` : ''}.`,
      LEFT,
      doc.y,
      { width: RIGHT - LEFT },
    );
  }

  doc.end();
  incPreApprovals();

  // Record the issued pre-approval so it shows in the history, tied to the borrower.
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  addPreApproval(req.user.id, {
    borrowerName,
    propertyAddress: subjectAddress || str(loan.propertyAddress),
    loanType: str(loan.loanType),
    transaction: str(loan.transaction),
    price: n(loan.price),
    loanAmount: n(loan.loanAmount),
    downPayment: n(loan.downPayment),
    rate: n(loan.rate),
    term: str(loan.term),
    monthlyPayment: n(loan.monthlyPayment),
    apr: n(loan.apr),
    reLine,
    validityDays: n(loan.validityDays),
  });
});

// Issued-pre-approval history for the signed-in loan officer (newest first).
router.get('/history', requireAuth, (req, res) => {
  res.json({ history: getPreApprovals(req.user.id) });
});

export default router;
