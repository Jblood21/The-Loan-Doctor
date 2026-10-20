import { describe, it, expect } from 'vitest';
import {
  amortizationSchedule,
  computeApr,
  computeScenario,
  dscrBand,
  dscrRatio,
  interestOnlyMonths,
  interestOnlyPayment,
  monthlyPayment,
} from './finance';
import type { PrepayPlan, Scenario } from '@/types';

// A DSCR purchase: $400k property, 25% down → $300k loan, 7.5%, 30-yr, rent $3,000/mo.
const base = {
  name: 'dscr',
  transaction: 'purchase',
  borrowers: '1',
  loanType: 'dscr',
  program: 'standard',
  homePrice: 400000,
  downPayment: 100000,
  downPct: 25,
  rate: 7.5,
  term: '30',
  credit: '720',
  lenderCredit: 0,
  sellerCredit: 0,
  otherCredits: 0,
  rentMonthly: 3000,
} as unknown as Scenario;

// Default escrow assumptions (1.25% tax, 0.35% insurance of value, per year).
const taxes = (400000 * 0.0125) / 12;
const insurance = (400000 * 0.0035) / 12;
const pi30 = monthlyPayment(300000, 7.5, 30);

describe('DSCR ratio', () => {
  const r = computeScenario(base);

  it('is rent ÷ the full PITIA payment', () => {
    const pitia = pi30 + taxes + insurance;
    expect(r.totalMonthly).toBeCloseTo(pitia, 6);
    expect(r.dscr!.pitia).toBeCloseTo(pitia, 6);
    expect(r.dscr!.ratio).toBeCloseTo(3000 / pitia, 8);
    expect(r.dscr!.cashFlow).toBeCloseTo(3000 - pitia, 6);
  });

  it('includes HOA in the payment the ratio is measured against', () => {
    const withHoa = computeScenario({ ...base, hoaMonthly: 200 } as Scenario);
    expect(withHoa.dscr!.pitia).toBeCloseTo(pi30 + taxes + insurance + 200, 6);
    expect(withHoa.dscr!.ratio).toBeLessThan(r.dscr!.ratio);
  });

  it('carries no mortgage insurance, even at high LTV', () => {
    const highLtv = computeScenario({ ...base, downPayment: 40000, downPct: 10 } as Scenario);
    expect(highLtv.mi.monthly).toBe(0);
    expect(highLtv.mi.upfrontFinanced).toBe(0);
    expect(highLtv.mi.applies).toBe(false);
  });

  it('a manual tax/insurance entry flows into the ratio', () => {
    const manual = computeScenario({ ...base, taxMonthly: 500, insuranceMonthly: 150 } as Scenario);
    expect(manual.dscr!.pitia).toBeCloseTo(pi30 + 500 + 150, 6);
  });

  it('no rent → ratio 0, band "none", and the cash flow is just the negative payment', () => {
    const noRent = computeScenario({ ...base, rentMonthly: 0 } as Scenario);
    expect(noRent.dscr!.ratio).toBe(0);
    expect(noRent.dscr!.band).toBe('none');
    expect(noRent.dscr!.flags.join(' ')).not.toMatch(/below 1\.0/); // not flagged until rent is entered
  });

  it('negative cash flow when rent is below the payment', () => {
    const low = computeScenario({ ...base, rentMonthly: 2000 } as Scenario);
    expect(low.dscr!.cashFlow).toBeLessThan(0);
    expect(low.dscr!.band).toBe('below');
  });

  it('is absent on every other loan type', () => {
    for (const loanType of ['conventional', 'fha', 'va', 'usda', 'arm'] as const) {
      const o = computeScenario({ ...base, loanType } as Scenario);
      expect(o.dscr).toBeUndefined();
      expect(o.ioMonths).toBe(0);
    }
  });
});

