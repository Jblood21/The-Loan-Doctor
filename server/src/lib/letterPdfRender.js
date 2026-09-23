// Shared letter-PDF rendering: coerces a letter payload and streams a PDF to the
// HTTP response. Used by the loan-officer route (/api/preapproval/pdf) and the agent
// assignment route (/api/agent/assignments/:id/pdf) so both produce identical letters.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { drawLetter, FOOTER_H } from './letterPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = path.join(ASSETS, 'letterhead-logo.jpg');
const HEADSHOT = path.join(ASSETS, 'officer-headshot.png');
const LEFT = 64;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v, fallback = '') => (v == null ? fallback : String(v));

// Decode a data URL into a Buffer PDFKit can draw, or null if it isn't one.
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

/**
 * Coerce every field the PDF touches to a safe value, set the response headers, and
 * stream the rendered letter PDF to `res`. Does not touch the data store.
 */
export function streamLetterPdf(res, body) {
  const b = body && typeof body === 'object' ? body : {};

  const style = b.style === 'classic' ? 'classic' : 'mortgage-expert';
  const showHeadshot = b.showHeadshot !== false;
  const date =
    typeof b.date === 'string'
      ? b.date.slice(0, 80)
      : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const title = str(b.title);
  const reLine = str(b.reLine, 'Pre-Approval');
  const subjectAddress = str(b.subjectAddress);
  const salutation = str(b.salutation, 'To Whom It May Concern:');
  const paragraphs = (Array.isArray(b.paragraphs) ? b.paragraphs : []).slice(0, 40).map((p) => str(p));
  const terms = (Array.isArray(b.terms) ? b.terms : [])
    .filter((t) => t && typeof t === 'object' && !Array.isArray(t))
    .slice(0, 40)
    .map((t) => ({ label: str(t.label), value: str(t.value) }));
  const validity = str(b.validity);
  const closing = str(b.closing, 'Best regards,');
  const borrowerName = str(b.borrowerName, '—');
  const officer = obj(b.officer);
  const lender = obj(b.lender);
  const agentAck = str(b.agentAck);

  let logoSource = fs.existsSync(LOGO) ? LOGO : null;
  const logoBuf = decodeDataUrl(b.logo);
  if (logoBuf) logoSource = logoBuf;

  const signatureBuf = decodeDataUrl(b.signature);
  const headshotBuf = decodeDataUrl(b.headshot);
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
    agentAck,
  });

  doc.end();
}
