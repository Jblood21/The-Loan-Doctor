// Server-authoritative regeneration of an assignment's letter payload.
//
// The loan officer stores a letter snapshot plus a small `ctx` when they create an
// assignment. The agent may only change the property address and (when allowed) the
// price. Everything else — loan terms, branding, officer/lender identity — is fixed,
// so we rebuild ONLY the address/price-dependent pieces from the stored template and
// never trust the agent for anything else.

/** Currency format matching the client's fmt() so regenerated numbers read identically. */
export function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

/** Clamp an agent-supplied price to [0, approvedPrice]. */
export function cappedPrice(requested, approvedPrice) {
  const p = Number(requested);
  const cap = Number(approvedPrice) || 0;
  if (!Number.isFinite(p) || p < 0) return 0;
  return Math.min(p, cap);
}

/**
 * Build the letter payload (the `body` streamLetterPdf expects) from a stored
 * assignment, substituting the current property address and price.
 */
export function assignmentLetterPayload(assignment) {
  const letter = assignment.letter && typeof assignment.letter === 'object' ? assignment.letter : {};
  const ctx = assignment.ctx && typeof assignment.ctx === 'object' ? assignment.ctx : {};
  const address = String(assignment.propertyAddress || '').trim();
  const priceStr = fmtMoney(assignment.price);

  // Rebuild the opening paragraph from its template (placeholders inserted at
  // assignment-creation time). Missing placeholders → the replace is a harmless no-op.
  const paragraphs = Array.isArray(letter.paragraphs) ? letter.paragraphs.slice() : [];
  if (ctx.p1Template && paragraphs.length) {
    paragraphs[0] = String(ctx.p1Template).split('{{ADDR}}').join(address).split('{{PRICE}}').join(priceStr);
  }

  // Update the price-driven rows of the terms table (if shown), keeping everything else.
  const loanAmount = Number(ctx.loanAmount) || 0;
  const terms = Array.isArray(letter.terms)
    ? letter.terms.map((t) => {
        if (!t || typeof t !== 'object') return t;
        if (ctx.priceLabel && t.label === ctx.priceLabel) return { ...t, value: priceStr };
        if (ctx.downLabel && t.label === ctx.downLabel && loanAmount) {
          return { ...t, value: fmtMoney(Math.max(0, Number(assignment.price) - loanAmount)) };
        }
        return t;
      })
    : letter.terms;

  return {
    ...letter,
    paragraphs,
    subjectAddress: ctx.showSubjectAddress ? address : '',
    terms,
  };
}