describe('DSCR bands (judged on the ratio as quoted, to two decimals)', () => {
  it('thresholds', () => {
    expect(dscrBand(0, 0)).toBe('none');
    expect(dscrBand(2000, 0.99)).toBe('below');
    expect(dscrBand(2000, 0.994)).toBe('below'); // rounds to 0.99
    expect(dscrBand(2000, 0.996)).toBe('meets'); // rounds to 1.00
    expect(dscrBand(2000, 1.0)).toBe('meets');
    expect(dscrBand(2000, 1.244)).toBe('meets'); // 1.24
    expect(dscrBand(2000, 1.25)).toBe('strong');
    expect(dscrBand(2000, 1.8)).toBe('strong');
  });
  it('dscrRatio guards zero/negative inputs', () => {
    expect(dscrRatio(0, 2000)).toBe(0);
    expect(dscrRatio(2000, 0)).toBe(0);
    expect(dscrRatio(3000, 2000)).toBe(1.5);
  });
});

describe('DSCR soft guideline flags', () => {
  it('a clean scenario raises none', () => {
    expect(computeScenario(base).dscr!.flags).toEqual([]);
  });
  it('flags a ratio under 1.0', () => {
    const f = computeScenario({ ...base, rentMonthly: 2000 } as Scenario).dscr!.flags.join(' ');
    expect(f).toMatch(/below 1\.0/);
  });
  it('flags LTV over 80%', () => {
    const f = computeScenario({ ...base, downPayment: 40000, downPct: 10 } as Scenario).dscr!.flags.join(' ');
    expect(f).toMatch(/LTV is above/);
  });
  it('does not flag exactly 80% LTV', () => {
    const f = computeScenario({ ...base, downPayment: 80000, downPct: 20 } as Scenario).dscr!.flags.join(' ');
    expect(f).not.toMatch(/LTV is above/);
  });
  it('flags a credit score under 660', () => {
    const f = computeScenario({ ...base, credit: '640' } as Scenario).dscr!.flags.join(' ');
    expect(f).toMatch(/Credit score is below/);
  });
});

// Balance after k payments, from the closed-form loan formula (independent of the app's schedule code).
const balanceAfter = (loan: number, ratePct: number, termYears: number, k: number) => {
  const r = ratePct / 100 / 12;
  const n = termYears * 12;
  const pmt = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return loan * Math.pow(1 + r, k) - (pmt * (Math.pow(1 + r, k) - 1)) / r;
};
const withPrepay = (prepay: PrepayPlan, over: Partial<Scenario> = {}) =>
  computeScenario({ ...base, prepay, ...over } as Scenario).dscr!;

describe('prepayment penalty — none', () => {
  it('none by default', () => {
    const d = computeScenario(base).dscr!;
    expect(d.prepay).toBeNull();
    expect(d.prepayLabel).toBe('None');
    expect(d.prepayYear1Amount).toBe(0);
  });
  it('an explicit "none" plan means none', () => {
    expect(withPrepay({ mode: 'none', stepPct: [5, 4, 3] }).prepay).toBeNull();
  });
  it('does not change the payment, APR or cash to close', () => {
    const a = computeScenario(base);
    const b = computeScenario({ ...base, prepay: { mode: 'percent', stepPct: [5, 4, 3, 2, 1] } } as Scenario);
    expect(b.totalMonthly).toBe(a.totalMonthly);
    expect(b.apr).toBe(a.apr);
    expect(b.cashToClose).toBe(a.cashToClose);
  });
});

