import { describe, it, expect } from 'vitest';
import { normalizeScenario } from './ScenariosContext';

describe('normalizeScenario — prepayment plan migration', () => {
  it('turns an old fixed preset into an editable year-by-year plan', () => {
    const s = normalizeScenario({ loanType: 'dscr', dscrPrepay: '5-4-3-2-1' });
    expect(s.prepay).toEqual({ mode: 'percent', stepPct: [5, 4, 3, 2, 1], basis: 'balance' });
    expect('dscrPrepay' in s).toBe(false);
    expect(normalizeScenario({ dscrPrepay: '3-2-1' }).prepay!.stepPct).toEqual([3, 2, 1]);
  });

  it('an old "none" stays none', () => {
    const s = normalizeScenario({ loanType: 'dscr', dscrPrepay: '' });
    expect(s.prepay).toBeUndefined();
    expect('dscrPrepay' in s).toBe(false);
  });

  it('keeps a plan that is already there and drops a stale legacy value', () => {
    const plan = { mode: 'interest' as const, interestMonths: 6, interestYears: 3, freePct: 20 };
    const s = normalizeScenario({ loanType: 'dscr', prepay: plan, dscrPrepay: '3-2-1' });
    expect(s.prepay).toEqual(plan);
    expect('dscrPrepay' in s).toBe(false);
  });

  it('leaves scenarios without any prepayment untouched', () => {
    const s = normalizeScenario({ loanType: 'conventional', homePrice: 400000 });
    expect(s.prepay).toBeUndefined();
    expect(s.homePrice).toBe(400000);
  });
});
