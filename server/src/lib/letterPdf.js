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
 *     validity, closing, officer, lender, agentAck }
 */
/** Draw the Equal Housing Lender mark (a house with an equals sign) at (x, y), scaled to
 *  width `w`. `house` fills the house; `cut` draws the equals sign as a cut-out. Returns
 *  the symbol's height so callers can place a caption beneath it. */
function drawEqualHousing(doc, x, y, w, house, cut) {
  const u = w / 40;
  doc.save();
  doc.moveTo(x + 20 * u, y + 2 * u).lineTo(x + 2 * u, y + 15 * u).lineTo(x + 38 * u, y + 15 * u).closePath().fill(house);
  doc.rect(x + 7 * u, y + 15 * u, 26 * u, 20 * u).fill(house);
  doc.rect(x + 12 * u, y + 20 * u, 16 * u, 3.4 * u).fill(cut);
  doc.rect(x + 12 * u, y + 27 * u, 16 * u, 3.4 * u).fill(cut);
  doc.restore();
  return 35 * u;
}

export function drawLetter(doc, d) {
  const { classic, showHeadshot, headshotSource, logoSource, signatureBuf } = d;
  const lender = d.lender || {};
  const officer = d.officer || {};

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
      if (lender.name) center(lender.name, GREEN, 'Helvetica-Bold', 11);
      if (lender.address) center(lender.address, '#3a4a3a');
      if (phoneEmail) center(phoneEmail, '#3a4a3a');
      center(nmlsLine, GOLD, 'Helvetica-Bold');
      // Equal Housing Lender mark, right of the centered contact block.
      const ehX = RIGHT - 28;
      const ehY = top + 12;
      const ehH = drawEqualHousing(doc, ehX, ehY, 22, GREEN, '#ffffff');
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(5.2).text('EQUAL HOUSING\nLENDER', ehX - 22, ehY + ehH + 2, { width: 66, align: 'center', lineGap: 0.5 });
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
      if (lender.name) line(lender.name, '#ffffff', 'Helvetica-Bold', 11);
      if (lender.address) line(lender.address, '#dfeae0');
      if (phoneEmail) line(phoneEmail, '#dfeae0');
      line(nmlsLine, GOLD, 'Helvetica-Bold', 11);
      // Equal Housing Lender mark at the right of the navy band (white house, navy cut-out).
      const ehX = RIGHT - 26;
      const ehY = bandY + 26;
      const ehH = drawEqualHousing(doc, ehX, ehY, 22, '#ffffff', GREEN);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(5.2).text('EQUAL HOUSING\nLENDER', ehX - 22, ehY + ehH + 2, { width: 66, align: 'center', lineGap: 0.5 });
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
  // The body is laid out as a measured sequence of blocks separated by gaps. Short
  // letters (the common case: no terms table, no validity line) used to end well above
  // the footer, leaving a large blank gap. So we measure the whole body first, then
  // spread the leftover vertical space evenly across the flexible gaps to fill the page.
  // Long letters that overflow one page keep their normal spacing and paginate.
  const CW = RIGHT - LEFT; // content width
  const REX = LEFT + 36; // "RE:" label column
  const bodyTop = doc.y; // 136, just under the letterhead rule
  const fillBottom = PAGE_H - FOOTER_H - 30; // fill to here, keeping breathing room above the footer
  const pageBottom = PAGE_H - FOOTER_H - 8; // hard limit before a page break
  const topMargin = 56;

  const measure = (text, font, size, opts = {}) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text || '', { width: CW, ...opts });
  };

  const seq = [];
  const block = (h, render) => seq.push({ block: true, h, render });
  const gap = (base, flex = false) => seq.push({ base, flex });

  if (d.title) {
    block(measure(d.title, 'Helvetica-Bold', 17, { align: 'center' }), (y) =>
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(17).text(d.title, LEFT, y, { width: CW, align: 'center' }),
    );
    gap(8);
  }

  block(measure(d.date, 'Helvetica', 11.5), (y) => doc.fillColor('#555555').font('Helvetica').fontSize(11.5).text(d.date, LEFT, y));
  gap(14, true);

  // RE line + subject address share the same left indent (REX).
  const reH = measure(d.reLine, 'Helvetica', 12.5, { width: RIGHT - REX });
  const addrH = d.subjectAddress ? measure(d.subjectAddress, 'Helvetica-Bold', 12.5, { width: RIGHT - REX }) : 0;
  block(reH + addrH, (y) => {
    doc.fillColor('#1b2733').font('Helvetica-Bold').fontSize(12.5).text('RE:', LEFT, y);
    doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(d.reLine, REX, y, { width: RIGHT - REX });
    if (d.subjectAddress) doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12.5).text(d.subjectAddress, REX, y + reH, { width: RIGHT - REX });
  });
  gap(14, true);

  if (d.agentAck) {
    block(measure(`Real Estate Agent: ${d.agentAck}`, 'Helvetica-Bold', 11.5), (y) => {
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(11.5).text('Real Estate Agent: ', LEFT, y, { continued: true });
      doc.fillColor('#1b2733').font('Helvetica').fontSize(11.5).text(d.agentAck);
    });
    gap(14, true);
  }

  block(measure(d.salutation, 'Helvetica', 12.5), (y) => doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(d.salutation, LEFT, y));
  gap(10, true);

  (Array.isArray(d.paragraphs) ? d.paragraphs : []).forEach((p) => {
    block(measure(p, 'Helvetica', 12.5, { lineGap: 3 }), (y) =>
      doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(p, LEFT, y, { width: CW, lineGap: 3 }),
    );
    gap(9, true);
  });

  if (Array.isArray(d.terms) && d.terms.length) {
    const rowH = 17;
    const padY = 8;
    const boxH = d.terms.length * rowH + padY * 2;
    block(boxH, (y) => {
      doc.save();
      doc.roundedRect(LEFT, y, CW, boxH, 6).fill('#f4f6f9');
      doc.restore();
      let ry = y + padY + 1;
      d.terms.forEach((row) => {
        doc.fillColor('#5b6b7b').font('Helvetica').fontSize(10.5).text(row.label, LEFT + 14, ry);
        doc.fillColor('#0c2238').font('Helvetica-Bold').fontSize(10.5).text(row.value, LEFT + 14, ry, { width: CW - 28, align: 'right' });
        ry += rowH;
      });
    });
    gap(12, true);
  }

  if (d.validity) {
    block(measure(d.validity, 'Helvetica', 11.5, { lineGap: 2.5 }), (y) =>
      doc.fillColor('#444444').font('Helvetica').fontSize(11.5).text(d.validity, LEFT, y, { width: CW, lineGap: 2.5 }),
    );
    gap(10, true);
  }

  block(measure(d.closing, 'Helvetica', 12.5), (y) => doc.fillColor('#1b2733').font('Helvetica').fontSize(12.5).text(d.closing, LEFT, y));
  gap(6);

  // Signature image above the officer name (kept tight to the name — not a flexible gap).
  if (signatureBuf) {
    try {
      const img = doc.openImage(signatureBuf);
      const scale = Math.min(50 / img.height, 250 / img.width, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      block(drawH, (y) => doc.image(signatureBuf, LEFT, y, { width: drawW, height: drawH }));
      gap(2);
    } catch {
      /* signature optional */
    }
  }

  block(measure(officer.name || lender.name || 'Your Loan Officer', 'Helvetica-Bold', 15.5), (y) =>
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(15.5).text(officer.name || lender.name || 'Your Loan Officer', LEFT, y),
  );
  gap(1);
  block(measure(officer.title || 'Mortgage Loan Officer', 'Helvetica', 11.5), (y) =>
    doc.fillColor('#5b6b7b').font('Helvetica').fontSize(11.5).text(officer.title || 'Mortgage Loan Officer', LEFT, y),
  );
  // NMLS number under the job title.
  if (officer.nmls) {
    gap(1);
    block(measure(`NMLS# ${officer.nmls}`, 'Helvetica', 11), (y) =>
      doc.fillColor('#5b6b7b').font('Helvetica').fontSize(11).text(`NMLS# ${officer.nmls}`, LEFT, y),
    );
  }

  // Decide single-page up front: if the whole body fits, draw it on one page and never
  // break (measurement drift on the last line must not spill a fitting letter onto page 2).
  // When it fits, spread the leftover space across the flexible gaps to fill the page.
  const contentH = seq.reduce((s, e) => s + (e.block ? e.h : e.base), 0);
  const flexCount = seq.filter((e) => e.flex).length;
  // A letter counts as single-page as long as it ends by the footer band's top edge
  // (matching the original tight one-page fit); only genuinely longer letters paginate.
  const singlePage = contentH <= PAGE_H - FOOTER_H - bodyTop;
  const slack = fillBottom - bodyTop - contentH;
  const extra = singlePage && slack > 0 && flexCount > 0 ? Math.min(slack / flexCount, 42) : 0;

  let y = bodyTop;
  for (const e of seq) {
    if (e.block) {
      if (!singlePage && y + e.h > pageBottom && y > topMargin + 1) {
        doc.addPage();
        y = topMargin;
      }
      e.render(y);
      y += e.h;
    } else {
      y += e.base + (e.flex ? extra : 0);
    }
  }
  doc.y = y;
}
