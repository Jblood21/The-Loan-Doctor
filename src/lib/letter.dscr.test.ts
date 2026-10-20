import { describe, it, expect } from 'vitest';
import { buildPreApprovalLetter, isDscrLetter, LETTER_TEMPLATES } from './letter';
import type { LetterKind } from './letter';
import type { LoanType, Scenario, Settings } from '@/types';

const mk = (loanType: LoanType, over: Partial<Scenario> = {}) =>
  ({
    loanType,
    transaction: 'purchase',
    borrowers: '1',
    homePrice: 450000,
    downPayment: 112500,
    rate: 7.5,
    term: '30',
    credit: '740',
    rentMonthly: 3200,
    ...over,
  }) as unknown as Scenario;

const settings = { name: 'Alan Blood', officerTitle: 'Mortgage Loan Officer' } as unknown as Settings;

function letter(s: Scenario, kind: LetterKind = 'preapproval', over: Record<string, unknown> = {}) {
  return buildPreApprovalLetter(s, settings, {
    borrowerName: 'John Smith',
    propertyAddress: '123 Main St',
    includeAgent: false,
    kind,
    showValidity: true,
    now: new Date('2026-09-04T12:00:00Z'),
    ...over,
  });
}

const KINDS: LetterKind[] = ['preapproval', 'preunderwritten', 'prequalified'];
const body = (l: ReturnType<typeof letter>) => [...l.paragraphs, l.validity].join(' ');

describe('DSCR pre-approval letter', () => {
  it('"Auto" picks the DSCR wording for a DSCR scenario, and the DSCR template picks it for any scenario', () => {
    expect(isDscrLetter('auto', mk('dscr'))).toBe(true);
    expect(isDscrLetter(undefined, mk('dscr'))).toBe(true);
    expect(isDscrLetter('auto', mk('conventional'))).toBe(false);
    expect(isDscrLetter('dscr', mk('conventional'))).toBe(true);
    // An explicit non-DSCR template wins over the loan type.
    expect(isDscrLetter('conventional', mk('dscr'))).toBe(false);
  });

  it('the DSCR template is offered in the picker', () => {
    expect(LETTER_TEMPLATES.map((t) => t.id)).toContain('dscr');
  });

  it('describes an investment property qualified on rental income', () => {
    const l = letter(mk('dscr'));
    expect(l.paragraphs[0]).toContain('pre-approved for the purchase of the investment property located at 123 Main St');
    expect(l.paragraphs[0]).toContain('using DSCR financing');
    expect(l.paragraphs[0]).toContain('rental income rather than personal income');
    expect(l.paragraphs[1]).toContain('rental income the property is expected to produce');
  });

  for (const kind of KINDS) {
    it(`${kind}: never claims the borrower's personal income was verified`, () => {
      const text = body(letter(mk('dscr'), kind));
      expect(text).not.toMatch(/income and credit/i);
      expect(text).not.toMatch(/verify (his|her|their) income/i);
      expect(text).not.toMatch(/income and assets needed/i);
      expect(text).toMatch(/rental income/i);
      expect(text).toMatch(/asset/i); // assets are still verified
    });

    it(`${kind}: the appraisal condition carries a rent analysis, and the validity line agrees`, () => {
      const l = letter(mk('dscr'), kind);
      expect(l.paragraphs[2]).toMatch(/rent analysis/);
      expect(l.validity).toMatch(/rent analysis/);
    });
  }

  it('an appraisal waiver drops the appraisal / rent-analysis condition', () => {
    const l = letter(mk('dscr'), 'preapproval', { appraisalWaiver: true });
    expect(l.paragraphs[2]).not.toMatch(/appraisal/);
    expect(l.validity).not.toMatch(/appraisal/);
    expect(l.validity).toContain('clear title and final underwriting approval');
  });

  it('refinance reads as refinancing the investment property', () => {
    const l = letter(mk('dscr', { transaction: 'refinance' }));
    expect(l.paragraphs[0]).toContain('to refinance the investment property located at 123 Main St');
  });

  it('two borrowers read as plural', () => {
    const l = letter(mk('dscr', { borrowers: '2' }));
    expect(l.paragraphs[0]).toContain(' are pre-approved');
    expect(l.paragraphs[1]).toContain('have provided the documents');
  });

  it('closes by referring to the right approval level', () => {
    expect(letter(mk('dscr'), 'preapproval').paragraphs[3]).toContain("John Smith's pre-approval");
    expect(letter(mk('dscr'), 'prequalified').paragraphs[3]).toContain("credit pre-qualification");
    expect(letter(mk('dscr'), 'preunderwritten').paragraphs[3]).toContain('pre-underwritten pre-approval');
  });

  it('shows the DSCR loan type in the terms table', () => {
    const l = letter(mk('dscr'), 'preapproval', { showTerms: true });
    expect(l.terms!.find((t) => t.label === 'Loan Type')!.value).toBe('DSCR');
  });
});

describe('non-DSCR letters are unchanged', () => {
  it('a conventional letter keeps the income-verification wording', () => {
    const l = letter(mk('conventional'));
    expect(l.paragraphs[0]).toContain('income and credit pre-approved for the purchase of the home');
    expect(l.paragraphs[1]).toContain('verify their income and assets');
    expect(l.paragraphs[3]).toContain("income and credit pre-approval");
    expect(l.validity).toContain('a satisfactory appraisal, clear title');
    expect(body(l)).not.toMatch(/rental income|investment property|rent analysis/);
  });
});