describe('prepayment penalty — percent by year', () => {
  const steps = [5, 4, 3, 2, 1];

  it('charges each year\'s percent on the balance at the start of that year', () => {
    const d = withPrepay({ mode: 'percent', stepPct: steps, basis: 'balance' });
    const p = d.prepay!;
    expect(p.years).toBe(5);
    expect(p.label).toBe('5-4-3-2-1');
    p.rows.forEach((row, i) => {
      const bal = balanceAfter(300000, 7.5, 30, 12 * i); // start of year i+1
      expect(row.year).toBe(i + 1);
      expect(row.pct).toBe(steps[i]);
      expect(row.balance).toBeCloseTo(bal, 4);
      expect(row.amount).toBeCloseTo((bal * steps[i]) / 100, 4);
    });
    expect(p.year1Amount).toBeCloseTo(15000, 6); // 5% of the full $300,000 in year 1
    expect(d.prepayYear1Amount).toBeCloseTo(15000, 6);
  });

  it('later years cost less than the same percent would on the original balance', () => {
    const bal = withPrepay({ mode: 'percent', stepPct: [4, 4, 4], basis: 'balance' }).prepay!;
    const orig = withPrepay({ mode: 'percent', stepPct: [4, 4, 4], basis: 'original' }).prepay!;
    expect(bal.rows[0].amount).toBeCloseTo(orig.rows[0].amount, 6); // year 1 is the same
    expect(bal.rows[2].amount).toBeLessThan(orig.rows[2].amount); // the balance has paid down
  });

  it('"original loan amount" basis is flat at pct × the loan', () => {
    const p = withPrepay({ mode: 'percent', stepPct: steps, basis: 'original' }).prepay!;
    p.rows.forEach((row, i) => expect(row.amount).toBeCloseTo((300000 * steps[i]) / 100, 6));
  });

  it('any years and percentages can be entered, including decimals', () => {
    const p = withPrepay({ mode: 'percent', stepPct: [2.5, 1.25] }).prepay!;
    expect(p.label).toBe('2.5-1.25');
    expect(p.years).toBe(2);
    expect(p.rows[0].amount).toBeCloseTo(7500, 6);
    expect(p.rows[1].amount).toBeCloseTo((balanceAfter(300000, 7.5, 30, 12) * 1.25) / 100, 4);
  });

  it('names flat and single-year penalties plainly', () => {
    expect(withPrepay({ mode: 'percent', stepPct: [3, 3, 3] }).prepay!.label).toBe('3% flat · 3 yrs');
    expect(withPrepay({ mode: 'percent', stepPct: [2] }).prepay!.label).toBe('2% · 1 yr');
  });

  it('trailing 0% years drop off; all-zero or empty means no penalty', () => {
    const p = withPrepay({ mode: 'percent', stepPct: [3, 2, 0, 0] }).prepay!;
    expect(p.years).toBe(2);
    expect(p.label).toBe('3-2');
    expect(withPrepay({ mode: 'percent', stepPct: [0, 0] }).prepay).toBeNull();
    expect(withPrepay({ mode: 'percent', stepPct: [] }).prepay).toBeNull();
    expect(withPrepay({ mode: 'percent' }).prepay).toBeNull();
  });

  it('a 0% year in the middle is kept (the penalty can lapse and come back)', () => {
    const p = withPrepay({ mode: 'percent', stepPct: [3, 0, 2] }).prepay!;
    expect(p.years).toBe(3);
    expect(p.rows[1].amount).toBe(0);
  });

  it('limits: percentages cap at 20% and the period at 10 years', () => {
    const p = withPrepay({ mode: 'percent', stepPct: [50, -3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }).prepay!;
    expect(p.years).toBe(10);
    expect(p.rows[0].pct).toBe(20);
    expect(p.rows[1].pct).toBe(0); // a negative entry can't become a credit
  });

  it('describes the schedule in a plain sentence', () => {
    expect(withPrepay({ mode: 'percent', stepPct: steps }).prepay!.description).toBe(
      '5%, 4%, 3%, 2% and 1% of the remaining balance if the loan is paid off in years 1 through 5, respectively.',
    );
    expect(withPrepay({ mode: 'percent', stepPct: [3, 3, 3], basis: 'original' }).prepay!.description).toBe(
      '3% of the original loan amount if the loan is paid off in the first 3 years.',
    );
  });

  it('on an interest-only loan the balance holds, so year 2 costs the same as year 1', () => {
    const p = withPrepay({ mode: 'percent', stepPct: [4, 4, 4] }, { interestOnly: true }).prepay!;
    expect(p.rows[1].balance).toBeCloseTo(300000, 6);
    expect(p.rows[1].amount).toBeCloseTo(p.rows[0].amount, 6);
  });

  it('older saved scenarios that used the two fixed presets still read correctly', () => {
    const old = computeScenario({ ...base, dscrPrepay: '5-4-3-2-1' } as Scenario).dscr!;
    expect(old.prepay!.label).toBe('5-4-3-2-1');
    expect(old.prepayYear1Amount).toBeCloseTo(15000, 6);
    expect(computeScenario({ ...base, dscrPrepay: '3-2-1' } as Scenario).dscr!.prepay!.label).toBe('3-2-1');
    expect(computeScenario({ ...base, dscrPrepay: '' } as Scenario).dscr!.prepay).toBeNull();
    // A new plan wins over a leftover legacy value.
    const both = computeScenario({ ...base, dscrPrepay: '5-4-3-2-1', prepay: { mode: 'percent', stepPct: [2] } } as Scenario).dscr!;
    expect(both.prepay!.label).toBe('2% · 1 yr');
  });
});

describe('prepayment penalty — months of interest', () => {
  const plan = (over: Partial<PrepayPlan> = {}): PrepayPlan => ({ mode: 'interest', interestMonths: 6, interestYears: 3, freePct: 20, ...over });

  it('is months of interest on the balance above the penalty-free amount', () => {
    const p = withPrepay(plan()).prepay!;
    // Year 1: (300,000 − 20% × 300,000) × 7.5% ÷ 12 × 6 months = $9,000.
    expect(p.rows[0].amount).toBeCloseTo((300000 - 60000) * 0.00625 * 6, 6);
    expect(p.rows[0].amount).toBeCloseTo(9000, 6);
    // Year 2 uses the lower balance; the free amount stays 20% of the ORIGINAL loan.
    const bal2 = balanceAfter(300000, 7.5, 30, 12);
    expect(p.rows[1].amount).toBeCloseTo((bal2 - 60000) * 0.00625 * 6, 4);
    expect(p.rows[1].amount).toBeLessThan(p.rows[0].amount);
    expect(p.years).toBe(3);
    expect(p.label).toBe('6 mo. interest · 3 yrs');
    expect(p.mode).toBe('interest');
  });

  it('with no penalty-free amount it is interest on the whole balance', () => {
    const p = withPrepay(plan({ freePct: 0 })).prepay!;
    expect(p.rows[0].amount).toBeCloseTo(300000 * 0.00625 * 6, 6); // $11,250
  });

  it('the effective percent of the balance is reported for each year', () => {
    const p = withPrepay(plan()).prepay!;
    expect(p.rows[0].pct).toBeCloseTo((9000 / 300000) * 100, 6); // 3%
  });

  it('a penalty-free amount larger than the balance means no charge', () => {
    const p = withPrepay(plan({ freePct: 100 })).prepay!;
    expect(p.rows.every((r) => r.amount === 0)).toBe(true);
  });

  it('zero months or zero years means no penalty', () => {
    expect(withPrepay(plan({ interestMonths: 0 })).prepay).toBeNull();
    expect(withPrepay(plan({ interestYears: 0 })).prepay).toBeNull();
  });

  it('a higher rate costs more interest', () => {
    const lo = withPrepay(plan(), { rate: 6 }).prepay!.rows[0].amount;
    const hi = withPrepay(plan(), { rate: 9 }).prepay!.rows[0].amount;
    expect(hi).toBeGreaterThan(lo);
  });

  it('describes itself in a plain sentence', () => {
    expect(withPrepay(plan()).prepay!.description).toBe(
      '6 months of interest on the balance above 20% of the original loan if the loan is paid off in the first 3 years.',
    );
    expect(withPrepay(plan({ freePct: 0, interestMonths: 1, interestYears: 1 })).prepay!.description).toBe(
      '1 month of interest on the balance if the loan is paid off in the first year.',
    );
  });
});

describe('interest-only (10 years, then fully amortizing)', () => {
  const io = computeScenario({ ...base, interestOnly: true } as Scenario);

  it('starting payment is interest only; the amortizing payment re-solves over 20 years', () => {
    expect(io.ioMonths).toBe(120);
    expect(io.pi).toBeCloseTo((300000 * 0.075) / 12, 6); // $1,875.00
    expect(io.piAfterIo).toBeCloseTo(monthlyPayment(300000, 7.5, 20), 6);
    expect(io.pi).toBeLessThan(pi30); // cheaper than amortizing from day one…
    expect(io.piAfterIo).toBeGreaterThan(pi30); // …but the payment steps up later
  });

  it('raises the DSCR at the start and reports the lower ratio after the reset', () => {
    const plain = computeScenario(base).dscr!;
    expect(io.dscr!.ratio).toBeGreaterThan(plain.ratio);
    expect(io.dscr!.ratioAmortized!).toBeLessThan(io.dscr!.ratio);
    expect(io.dscr!.amortizedPitia!).toBeCloseTo(io.piAfterIo + taxes + insurance, 6);
  });

  it('flags when the ratio only holds during the interest-only period', () => {
    // Rent chosen to clear 1.0 on the IO payment but not on the amortizing one.
    const ioPitia = (300000 * 0.075) / 12 + taxes + insurance;
    const afterPitia = monthlyPayment(300000, 7.5, 20) + taxes + insurance;
    const rent = Math.round((ioPitia + afterPitia) / 2); // between the two
    const r = computeScenario({ ...base, interestOnly: true, rentMonthly: rent } as Scenario).dscr!;
    expect(r.ratio).toBeGreaterThanOrEqual(1);
    expect(r.ratioAmortized!).toBeLessThan(1);
    expect(r.flags.join(' ')).toMatch(/After the interest-only period/);
  });

  it('the schedule pays no principal for 10 years, then retires the loan on time', () => {
    const rows = amortizationSchedule(300000, 7.5, 30, 0, 120);
    expect(rows).toHaveLength(360);
    expect(rows[119].balance).toBeCloseTo(300000, 6); // balance untouched through month 120
    expect(rows[0].principal).toBe(0);
    expect(rows[120].principal).toBeGreaterThan(0); // month 121 starts amortizing
    expect(rows[359].balance).toBeCloseTo(0, 4);
  });

  it('total interest is higher than a normal 30-year loan at the same rate', () => {
    expect(io.totalInterest).toBeGreaterThan(computeScenario(base).totalInterest);
    expect(io.payoffMonths).toBe(360);
  });

  it('ignored when the term is 10 years or less, and on non-DSCR loans', () => {
    expect(interestOnlyMonths({ ...base, interestOnly: true, term: '10' } as Scenario, 10)).toBe(0);
    expect(interestOnlyMonths({ ...base, interestOnly: true, term: '15' } as Scenario, 15)).toBe(120);
    expect(interestOnlyMonths({ ...base, loanType: 'conventional', interestOnly: true } as Scenario, 30)).toBe(0);
    const conv = computeScenario({ ...base, loanType: 'conventional', interestOnly: true } as Scenario);
    expect(conv.pi).toBeCloseTo(pi30, 6);
  });

  it('interestOnlyPayment guards an empty balance', () => {
    expect(interestOnlyPayment(0, 7.5)).toBe(0);
    expect(interestOnlyPayment(300000, 0)).toBe(0);
  });
});

describe('APR with an interest-only stream', () => {
  // With zero fees an APR must equal the note rate whatever the shape of the payments —
  // an independent check that the interest-only present-value math is right.
  it('equals the note rate when there are no financed costs (amortizing)', () => {
    expect(computeApr(300000, monthlyPayment(300000, 7.5, 30), 30, 0)).toBeCloseTo(7.5, 3);
  });
  it('equals the note rate when there are no financed costs (interest-only, then amortizing)', () => {
    const ioPay = interestOnlyPayment(300000, 7.5);
    const after = monthlyPayment(300000, 7.5, 20);
    expect(computeApr(300000, ioPay, 30, 0, 0, 0, { months: 120, afterPayment: after })).toBeCloseTo(7.5, 3);
  });
  it('a 0% rate still solves (interest-only then principal-only)', () => {
    const after = monthlyPayment(300000, 0, 20);
    expect(computeApr(300000, 0.0001, 30, 0, 0, 0, { months: 120, afterPayment: after })).toBeCloseTo(0, 2);
  });
  it('fees raise the APR above the note rate on an interest-only loan', () => {
    const ioPay = interestOnlyPayment(300000, 7.5);
    const after = monthlyPayment(300000, 7.5, 20);
    expect(computeApr(300000, ioPay, 30, 6000, 0, 0, { months: 120, afterPayment: after })).toBeGreaterThan(7.5);
  });
  it('the scenario APR with the standard fees lands just above the note rate', () => {
    const r = computeScenario({ ...base, interestOnly: true } as Scenario);
    expect(r.apr).toBeGreaterThan(7.5);
    expect(r.apr).toBeLessThan(8.2);
  });
});
