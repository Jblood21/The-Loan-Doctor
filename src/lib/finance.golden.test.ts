// Golden (characterization) tests for the scenario comparison engine.
//
// These lock the FULL computeScenario output for one canonical scenario per loan
// program, so any later refactor of the program-rules config or the fee/cash-to-close
// logic that changes a borrower-facing number fails loudly instead of drifting
// silently. Snapshots were generated from the current engine — if a change here is
// intentional, review the diff carefully (it means real numbers moved) and update
// with `vitest -u`.

import { describe, it, expect } from 'vitest';
import { computeScenario } from './finance';
import type { Scenario } from '@/types';

const base: Omit<Scenario, 'loanType' | 'homePrice' | 'downPayment' | 'downPct' | 'credit'> = {
  name: 'Scenario',
  transaction: 'purchase',
  borrowers: '1',
  program: 'standard',
  rate: 6.5,
  term: '30',
  lenderCredit: 0,
  sellerCredit: 0,
  otherCredits: 0,
};

// Round to cents / 3-dp APR so the snapshot is readable and float-stable.
const money = (n: number) => Math.round(n * 100) / 100;
function summarize(s: Scenario) {
  const r = computeScenario(s);
  return {
    typeLabel: r.typeLabel,
    baseLoan: money(r.baseLoan),
    financedLoan: money(r.financedLoan),
    ltvPct: Math.round(r.ltv * 100) / 100,
    upfrontFinanced: money(r.mi.upfrontFinanced),
    miMonthly: money(r.mi.monthly),
    miAnnualPct: r.mi.annualPct,
    miLabel: r.mi.label,
    miApplies: r.mi.applies,
    principalAndInterest: money(r.pi),
    taxes: money(r.taxes),
    insurance: money(r.insurance),
    hoa: money(r.hoa),
    totalMonthly: money(r.totalMonthly),
    aprPct: Math.round(r.apr * 1000) / 1000,
    closingCosts: money(r.closingCosts),
    cashToClose: money(r.cashToClose),
  };
}

describe('computeScenario — golden output per program', () => {
  it('Conventional, 10% down, 700 FICO (PMI applies)', () => {
    const s: Scenario = { ...base, loanType: 'conventional', credit: '700', homePrice: 400000, downPayment: 40000, downPct: 10 };
    expect(summarize(s)).toMatchInlineSnapshot(`
      {
        "aprPct": 6.836,
        "baseLoan": 360000,
        "cashToClose": 50800,
        "closingCosts": 10800,
        "financedLoan": 360000,
        "hoa": 0,
        "insurance": 116.67,
        "ltvPct": 90,
        "miAnnualPct": 0.38,
        "miApplies": true,
        "miLabel": "Private Mortgage Insurance (PMI)",
        "miMonthly": 114,
        "principalAndInterest": 2275.44,
        "taxes": 416.67,
        "totalMonthly": 2922.78,
        "typeLabel": "Conventional",
        "upfrontFinanced": 0,
      }
    `);
  });

  it('Conventional, 20% down, 760 FICO (no PMI)', () => {
    const s: Scenario = { ...base, loanType: 'conventional', credit: '760', homePrice: 400000, downPayment: 80000, downPct: 20 };
    expect(summarize(s)).toMatchInlineSnapshot(`
      {
        "aprPct": 6.585,
        "baseLoan": 320000,
        "cashToClose": 89600,
        "closingCosts": 9600,
        "financedLoan": 320000,
        "hoa": 0,
        "insurance": 116.67,
        "ltvPct": 80,
        "miAnnualPct": 0,
        "miApplies": false,
        "miLabel": "Mortgage Insurance",
        "miMonthly": 0,
        "principalAndInterest": 2022.62,
        "taxes": 416.67,
        "totalMonthly": 2555.95,
        "typeLabel": "Conventional",
        "upfrontFinanced": 0,
      }
    `);
  });

  it('FHA, 3.5% down, 680 FICO (UFMIP financed + annual MIP)', () => {
    const s: Scenario = { ...base, loanType: 'fha', credit: '680', homePrice: 300000, downPayment: 10500, downPct: 3.5 };
    expect(summarize(s)).toMatchInlineSnapshot(`
      {
        "aprPct": 7.443,
        "baseLoan": 289500,
        "cashToClose": 19185,
        "closingCosts": 8685,
        "financedLoan": 294566.25,
        "hoa": 0,
        "insurance": 87.5,
        "ltvPct": 96.5,
        "miAnnualPct": 0.55,
        "miApplies": true,
        "miLabel": "FHA Mortgage Insurance (MIP)",
        "miMonthly": 132.69,
        "principalAndInterest": 1861.86,
        "taxes": 312.5,
        "totalMonthly": 2394.55,
        "typeLabel": "FHA",
        "upfrontFinanced": 5066.25,
      }
    `);
  });

  it('VA, 0% down, 700 FICO (funding fee financed, no monthly MI)', () => {
    const s: Scenario = { ...base, loanType: 'va', credit: '700', homePrice: 300000, downPayment: 0, downPct: 0 };
    expect(summarize(s)).toMatchInlineSnapshot(`
      {
        "aprPct": 6.794,
        "baseLoan": 300000,
        "cashToClose": 9000,
        "closingCosts": 9000,
        "financedLoan": 306450,
        "hoa": 0,
        "insurance": 87.5,
        "ltvPct": 100,
        "miAnnualPct": 0,
        "miApplies": false,
        "miLabel": "VA Funding Fee (financed)",
        "miMonthly": 0,
        "principalAndInterest": 1936.97,
        "taxes": 312.5,
        "totalMonthly": 2336.97,
        "typeLabel": "VA",
        "upfrontFinanced": 6450,
      }
    `);
  });

  it('USDA, 0% down, 700 FICO (upfront + annual guarantee fee)', () => {
    const s: Scenario = { ...base, loanType: 'usda', credit: '700', homePrice: 250000, downPayment: 0, downPct: 0 };
    expect(summarize(s)).toMatchInlineSnapshot(`
      {
        "aprPct": 7.132,
        "baseLoan": 250000,
        "cashToClose": 7500,
        "closingCosts": 7500,
        "financedLoan": 252500,
        "hoa": 0,
        "insurance": 72.92,
        "ltvPct": 100,
        "miAnnualPct": 0.35,
        "miApplies": true,
        "miLabel": "USDA Guarantee Fee",
        "miMonthly": 72.92,
        "principalAndInterest": 1595.97,
        "taxes": 260.42,
        "totalMonthly": 2002.22,
        "typeLabel": "USDA",
        "upfrontFinanced": 2500,
      }
    `);
  });
});
