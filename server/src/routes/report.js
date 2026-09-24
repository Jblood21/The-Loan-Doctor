import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { requireAuth } from '../auth.js';

const router = Router();

// Summit Home Loans brand palette.
const NAVY = '#13355f';
const STEEL = '#5f7fa8';
const INK = '#1b2733';
const MUTED = '#5b6b7b';
// Surface tints used for cards, bands, and zebra rows.
const HERO_BG = '#eef3fb'; // headline KPI card
const BAND_BG = '#e9eff7'; // section header band
const PANEL_BG = '#f6f8fb'; // assumptions grid
const ZEBRA_BG = '#f4f7fb'; // alternating table rows
const HAIRLINE = '#e7ecf2'; // row dividers
// Sequential navy palette for donut slices / bars.
const CHART_COLORS = ['#13355f', '#3f6699', '#6f93c0', '#a9c2de', '#5f7fa8', '#88a7c8'];
const GAUGE_OK = '#2f7d5b'; // fill at or under the limit
const GAUGE_OVER = '#c0552f'; // fill over the limit
const LEFT = 56;
const RIGHT = 556;
const PAGE_W = 612;
const PAGE_H = 792;
const BOTTOM = 720; // content stops here; footer sits below
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
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const hex = (v) => (typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : '');

/** Coerce/cap a section's optional chart (donut / bars / gauge) to safe values. */
function parseChart(raw) {
  const c = obj(raw);
  const type = c.type === 'donut' || c.type === 'bars' || c.type === 'gauge' ? c.type : null;
  if (!type) return null;
  const title = str(c.title).slice(0, 80);
  if (type === 'gauge') {
    const gauges = arr(c.gauges)
      .slice(0, 6)
      .map((g) => {
        const o = obj(g);
        return {
          label: str(o.label).slice(0, 60),
          value: num(o.value),
          display: str(o.display).slice(0, 24),
          limit: o.limit == null ? null : num(o.limit),
          limitLabel: str(o.limitLabel).slice(0, 40),
        };
      })
      .filter((g) => g.label);
    return gauges.length ? { type, title, gauges } : null;
  }
  const data = arr(c.data)
    .slice(0, 8)
    .map((d) => {
      const o = obj(d);
      return { label: str(o.label).slice(0, 60), value: num(o.value), display: str(o.display).slice(0, 24), color: hex(o.color) };
    })
    .filter((d) => d.label);
  if (!data.length) return null;
  const ctr = obj(c.center);
  const center = c.center ? { label: str(ctr.label).slice(0, 40), value: str(ctr.value).slice(0, 24) } : null;
  return { type, title, data, center };
}

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

/** Coerce/cap the client's report sections + preparedFor to safe values. Shared by the
 *  loan-officer route and the agent route (each supplies its own branding). */
export function parseReportSections(body) {
  const b = body && typeof body === 'object' ? body : {};
  const preparedFor = str(b.preparedFor).slice(0, 120);
  const sections = arr(b.sections)
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
        inputs: arr(sec.inputs).slice(0, 20).map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        rows: arr(sec.rows).slice(0, 40).map((l) => ({ label: str(obj(l).label), value: str(obj(l).value) })),
        table,
        chart: parseChart(sec.chart),
      };
    });
  return { preparedFor, sections };
}

