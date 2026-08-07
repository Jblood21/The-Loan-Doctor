import { describe, it, expect } from 'vitest';
import { mapLoanType, losBorrowerToScenario, parseNum } from './losBorrower';
import type { Scenario } from '@/types';

const base: Scenario = {
  name: 'Base',
  transaction: 'purchase',
  borrowers: '1',
  loanType: 'conventional',
  program: 'standard',
  homePrice: 300000,
  downPayment: 60000,
  downPct: 20,
  rate: 6.5,
  term: '30',
  credit: '740',
  lenderCredit: 0,
  sellerCredit: 0,
  otherCredits: 0,
};

describe('parseNum', () => {
  it('strips currency/percent formatting', () => {
    expect(parseNum('$415,000')).toBe(415000);
    expect(parseNum('6.375%')).toBe(6.375);
    expect(parseNum('')).toBe(0); // Number('') is 0; the callers guard with > 0
    expect(parseNum('n/a')).toBe(0);
  });
});

describe('mapLoanType', () => {
  it('maps common program strings', () => {
    expect(mapLoanType('FHA')).toBe('fha');
    expect(mapLoanType('VA Loan')).toBe('va');
    expect(mapLoanType('USDA Rural')).toBe('usda');
    expect(mapLoanType('5/1 ARM')).toBe('arm');
    expect(mapLoanType('Conventional')).toBe('conventional');
    expect(mapLoanType('Conforming 30yr')).toBe('conventional');
  });
  it('returns null for unknown/empty', () => {
    expect(mapLoanType('')).toBeNull();
    expect(mapLoanType('jumbo-ish thing')).toBeNull();
  });
});

describe('losBorrowerToScenario', () => {
  it('uses the feed amount as the exact loan amount (baseLoan = amount)', () => {
    const r = losBorrowerToScenario({ name: 'Jane', amount: '$415,000', loanType: 'FHA', purpose: 'Purchase', rate: '6.375%' }, base)!;
    expect(r.scenario.loanType).toBe('fha');
    expect(r.scenario.transaction).toBe('purchase');
    expect(r.scenario.rate).toBe(6.375);
    // homePrice − downPayment must equal the pushed loan amount
    expect(r.scenario.homePrice - r.scenario.downPayment).toBe(415000);
    expect(r.fromFeed).toEqual(expect.arrayContaining(['loan amount $415,000', 'FHA type', 'purchase', '6.375% rate']));
  });

  it('detects refinance from the purpose', () => {
    const r = losBorrowerToScenario({ amount: '250000', purpose: 'Rate/Term Refinance' }, base)!;
    expect(r.scenario.transaction).toBe('refinance');
  });

  it('falls back to base fields the feed omits (does not fabricate)', () => {
    const r = losBorrowerToScenario({ loanType: 'VA' }, base)!;
    expect(r.scenario.loanType).toBe('va');
    // no amount/rate in the feed → keep the base scenario's values
    expect(r.scenario.homePrice).toBe(base.homePrice);
    expect(r.scenario.rate).toBe(base.rate);
    expect(r.fromFeed).toEqual(['VA type']);
  });

  it('returns null when the feed has no usable loan detail', () => {
    expect(losBorrowerToScenario({ name: 'No Loan Data' }, base)).toBeNull();
    expect(losBorrowerToScenario({}, base)).toBeNull();
  });
});
