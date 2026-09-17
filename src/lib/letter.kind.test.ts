import { describe, it, expect } from 'vitest';
import { buildPreApprovalLetter, creditAdjective } from './letter';
import type { LetterKind } from './letter';
import type { Scenario, Settings } from '@/types';

const scenario = {
  loanType: 'conventional',
  transaction: 'purchase',
  borrowers: '1',
  homePrice: 450000,
  downPayment: 22500,
  rate: 6.5,
  term: '30',
  credit: '740',
} as unknown as Scenario;

const settings = { name: 'Alan Blood', officerTitle: 'Mortgage Loan Officer' } as unknown as Settings;

function letterFor(kind: LetterKind) {
  return buildPreApprovalLetter(scenario, settings, {
    borrowerName: 'John Smith',
    propertyAddress: '123 Main St',
    includeAgent: false,
    kind,
    showValidity: true,
    now: new Date('2026-09-04T12:00:00Z'),
  });
}

describe('pre-approval letter kinds', () => {
  it('defaults to standard pre-approval wording', () => {
    const l = buildPreApprovalLetter(scenario, settings, { borrowerName: 'John Smith', includeAgent: false });
    expect(l.reLine).toBe('Pre-Approval for John Smith');
    expect(l.paragraphs[0]).toContain('is pre-approved for the purchase');
  });

  it('pre-approved: docs reviewed, underwriting still ahead', () => {
    const l = letterFor('preapproval');
    expect(l.reLine).toBe('Pre-Approval for John Smith');
    expect(l.paragraphs[0]).toContain('is pre-approved for the purchase');
    expect(l.paragraphs[1]).toContain('provided income and asset documentation');
    // Underwriting has not happened yet — the file is still to be submitted.
    expect(l.paragraphs[2]).toContain('once the file is submitted to underwriting');
    expect(l.validity).toContain('This pre-approval is valid through');
    expect(l.validity).toContain('final underwriting approval');
    expect(l.paragraphs[3]).toBe('Please contact me with any questions regarding this pre-approval.');
  });

  it('pre-underwritten: underwriter already reviewed, no further income/asset review', () => {
    const l = letterFor('preunderwritten');
    expect(l.reLine).toBe('Underwritten Pre-Approval for John Smith');
    expect(l.paragraphs[0]).toContain('fully underwritten and conditionally approved');
    expect(l.paragraphs[1]).toContain('complete underwriting review');
    expect(l.paragraphs[1]).toContain('not to a further review of income, assets, or credit');
    expect(l.paragraphs[2]).toContain('already been underwritten');
    // Must NOT claim underwriting is still pending — it's done.
    expect(l.validity).toContain('remaining underwriting conditions');
    expect(l.validity).not.toContain('final underwriting approval');
  });

  it('pre-qualified: stated info, not verified or underwritten', () => {
    const l = letterFor('prequalified');
    expect(l.reLine).toBe('Pre-Qualification for John Smith');
    expect(l.paragraphs[0]).toContain('is pre-qualified for the purchase');
    expect(l.paragraphs[1]).toContain('have not yet been verified');
    expect(l.paragraphs[1]).toContain('reviewed by an underwriter');
    // Everything is still ahead: verification AND underwriting.
    expect(l.validity).toContain('verification of the borrower');
    expect(l.validity).toContain('full underwriting approval');
  });

  it('a refinance keeps the selected kind verb', () => {
    const refi = { ...scenario, transaction: 'refinance' } as unknown as Scenario;
    const l = buildPreApprovalLetter(refi, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'prequalified' });
    expect(l.paragraphs[0]).toContain('is pre-qualified to refinance');
  });
});

describe('credit adjective bands', () => {
  it('maps FICO scores to good / great / fantastic', () => {
    expect(creditAdjective(699)).toBe('good');
    expect(creditAdjective(739)).toBe('good');
    expect(creditAdjective(740)).toBe('great');
    expect(creditAdjective(799)).toBe('great');
    expect(creditAdjective(800)).toBe('fantastic');
    expect(creditAdjective(810)).toBe('fantastic');
  });

  it('falls back to "strong" when no usable score is given', () => {
    expect(creditAdjective('')).toBe('strong');
    expect(creditAdjective(undefined)).toBe('strong');
    expect(creditAdjective('n/a')).toBe('strong');
    expect(creditAdjective(0)).toBe('strong');
  });

  it('accepts numeric strings', () => {
    expect(creditAdjective('742')).toBe('great');
    expect(creditAdjective('803')).toBe('fantastic');
  });
});

describe('credit score in the letter body', () => {
  // Scenario with no credit band so the score comes solely from the options.
  const noBand = { ...scenario, credit: '' } as unknown as Scenario;

  it('with no score, preapproval keeps "strong" and the others carry no adjective', () => {
    const pa = buildPreApprovalLetter(noBand, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'preapproval' });
    expect(pa.paragraphs[1]).toContain('supported by their strong credit history and credit score');

    const pq = buildPreApprovalLetter(noBand, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'prequalified' });
    expect(pq.paragraphs[1]).toContain('stated income, assets, and credit score');
    expect(pq.paragraphs[1]).not.toContain('strong credit score');
  });

  it('weaves the band adjective in based on the score', () => {
    const great = buildPreApprovalLetter(noBand, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'preapproval', creditScore: 760 });
    expect(great.paragraphs[1]).toContain('supported by their great credit history');

    const fantastic = buildPreApprovalLetter(noBand, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'prequalified', creditScore: 805 });
    expect(fantastic.paragraphs[1]).toContain('assets, and fantastic credit score');
  });

  it('prints the FICO number only when showCreditScore is on', () => {
    const hidden = buildPreApprovalLetter(noBand, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'preapproval', creditScore: 760 });
    expect(hidden.paragraphs[1]).not.toContain('FICO');

    const shown = buildPreApprovalLetter(noBand, settings, {
      borrowerName: 'John Smith',
      includeAgent: false,
      kind: 'preapproval',
      creditScore: 760,
      showCreditScore: true,
    });
    expect(shown.paragraphs[1]).toContain('(FICO 760)');
  });
});