/** Stream a report PDF to `res` with the given branding + already-parsed sections. */
export function streamReportPdf(res, { preparedFor, officer, lender, logoBuf, sections }) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 60, left: LEFT, right: LEFT } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="loan-analysis-report.pdf"`);
  doc.pipe(res);
  renderReport(doc, { preparedFor, officer, lender, logoBuf, sections });
  doc.end();
}

router.post('/pdf', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { preparedFor, sections } = parseReportSections(body);
  streamReportPdf(res, {
    preparedFor,
    officer: obj(body.officer),
    lender: obj(body.lender),
    logoBuf: decodeDataUrl(body.logo),
    sections,
  });
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
    chart: sec.chart
      ? {
          type: sec.chart.type,
          title: C(sec.chart.title),
          center: sec.chart.center ? { label: C(sec.chart.center.label), value: C(sec.chart.center.value) } : null,
          data: (sec.chart.data || []).map((d) => ({ label: C(d.label), value: Number(d.value) || 0, display: C(d.display), color: typeof d.color === 'string' ? d.color : '' })),
          gauges: (sec.chart.gauges || []).map((g) => ({
            label: C(g.label),
            value: Number(g.value) || 0,
            display: C(g.display),
            limit: g.limit == null ? null : Number(g.limit) || 0,
            limitLabel: C(g.limitLabel),
          })),
        }
      : null,
  }));

  const phoneEmail = [lender.phone, lender.email].filter(Boolean).join('   ·   ');
  const nmlsLine = [lender.nmls ? `NMLS# ${lender.nmls}` : '', lender.website || '', lender.address || '']
    .filter(Boolean)
    .join('   ·   ');

  let pageNo = 1;
  function drawFooter() {
    const savedY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // footer sits in the bottom margin; don't let it paginate
    doc.save();
    const top = PAGE_H - 52;
    // Two-tone rule to match the header accent.
    doc.moveTo(LEFT, top).lineTo(RIGHT, top).lineWidth(1).strokeColor('#d4dae3').stroke();
    doc.moveTo(LEFT, top).lineTo(LEFT + 70, top).lineWidth(2).strokeColor(NAVY).stroke();
    let ty = top + 8;
    const center = (text, color, font, size) => {
      if (!text) return;
      doc.fillColor(color).font(font).fontSize(size).text(text, LEFT, ty, { width: RIGHT - LEFT, align: 'center', lineBreak: false });
      ty += size + 3;
    };
    center(phoneEmail, NAVY, 'Helvetica-Bold', 9.5);
    center(nmlsLine, STEEL, 'Helvetica', 8.5);
    center(`Page ${pageNo}`, '#9aa7b5', 'Helvetica', 8);
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

  const titleY = y + (logoBuf ? 50 : 4);
  doc.fillColor(STEEL).font('Helvetica-Bold').fontSize(8.5).text('MORTGAGE ANALYSIS', LEFT, titleY, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(21).text('Loan Analysis Report', LEFT, titleY + 12, { lineBreak: false });
  y = titleY + 12 + 28;

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
  y += 5;
  // Two-tone divider: a full light rule with a short navy accent on the left.
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor('#d4dae3').stroke();
  doc.moveTo(LEFT, y).lineTo(LEFT + 96, y).lineWidth(2.5).strokeColor(NAVY).stroke();
  y += 24;

  drawFooter();
  doc.on('pageAdded', () => {
    pageNo += 1;
    y = CONT_TOP;
    drawFooter();
  });

  const ensure = (h) => {
    if (y + h > BOTTOM) doc.addPage();
  };

  sections.forEach((sec, idx) => {
    if (idx > 0) y += 12;
    // --- Section header: navy-tint band with a rounded left accent + navy title ---
    const bandH = 26;
    // Keep the band with at least the first block below it on the same page.
    ensure(bandH + 20 + (sec.headline ? 56 : 0));
    doc.save();
    doc.roundedRect(LEFT, y, contentW, bandH, 5).fill(BAND_BG);
    doc.roundedRect(LEFT, y + 4, 3.5, bandH - 8, 1.75).fill(NAVY); // left accent
    doc.restore();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12.5).text(sec.title, LEFT + 15, y + 7.5, { lineBreak: false });
    // Only show the band subtitle when it adds something the headline sub doesn't repeat.
    const bandSub = sec.subtitle && sec.subtitle !== (sec.headline && sec.headline.sub) ? sec.subtitle : '';
    if (bandSub) {
      doc.fillColor(STEEL).font('Helvetica').fontSize(8.5).text(bandSub, LEFT + 15, y + 9.5, { width: contentW - 30, align: 'right', lineBreak: false });
    }
    y += bandH + 14;

    // --- Headline KPI card ---
    if (sec.headline && (sec.headline.value || sec.headline.label)) {
      const hasLabel = !!sec.headline.label;
      const hasSub = !!sec.headline.sub;
      const cardH = 12 + (hasLabel ? 12 : 0) + 26 + (hasSub ? 13 : 0) + 2;
      ensure(cardH + 4);
      const top = y;
      doc.save();
      doc.roundedRect(LEFT, top, contentW, cardH, 6).fill(HERO_BG);
      doc.roundedRect(LEFT, top + 5, 3.5, cardH - 10, 1.75).fill(STEEL);
      doc.restore();
      let hy = top + 12;
      if (hasLabel) {
        doc.fillColor('#7d8ea3').font('Helvetica-Bold').fontSize(8).text(sec.headline.label.toUpperCase(), LEFT + 16, hy, { characterSpacing: 0.8, lineBreak: false });
        hy += 12;
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text(sec.headline.value, LEFT + 16, hy, { lineBreak: false });
      hy += 26;
      if (hasSub) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(sec.headline.sub, LEFT + 16, hy, { width: contentW - 32, lineBreak: false });
      }
      y = top + cardH + 14;
    }

    // --- Chart (donut / bars / gauge) ---
    if (sec.chart) {
      y = drawChart(doc, y, sec.chart);
    }

    // --- Assumptions panel (two-column key/value grid) ---
    if (sec.inputs.length) {
      const gap = 18;
      const colW = (contentW - gap) / 2;
      const nRows = Math.ceil(sec.inputs.length / 2);
      const cellH = 15;
      const padTop = 10;
      const padBot = 10;
      doc.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text('ASSUMPTIONS', LEFT, y, { characterSpacing: 0.8, lineBreak: false });
      y += 12;
      const boxH = padTop + nRows * cellH + padBot - 4;
      ensure(boxH + 4);
      const bTop = y;
      doc.save();
      doc.roundedRect(LEFT, bTop, contentW, boxH, 5).fill(PANEL_BG);
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
      y = bTop + boxH + 14;
    }

    // --- Multi-column comparison table (e.g. Rate Buydown) ---
    if (sec.table) {
      const tcols = sec.table.columns;
      const nC = Math.max(1, tcols.length);
      const labelColW = contentW * 0.32;
      const cW = (contentW - labelColW) / nC;
      const cX = (i) => LEFT + labelColW + i * cW;
      const headH = 22;
      ensure(headH + 20);
      // Header row: solid navy bar with white column labels.
      doc.save();
      doc.roundedRect(LEFT, y, contentW, headH, 4).fill(NAVY);
      doc.restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      tcols.forEach((c, i) => doc.text(c, cX(i) + 2, y + 7, { width: cW - 4, align: 'center', lineBreak: false }));
      y += headH;
      sec.table.rows.forEach((r, ri) => {
        const rowH = 19;
        ensure(rowH);
        const rowY = y;
        if (ri % 2 === 1) {
          doc.save();
          doc.rect(LEFT, rowY, contentW, rowH).fill(ZEBRA_BG);
          doc.restore();
        }
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(r.label, LEFT + 10, rowY + 5, { width: labelColW - 14, lineBreak: false });
        r.cells.forEach((cell, i) =>
          doc.fillColor('#33414f').font('Helvetica').fontSize(9).text(cell, cX(i) + 2, rowY + 5, { width: cW - 4, align: 'center', lineBreak: false }),
        );
        y = rowY + rowH;
      });
      // Close the table with a hairline.
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#d9e0ea').stroke();
    } else {
      // --- Result rows (the last "total"-style row gets a framed emphasis) ---
      sec.rows.forEach((row, i) => {
        const isTotal = i === sec.rows.length - 1 && sec.rows.length > 1 && /total|net|payment|savings|proceeds/i.test(row.label);
        const rowH = isTotal ? 24 : 21;
        ensure(rowH);
        const rowY = y;
        if (isTotal) {
          doc.save();
          doc.roundedRect(LEFT, rowY, contentW, rowH, 4).fill(HERO_BG);
          doc.restore();
        }
        const pad = isTotal ? 12 : 0;
        doc.fillColor(isTotal ? NAVY : '#33414f').font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 11 : 10.5).text(row.label, LEFT + pad, rowY + (isTotal ? 6 : 4), { width: contentW * 0.6, lineBreak: false });
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(isTotal ? 12 : 10.5).text(row.value, LEFT, rowY + (isTotal ? 6 : 4), { width: contentW - pad, align: 'right', lineBreak: false });
        y = rowY + rowH;
        if (!isTotal && i < sec.rows.length - 1) {
          doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
        }
      });
    }

    y += 18;
  });

  if (!sections.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('No tools were added to this report.', LEFT, y);
  }
}

