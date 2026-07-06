import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { incPreApprovals } from '../store.js';
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
  const {
    style = 'mortgage-expert',
    showHeadshot = true,
    date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    title = '',
    reLine = 'Pre-Approval',
    subjectAddress = '',
    salutation = 'To Whom It May Concern:',
    paragraphs = [],
    terms = null,
    validity = '',
    closing = 'Best regards,',
    borrowerName = '—',
    officer = {},
    lender = {},
    agent = null,
  } = req.body || {};

  const classic = style === 'classic';
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: FOOTER_H + 8, left: LEFT, right: 64 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${String(borrowerName).split(' ').pop() || 'letter'}.pdf"`);
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
    if (fs.existsSync(LOGO)) {
      const img = doc.openImage(LOGO);
      const logoW = (46 * img.width) / img.height;
      const x = classic ? (PAGE_W - logoW) / 2 : LEFT;
      doc.image(LOGO, x, 48, { height: 46 });
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
  doc.moveDown(0.35);
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
});

export default router;
