// Pre-approval letter PDF drawing, shared by the route and the render tests.
//
// Typography is scaled to match the on-screen letter preview so the downloaded
// PDF fills the page the same way (the previous sizes were ~30% too small, which
// left the text squished at the top with a large empty gap above the footer).

// Summit Home Loans brand palette (navy + steel accent).
export const GREEN = '#13355f';
export const GOLD = '#5f7fa8';
export const LEFT = 64;
export const RIGHT = 548;
export const PAGE_W = 612;
export const PAGE_H = 792;
export const FOOTER_H = 104;

/**
 * Draw the whole letter onto an existing PDFDocument. Does not call doc.end().
 * `d` holds the already-coerced fields plus resolved image sources:
 *   { classic, showHeadshot, headshotSource, logoSource, signatureBuf,
 *     title, date, reLine, subjectAddress, salutation, paragraphs, terms,
 *     validity, closing, officer, lender, agent }
 */
export function drawLetter(doc, d) {
  const { classic, showHeadshot, headshotSource, logoSource, signatureBuf } = d;
  const lender = d.lender || {};
  const officer = d.officer || {};
  const agent = d.agent || {};

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
      let ty = top + 11;
      if (showHeadshot && headshotSource) {
        try {
          const r = 18;
          const cx = PAGE_W / 2;
          doc.save();
          doc.circle(cx, ty + r, r).clip();
          doc.image(headshotSource, cx - r, ty, { cover: [r * 2, r * 2], align: 'center', valign: 'top' });
          doc.restore();
          doc.circle(cx, ty + r, r).lineWidth(1.5).strokeColor(GOLD).stroke();
          ty += r * 2 + 5;
        } catch {
          /* optional */
        }
      }
      const center = (text, color, font = 'Helvetica', size = 10.5) => {
        doc.fillColor(color).font(font).fontSize(size).text(text, LEFT, ty, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
        ty += size + 3;
      };
      center(phoneEmail, GREEN, 'Helvetica-Bold', 11);
      if (lender.address) center(lender.address, '#3a4a3a');
      if (lender.name) center(lender.name, '#3a4a3a');
      center(nmlsLine, GOLD, 'Helvetica-Bold');
    } else {
      const bandY = PAGE_H - FOOTER_H;
      doc.rect(0, bandY, PAGE_W, FOOTER_H).fill(GREEN);
      doc.rect(0, bandY, PAGE_W, 4).fill(GOLD);
      let tx = LEFT;
      if (showHeadshot && headshotSource) {
        try {
          const r = 32;
          const cx = LEFT + r;
          const cy = bandY + FOOTER_H / 2;
          doc.save();
          doc.circle(cx, cy, r).clip();
          doc.image(headshotSource, cx - r, cy - r, { cover: [r * 2, r * 2], align: 'center', valign: 'top' });
          doc.restore();
          doc.circle(cx, cy, r).lineWidth(2).strokeColor(GOLD).stroke();
          tx = LEFT + r * 2 + 18;
        } catch {
          /* optional */
        }
      }
      let ty = bandY + 22;
      const line = (text, color, font = 'Helvetica', size = 11) => {
        doc.fillColor(color).font(font).fontSize(size).text(text, tx, ty, { width: PAGE_W - tx - 24, lineBreak: false });
        ty += size + 5;
      };
      line(phoneEmail, '#ffffff', 'Helvetica-Bold', 11);
      if (lender.address) line(lender.address, '#dfeae0');
      if (lender.name) line(lender.name, '#dfeae0');
      line(nmlsLine, GOLD, 'Helvetica-Bold', 11);
    }

    doc.restore();
    doc.page.margins.bottom = savedBottom;
    doc.y = savedY;
  }

  // --- Letterhead (page 1 only) ---
  try {
    if (logoSource) {
      const img = doc.openImage(logoSource);
      const logoW = (58 * img.width) / img.height;
      const x = classic ? (PAGE_W - logoW) / 2 : LEFT;
      doc.image(logoSource, x, 48, { height: 58 });
    }
  } catch {
    /* logo optional */
  }
  doc.moveTo(LEFT, 118).lineTo(RIGHT, 118).lineWidth(3).strokeColor(GOLD).stroke();
  doc.y = 136;

  drawFooter(); // footer for page 1
  doc.on('pageAdded', drawFooter); // footer for any overflow page

  // --- Body ---
  if (d.title) {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(17).text(d.title, LEFT, doc.y, { width: RIGHT - LEFT, align: 'center' });
    doc.moveDown(0.5);
  }
  doc.fillColor('#555555').font('Helvetica').fontSize(11.5).text(d.date, LEFT, doc.y);
  doc.moveDown(0.95);

  doc.fillColor('#1b2733').font('Helvetica-Bold').fontSize(12.5).text('RE: ', LEFT, doc.y, { continued: true });
  doc.font('Helvetica').text(d.reLine);
  if (d.subjectAddress) doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12.5).text(d.subjectAddress, LEFT + 30, doc.y);
  doc.moveDown(0.95);

  doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(d.salutation, LEFT, doc.y);
  doc.moveDown(0.6);
  (Array.isArray(d.paragraphs) ? d.paragraphs : []).forEach((p) => {
    doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(p, LEFT, doc.y, { width: RIGHT - LEFT, lineGap: 3 });
    doc.moveDown(0.55);
  });

  if (Array.isArray(d.terms) && d.terms.length) {
    const rowH = 17;
    const padY = 8;
    const boxH = d.terms.length * rowH + padY * 2;
    // Anchor to the box top: the per-row doc.text() calls advance doc.y as a side
    // effect, so we must set doc.y relative to boxTop, not the post-loop doc.y
    // (otherwise the box height is counted twice and leaves a large empty gap).
    const boxTop = doc.y;
    doc.save();
    doc.roundedRect(LEFT, boxTop, RIGHT - LEFT, boxH, 6).fill('#f4f6f9');
    doc.restore();
    let ry = boxTop + padY + 1;
    d.terms.forEach((row) => {
      doc.fillColor('#5b6b7b').font('Helvetica').fontSize(10.5).text(row.label, LEFT + 14, ry);
      doc.fillColor('#0c2238').font('Helvetica-Bold').fontSize(10.5).text(row.value, LEFT + 14, ry, { width: RIGHT - LEFT - 28, align: 'right' });
      ry += rowH;
    });
    doc.y = boxTop + boxH + 9;
  }

  if (d.validity) {
    doc.fillColor('#444444').font('Helvetica').fontSize(11.5).text(d.validity, LEFT, doc.y, { width: RIGHT - LEFT, lineGap: 2.5 });
    doc.moveDown(0.55);
  }

  doc.moveDown(0.55);
  doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(d.closing, LEFT, doc.y);

  // Signature above the name: constrain to a signature-sized box (never wider than
  // the text column) and keep it and the name together on one page.
  let signaturePlaced = false;
  if (signatureBuf) {
    try {
      const img = doc.openImage(signatureBuf);
      const maxH = 50;
      const maxW = 250;
      const scale = Math.min(maxH / img.height, maxW / img.width, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      // Page-break if the signature + name wouldn't fit above the footer.
      if (doc.y + drawH + 24 > PAGE_H - FOOTER_H - 8) doc.addPage();
      doc.moveDown(0.2);
      doc.image(signatureBuf, LEFT, doc.y, { width: drawW, height: drawH });
      doc.y += drawH + 2;
      signaturePlaced = true;
    } catch {
      /* signature optional — fall back to the plain name spacing */
    }
  }
  if (!signaturePlaced) doc.moveDown(0.4);
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(15.5).text(officer.name || lender.name || 'Your Loan Officer', LEFT, doc.y);
  doc.fillColor('#5b6b7b').font('Helvetica').fontSize(11.5).text(officer.title || 'Mortgage Loan Officer', LEFT, doc.y);
  if (agent && agent.name) {
    doc.moveDown(0.35);
    doc.fillColor('#5b6b7b').font('Helvetica-Oblique').fontSize(10.5).text(
      `Prepared in partnership with ${agent.name}${agent.brokerage ? `, ${agent.brokerage}` : ''}${agent.phone ? ` · ${agent.phone}` : ''}.`,
      LEFT,
      doc.y,
      { width: RIGHT - LEFT },
    );
  }
}