// ---- Native chart rendering (no external chart library) ----

const CONTENT_W = RIGHT - LEFT;

/** Total vertical space a chart block needs, so it can be kept off a page edge. */
function chartHeight(chart) {
  const t = chart.title ? 16 : 4;
  if (chart.type === 'donut') return t + Math.max(96, (chart.data || []).length * 15) + 8;
  if (chart.type === 'bars') return t + 12 + 84 + 6 + 14 + 6;
  if (chart.type === 'gauge') return t + (chart.gauges || []).length * 42 + 4;
  return 0;
}

/** Draw a chart at `y`, paginating first if it wouldn't fit; returns the new y. */
function drawChart(doc, y, chart) {
  const H = chartHeight(chart);
  if (y + H > BOTTOM) {
    doc.addPage();
    y = CONT_TOP;
  }
  let top = y;
  if (chart.title) {
    doc.fillColor('#9aa7b5').font('Helvetica-Bold').fontSize(7.5).text(chart.title.toUpperCase(), LEFT, top, { characterSpacing: 0.8, lineBreak: false });
    top += 16;
  } else {
    top += 4;
  }
  if (chart.type === 'donut') drawDonut(doc, top, chart);
  else if (chart.type === 'bars') drawBars(doc, top, chart);
  else if (chart.type === 'gauge') drawGauges(doc, top, chart);
  return y + H;
}

