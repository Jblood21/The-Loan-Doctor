import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { incPreApprovals, addPreApproval, getPreApprovals } from '../store.js';
import { requireAuth } from '../auth.js';
import { drawLetter, FOOTER_H } from '../lib/letterPdf.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = path.join(ASSETS, 'letterhead-logo.jpg');
const HEADSHOT = path.join(ASSETS, 'officer-headshot.png');
const LEFT = 64;

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

  // Uploaded loan-officer photo (data URL) overrides the built-in footer headshot.
  const headshotBuf = decodeDataUrl(body.headshot);
  const headshotSource = headshotBuf || (fs.existsSync(HEADSHOT) ? HEADSHOT : null);

  const classic = style === 'classic';
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: FOOTER_H + 8, left: LEFT, right: 64 } });
  // Filename must be a safe token — control chars (\n, etc.) make setHeader throw.
  const lastName = (borrowerName.trim().split(/\s+/).pop() || '').replace(/[^A-Za-z0-9_-]/g, '') || 'letter';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="preapproval-${lastName}.pdf"`);
  doc.pipe(res);

  drawLetter(doc, {
    classic,
    showHeadshot,
    headshotSource,
    logoSource,
    signatureBuf,
    title,
    date,
    reLine,
    subjectAddress,
    salutation,
    paragraphs,
    terms,
    validity,
    closing,
    officer,
    lender,
    agent,
  });

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
