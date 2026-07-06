import { describe, it, expect } from 'vitest';
import {
  monthlyPayment,
  ltvPct,
  pmiAnnualPct,
  fhaAnnualMipPct,
  vaFundingFeePct,
  mortgageInsurance,
  computeApr,
  amortizationSchedule,
  computeScenario,
  computeHecm,
  vaEntitlement,
  temporaryBuydown,
  permanentBuydown,
  isFinanceCharge,
  financeCharges,
  defaultClosingCosts,
  sellerNetSheet,
  cashOutConsolidation,
} from './finance';
import type { Scenario } from '@/types';

const near = (a: number, b: number, tol = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('monthlyPayment', () => {
  it('matches the standard amortization formula', () => {
    // $300k @ 6.5% / 30yr ≈ $1,896.20
    near(monthlyPayment(300000, 6.5, 30), 1896.2, 1);
  });
  it('handles 0% interest as principal/term', () => {
    expect(monthlyPayment(120000, 0, 10)).toBeCloseTo(1000, 5);
  });
  it('returns 0 for non-positive principal', () => {
    expect(monthlyPayment(0, 6, 30)).toBe(0);
    expect(monthlyPayment(-5, 6, 30)).toBe(0);
  });
});

describe('ltvPct', () => {
  it('computes loan-to-value', () => {
    expect(ltvPct(270000, 300000)).toBeCloseTo(90, 5);
  });
  it('guards divide-by-zero', () => {
    expect(ltvPct(100000, 0)).toBe(0);
  });
});

describe('pmiAnnualPct — band selection', () => {
  it('is 0 at or below 80% LTV', () => {
    expect(pmiAnnualPct(80, 700)).toBe(0);
    expect(pmiAnnualPct(75, 620)).toBe(0);
  });
  it('picks the tightest applicable LTV band (90% -> 85.01–90 band, not 95)', () => {
    // 90% LTV, 700 score -> the 90-band 700 row = 0.38
    expect(pmiAnnualPct(90, 700)).toBe(0.38);
  });
  it('worsens as credit drops within a band', () => {
    expect(pmiAnnualPct(95, 760)).toBeLessThan(pmiAnnualPct(95, 640));
  });
});

describe('fhaAnnualMipPct — 2023 schedule', () => {
  it('30-yr break is at 95% LTV, not 90% (90–95 band is 0.50%)', () => {
    expect(fhaAnnualMipPct(92, 30)).toBe(0.5);
    expect(fhaAnnualMipPct(96, 30)).toBe(0.55);
  });
  it('15-yr term is cheaper', () => {
    expect(fhaAnnualMipPct(85, 15)).toBe(0.15);
    expect(fhaAnnualMipPct(95, 15)).toBe(0.4);
  });
  it('high-balance base loan pays more', () => {
    expect(fhaAnnualMipPct(96, 30, 900000)).toBe(0.75);
    expect(fhaAnnualMipPct(92, 30, 900000)).toBe(0.7);
  });
});

describe('vaFundingFeePct', () => {
  it('first use, <5% down is 2.15%', () => expect(vaFundingFeePct(0)).toBe(2.15));
  it('subsequent use, <5% down is 3.3%', () => expect(vaFundingFeePct(0, true)).toBe(3.3));
  it('5%+ down is 1.5% regardless of use', () => {
    expect(vaFundingFeePct(5)).toBe(1.5);
    expect(vaFundingFeePct(5, true)).toBe(1.5);
  });
  it('10%+ down is 1.25% regardless of use', () => {
    expect(vaFundingFeePct(10)).toBe(1.25);
    expect(vaFundingFeePct(15, true)).toBe(1.25);
  });
});

describe('mortgageInsurance', () => {
  it('conventional at 90% LTV has monthly PMI, no upfront', () => {
    const mi = mortgageInsurance('conventional', 270000, 300000, 10, 700, 30);
    expect(mi.applies).toBe(true);
    expect(mi.monthly).toBeGreaterThan(0);
    expect(mi.upfrontFinanced).toBe(0);
  });
  it('conventional at 80% LTV has no PMI', () => {
    const mi = mortgageInsurance('conventional', 240000, 300000, 20, 740, 30);
    expect(mi.applies).toBe(false);
    expect(mi.monthly).toBe(0);
  });
  it('FHA finances 1.75% upfront MIP and has monthly MIP', () => {
    const mi = mortgageInsurance('fha', 289500, 300000, 3.5, 680, 30);
    near(mi.upfrontFinanced, 289500 * 0.0175, 1);
    expect(mi.monthly).toBeGreaterThan(0);
  });
  it('VA finances a funding fee and has no monthly MI', () => {
    const mi = mortgageInsurance('va', 300000, 300000, 0, 700, 30);
    expect(mi.monthly).toBe(0);
    near(mi.upfrontFinanced, 300000 * 0.0215, 1);
  });
});

describe('computeApr', () => {
  it('APR exceeds the note rate when finance charges are present', () => {
    const pay = monthlyPayment(300000, 6.5, 30);
    const apr = computeApr(300000, pay, 30, 6000);
    expect(apr).toBeGreaterThan(6.5);
    expect(apr).toBeLessThan(7.2);
  });
  it('APR ~= note rate when there are no finance charges', () => {
    const pay = monthlyPayment(300000, 6.5, 30);
    near(computeApr(300000, pay, 30, 0), 6.5, 0.02);
  });
});

describe('amortizationSchedule', () => {
  it('pays off exactly over the term', () => {
    const rows = amortizationSchedule(300000, 6.5, 30);
    expect(rows.length).toBe(360);
    expect(rows[rows.length - 1].balance).toBeLessThanOrEqual(0.01);
  });
  it('extra principal shortens the payoff', () => {
    const base = amortizationSchedule(300000, 6.5, 30);
    const extra = amortizationSchedule(300000, 6.5, 30, 300);
    expect(extra.length).toBeLessThan(base.length);
  });
});

describe('isFinanceCharge / financeCharges', () => {
  it('origination (% of loan) and underwriting count; title/appraisal do not', () => {
    expect(isFinanceCharge({ id: '1', label: 'Origination Fee', basis: 'loan', value: 1 })).toBe(true);
    expect(isFinanceCharge({ id: '2', label: 'Underwriting / Processing', basis: 'flat', value: 1195 })).toBe(true);
    expect(isFinanceCharge({ id: '3', label: 'Appraisal', basis: 'flat', value: 650 })).toBe(false);
    expect(isFinanceCharge({ id: '4', label: "Owner's Title Policy", basis: 'title-owners', value: 0 })).toBe(false);
    expect(isFinanceCharge({ id: '5', label: 'Transfer Tax', basis: 'price', value: 1 })).toBe(false);
  });
  it('sums only finance charges', () => {
    const fees = defaultClosingCosts('purchase');
    const fc = financeCharges(fees, 270000, 300000);
    const all = fees.reduce((s, f) => s + (f.basis === 'loan' ? (270000 * f.value) / 100 : f.basis === 'flat' ? f.value : 0), 0);
    expect(fc).toBeLessThan(all + 1); // never more than everything
    expect(fc).toBeGreaterThan(0);
  });
});

describe('computeScenario', () => {
  const base: Scenario = {
    name: 'S1', transaction: 'purchase', borrowers: '1', loanType: 'conventional', program: 'standard',
    homePrice: 300000, downPayment: 30000, downPct: 10, rate: 6.5, term: '30', credit: '700',
    lenderCredit: 0, sellerCredit: 0, otherCredits: 0,
  };
  it('produces a coherent payment breakdown', () => {
    const r = computeScenario(base);
    expect(r.baseLoan).toBe(270000);
    near(r.ltv, 90, 0.01);
    expect(r.pi).toBeGreaterThan(0);
    expect(r.mi.applies).toBe(true);
    expect(r.totalMonthly).toBeGreaterThan(r.pi);
    expect(r.apr).toBeGreaterThan(base.rate);
  });
  it('APR now responds to itemized finance charges', () => {
    const withFees: Scenario = { ...base, closingCosts: defaultClosingCosts('purchase') };
    const noFees: Scenario = { ...base, closingCosts: [{ id: 'a', label: 'Appraisal', basis: 'flat', value: 650 }] };
    expect(computeScenario(withFees).apr).toBeGreaterThan(computeScenario(noFees).apr);
  });
});

describe('computeHecm', () => {
  it('refinance nets proceeds after paying off liens', () => {
    const r = computeHecm({ mode: 'refinance', age: 75, homeValue: 500000, existingMortgage: 100000, otherDebts: 20000, rate: 6, payout: 'lump' });
    expect(r.grossPrincipalLimit).toBeGreaterThan(0);
    expect(r.payoffTotal).toBe(120000);
    expect(r.available).toBeCloseTo(Math.max(0, r.grossPrincipalLimit - 120000), 5);
  });
  it('H4P required down payment = price − principal limit', () => {
    const r = computeHecm({ mode: 'purchase', age: 70, homeValue: 400000, existingMortgage: 0, otherDebts: 0, rate: 6, payout: 'lump' });
    expect(r.requiredDownPayment).toBeCloseTo(400000 - r.grossPrincipalLimit, 5);
  });
});

describe('vaEntitlement', () => {
  it('full entitlement = zero down, guaranty 25% of price', () => {
    const r = vaEntitlement({ purchasePrice: 500000, countyLoanLimit: 806500, fullEntitlement: true, priorLoanAmount: 0, downPayment: 0, subsequentUse: false, fundingFeeExempt: false });
    expect(r.zeroDownEligible).toBe(true);
    expect(r.requiredDownPayment).toBe(0);
    expect(r.guarantyOnLoan).toBeCloseTo(125000, 5);
  });
  it('partial entitlement may require a down payment', () => {
    const r = vaEntitlement({ purchasePrice: 500000, countyLoanLimit: 500000, fullEntitlement: false, priorLoanAmount: 300000, downPayment: 0, subsequentUse: true, fundingFeeExempt: false });
    expect(r.entitlementUsed).toBeCloseTo(75000, 5); // 25% of 300k
    expect(r.requiredDownPayment).toBeGreaterThan(0);
  });
  it('funding fee is 0 when exempt', () => {
    const r = vaEntitlement({ purchasePrice: 400000, countyLoanLimit: 806500, fullEntitlement: true, priorLoanAmount: 0, downPayment: 0, subsequentUse: false, fundingFeeExempt: true });
    expect(r.fundingFee).toBe(0);
  });
});

describe('buydowns', () => {
  it('temporary 2-1 buydown reduces year 1 and 2 rates', () => {
    const r = temporaryBuydown(400000, 7, 30, [2, 1]);
    expect(r.schedule[0].rate).toBe(5);
    expect(r.schedule[1].rate).toBe(6);
    expect(r.schedule[0].monthlySaved).toBeGreaterThan(r.schedule[1].monthlySaved);
    expect(r.subsidyCost).toBeGreaterThan(0);
  });
  it('permanent buydown has a finite break-even when it lowers the payment', () => {
    const r = permanentBuydown(400000, 7, 6.5, 30, 1, 7);
    expect(r.monthlySavings).toBeGreaterThan(0);
    expect(Number.isFinite(r.breakEvenMonths)).toBe(true);
    expect(r.cost).toBeCloseTo(4000, 5); // 1 point on 400k
  });
});

describe('sellerNetSheet', () => {
  it('nets sale price minus payoff, commission, and costs', () => {
    const r = sellerNetSheet({ salePrice: 450000, mortgagePayoff: 260000, commissionPct: 5, sellerClosingCosts: 4500, concessions: 0, otherLiens: 0 });
    expect(r.commission).toBeCloseTo(22500, 5); // 5% of 450k
    expect(r.netProceeds).toBeCloseTo(450000 - 260000 - 22500 - 4500, 5);
    expect(r.netPct).toBeCloseTo((r.netProceeds / 450000) * 100, 5);
  });
  it('can go negative (underwater sale)', () => {
    const r = sellerNetSheet({ salePrice: 200000, mortgagePayoff: 220000, commissionPct: 6, sellerClosingCosts: 3000, concessions: 0, otherLiens: 0 });
    expect(r.netProceeds).toBeLessThan(0);
  });
});

describe('cashOutConsolidation', () => {
  it('sums current balance + debts + extra cash into the new loan', () => {
    const r = cashOutConsolidation({ homeValue: 500000, currentBalance: 280000, currentPayment: 1750, debtBalance: 35000, debtPayment: 850, extraCash: 10000, newRate: 6.5, newTermYears: 30 });
    expect(r.newLoanAmount).toBe(325000);
    expect(r.ltv).toBeCloseTo(65, 1);
    expect(r.currentTotalMonthly).toBe(2600);
    expect(r.monthlySavings).toBeCloseTo(2600 - r.newPayment, 5);
  });
  it('guards divide-by-zero on home value', () => {
    const r = cashOutConsolidation({ homeValue: 0, currentBalance: 100000, currentPayment: 800, debtBalance: 0, debtPayment: 0, extraCash: 0, newRate: 6, newTermYears: 30 });
    expect(r.ltv).toBe(0);
  });
});