function drawDonut(doc, top, chart) {
  const slices = (chart.data || []).filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const outerR = 46;
  const innerR = 28;
  const cx = LEFT + 6 + outerR;
  const cy = top + outerR;
  let a0 = -Math.PI / 2;
  slices.forEach((d, i) => {
    const a1 = a0 + (d.value / total) * Math.PI * 2;
    const col = d.color || CHART_COLORS[i % CHART_COLORS.length];
    const steps = Math.max(2, Math.ceil(((a1 - a0) / Math.PI) * 60));
    doc.save();
    doc.moveTo(cx, cy);
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (a1 - a0) * (s / steps);
      doc.lineTo(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a));
    }
    doc.closePath().fill(col);
    doc.restore();
    a0 = a1;
  });
  // Punch the hole (report background is white).
  doc.circle(cx, cy, innerR).fill('#ffffff');
  if (chart.center && (chart.center.value || chart.center.label)) {
    if (chart.center.label) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(chart.center.label.toUpperCase(), cx - innerR - 6, cy - 11, { width: (innerR + 6) * 2, align: 'center', characterSpacing: 0.3, lineBreak: false });
    }
    if (chart.center.value) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(chart.center.value, cx - innerR - 8, cy - 1, { width: (innerR + 8) * 2, align: 'center', lineBreak: false });
    }
  }
  // Legend (uses the full slice list, including zero-value ones for context).
  const lx = cx + outerR + 22;
  const lw = RIGHT - lx;
  const rows = chart.data || [];
  let ly = cy - (rows.length * 15) / 2 + 1;
  if (ly < top) ly = top;
  rows.forEach((d, i) => {
    const col = d.color || CHART_COLORS[i % CHART_COLORS.length];
    doc.save();
    doc.roundedRect(lx, ly + 1.5, 9, 9, 2).fill(col);
    doc.restore();
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(d.label, lx + 15, ly + 1.5, { width: lw - 95, lineBreak: false });
    if (d.display) doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(d.display, lx, ly + 1.5, { width: lw, align: 'right', lineBreak: false });
    ly += 15;
  });
}

function drawBars(doc, top, chart) {
  const data = chart.data || [];
  const n = Math.max(1, data.length);
  const maxV = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const minV = Math.min(...data.map((d) => Math.abs(d.value)));
  const barMaxH = 84;
  const barsTop = top + 12; // headroom for the value labels above each bar
  const baseY = barsTop + barMaxH;
  const slot = CONTENT_W / n;
  const bw = Math.min(88, slot * 0.5);
  doc.moveTo(LEFT, baseY).lineTo(RIGHT, baseY).lineWidth(0.8).strokeColor('#d9e0ea').stroke();
  data.forEach((d, i) => {
    const h = Math.max(2, (Math.abs(d.value) / maxV) * barMaxH);
    const slotCenter = LEFT + slot * i + slot / 2;
    const x = slotCenter - bw / 2;
    const yTop = baseY - h;
    // Emphasize the lowest bar (usually the best option); others in steel.
    const col = d.color || (Math.abs(d.value) === minV ? NAVY : STEEL);
    const r = Math.min(3, h / 2);
    doc.save();
    doc.roundedRect(x, yTop, bw, h, r).fill(col);
    doc.restore();
    if (d.display) doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(d.display, slotCenter - slot / 2, yTop - 12, { width: slot, align: 'center', lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(d.label, slotCenter - slot / 2, baseY + 5, { width: slot, align: 'center', lineBreak: false });
  });
}

function drawGauges(doc, top, chart) {
  const gauges = chart.gauges || [];
  const scale = Math.max(50, ...gauges.map((g) => Math.max(g.value, g.limit || 0))) * 1.25;
  const trackH = 11;
  let gy = top;
  gauges.forEach((g) => {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(g.label, LEFT, gy, { width: CONTENT_W * 0.7, lineBreak: false });
    if (g.display) doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text(g.display, LEFT, gy, { width: CONTENT_W, align: 'right', lineBreak: false });
    gy += 14;
    doc.save();
    doc.roundedRect(LEFT, gy, CONTENT_W, trackH, 5).fill('#e9eef4');
    doc.restore();
    const over = g.limit != null && g.value > g.limit;
    const fillW = Math.max(3, Math.min(1, g.value / scale) * CONTENT_W);
    doc.save();
    doc.roundedRect(LEFT, gy, fillW, trackH, Math.min(5, fillW / 2)).fill(over ? GAUGE_OVER : GAUGE_OK);
    doc.restore();
    if (g.limit != null) {
      const mx = LEFT + Math.min(1, g.limit / scale) * CONTENT_W;
      doc.moveTo(mx, gy - 2).lineTo(mx, gy + trackH + 2).lineWidth(1.2).strokeColor(NAVY).stroke();
    }
    gy += trackH + 3;
    if (g.limitLabel) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(g.limitLabel, LEFT, gy, { width: CONTENT_W, lineBreak: false });
    }
    gy += 12;
  });
}

export default router;
