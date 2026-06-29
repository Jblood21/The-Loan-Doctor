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

router.post('/pdf', requireAuth, (req, res) => {
  const {
    date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    reLine = 'Pre-Approval',
    subjectAddress = '',
    salutation = 'To Whom It May Concern:',
    paragraphs = [],
    closing = 'Best regards,',
    borrowerName = '—',
    officer = {},
    lender = {},
    agent = null,
  } = req.body || {};

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: 130, left: 64, right: 64 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${String(borrowerName).split(' ').pop() || 'letter'}.pdf"`);
  doc.pipe(res);

  const LEFT = 64;
  const RIGHT = 548;
  const PAGE_W = 612;
  const PAGE_H = 792;

  // Letterhead logo + gold rule
  try {
    if (fs.existsSync(LOGO)) doc.image(LOGO, LEFT, 48, { height: 46 });
  } catch {
    /* logo optional */
  }
  doc.moveTo(LEFT, 108).lineTo(RIGHT, 108).lineWidth(3).strokeColor(GOLD).stroke();
  doc.y = 126;

  // Date
  doc.fillColor('#555555').font('Helvetica').fontSize(10).text(date, LEFT, doc.y);
  doc.moveDown(1);

  // RE line
  const reY = doc.y;
  doc.fillColor('#1b2733').font('Helvetica-Bold').fontSize(11).text('RE: ', LEFT, reY, { continued: true });
  doc.font('Helvetica').text(reLine);
  if (subjectAddress) {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(11).text(subjectAddress, LEFT + 26, doc.y);
  }
  doc.moveDown(1);

  // Salutation + body
  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(salutation, LEFT, doc.y);
  doc.moveDown(0.6);
  (Array.isArray(paragraphs) ? paragraphs : []).forEach((p) => {
    doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(p, LEFT, doc.y, { width: RIGHT - LEFT, lineGap: 2 });
    doc.moveDown(0.7);
  });

  // Signature
  doc.moveDown(0.6);
  doc.fillColor('#1b2733').font('Helvetica').fontSize(11).text(closing, LEFT, doc.y);
  doc.moveDown(0.4);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(13).text(officer.name || 'Alan Blood', LEFT, doc.y);
  doc.fillColor('#5b6b7b').font('Helvetica').fontSize(10).text(officer.title || 'Mortgage Specialist', LEFT, doc.y);
  if (agent && agent.name) {
    doc.moveDown(0.4);
    doc.fillColor('#5b6b7b').font('Helvetica-Oblique').fontSize(9).text(
      `Prepared in partnership with ${agent.name}${agent.brokerage ? `, ${agent.brokerage}` : ''}${agent.phone ? ` · ${agent.phone}` : ''}.`,
      LEFT,
      doc.y,
      { width: RIGHT - LEFT },
    );
  }

  // ---- Contact footer band (absolute, bottom of page) ----
  // Drop the bottom margin so absolutely-positioned band text doesn't trigger new pages.
  doc.page.margins.bottom = 0;
  const bandH = 104;
  const bandY = PAGE_H - bandH;
  doc.save();
  doc.rect(0, bandY, PAGE_W, bandH).fill(GREEN);
  doc.rect(0, bandY, PAGE_W, 4).fill(GOLD);
  doc.restore();

  // headshot (circular)
  const r = 31;
  const cx = LEFT + r;
  const cy = bandY + bandH / 2;
  try {
    if (fs.existsSync(HEADSHOT)) {
      doc.save();
      doc.circle(cx, cy, r).clip();
      doc.image(HEADSHOT, cx - r, cy - r, { cover: [r * 2, r * 2], align: 'center', valign: 'top' });
      doc.restore();
      doc.circle(cx, cy, r).lineWidth(2).strokeColor(GOLD).stroke();
    }
  } catch {
    /* headshot optional */
  }

  // contact text
  const tx = LEFT + r * 2 + 18;
  let ty = bandY + 24;
  const line = (text, color, font = 'Helvetica', size = 10) => {
    doc.fillColor(color).font(font).fontSize(size).text(text, tx, ty, { width: PAGE_W - tx - 24, lineBreak: false });
    ty += size + 5;
  };
  const phoneEmail = [lender.phone, lender.email].filter(Boolean).join('   ·   ');
  line(phoneEmail, '#ffffff', 'Helvetica-Bold', 10);
  if (lender.address) line(lender.address, '#dfeae0');
  if (lender.name) line(lender.name, '#dfeae0');
  line(`NMLS# ${lender.nmls || ''}${lender.website ? `     ·     ${lender.website}` : ''}`, GOLD, 'Helvetica-Bold', 10);

  doc.end();
  incPreApprovals();
});

export default router;
