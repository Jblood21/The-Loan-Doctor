import { describe, it, expect } from 'vitest';
import { buildPreApprovalLetter } from './letter';
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

  it('pre-approved: verified docs wording', () => {
    const l = letterFor('preapproval');
    expect(l.reLine).toBe('Pre-Approval for John Smith');
    expect(l.paragraphs[0]).toContain('is pre-approved for the purchase');
    expect(l.paragraphs[1]).toContain('provided income and asset documentation');
    expect(l.validity).toContain('This pre-approval is valid through');
    expect(l.paragraphs[3]).toBe('Please contact me with any questions regarding this pre-approval.');
  });

  it('pre-underwritten: underwriter-reviewed wording', () => {
    const l = letterFor('preunderwritten');
    expect(l.reLine).toBe('Underwritten Pre-Approval for John Smith');
    expect(l.paragraphs[0]).toContain('fully underwritten and conditionally approved');
    expect(l.paragraphs[1]).toContain('full underwriting review');
    expect(l.validity).toContain('This underwritten pre-approval is valid through');
  });

  it('pre-qualified: stated (unverified) wording', () => {
    const l = letterFor('prequalified');
    expect(l.reLine).toBe('Pre-Qualification for John Smith');
    expect(l.paragraphs[0]).toContain('is pre-qualified for the purchase');
    expect(l.paragraphs[1]).toContain('have not yet been verified');
    expect(l.validity).toContain('This pre-qualification is valid through');
  });

  it('a refinance keeps the selected kind verb', () => {
    const refi = { ...scenario, transaction: 'refinance' } as unknown as Scenario;
    const l = buildPreApprovalLetter(refi, settings, { borrowerName: 'John Smith', includeAgent: false, kind: 'prequalified' });
    expect(l.paragraphs[0]).toContain('is pre-qualified to refinance');
  });
});
