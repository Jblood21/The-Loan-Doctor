import { describe, it, expect } from 'vitest';
import { computeScenario } from './finance';
import type { Scenario } from '@/types';

const base = {
  name: 'x',
  transaction: 'purchase',
  borrowers: '1',
  loanType: 'conventional',
  program: 'standard',
  homePrice: 400000,
  downPayment: 80000, // 20% down → $320k loan, no PMI
  downPct: 20,
  rate: 6.5,
  term: '30',
  credit: '740',
  lenderCredit: 0,
  sellerCredit: 0,
  otherCredits: 0,
} as unknown as Scenario;

describe('lender points', () => {
  const none = computeScenario(base);
  const twoPoints = base.homePrice - base.downPayment; // loan
  const dollars = twoPoints * 0.02; // 2 points

  it('no points leaves closing/cash/APR unchanged', () => {
    expect(none.lenderPoints).toBe(0);
    expect(none.lenderPointsAmount).toBe(0);
  });

  it('points as a COST add to closing and cash to close, and raise APR', () => {
    const cost = computeScenario({ ...base, lenderPoints: 2, lenderPointsMode: 'cost' } as Scenario);
    expect(cost.lenderPointsAmount).toBeCloseTo(dollars, 2); // positive = cost
    expect(cost.closingCosts).toBeCloseTo(none.closingCosts + dollars, 2);
    expect(cost.cashToClose).toBeCloseTo(none.cashToClose + dollars, 2);
    expect(cost.creditsApplied).toBe(none.creditsApplied);
    expect(cost.apr).toBeGreaterThan(none.apr); // discount points are a prepaid finance charge
  });

  it('missing mode defaults to a cost', () => {
    const dflt = computeScenario({ ...base, lenderPoints: 1 } as Scenario);
    expect(dflt.lenderPointsAmount).toBeGreaterThan(0);
    expect(dflt.closingCosts).toBeGreaterThan(none.closingCosts);
  });

  it('points as a DISCOUNT credit toward closing, reducing cash to close', () => {
    const disc = computeScenario({ ...base, lenderPoints: 2, lenderPointsMode: 'credit' } as Scenario);
    expect(disc.lenderPointsAmount).toBeCloseTo(-dollars, 2); // negative = credit
    expect(disc.closingCosts).toBeCloseTo(none.closingCosts, 2); // not added to closing
    expect(disc.creditsApplied).toBeCloseTo(none.creditsApplied + dollars, 2);
    expect(disc.cashToClose).toBeCloseTo(none.cashToClose - dollars, 2);
  });
});
