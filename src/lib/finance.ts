// LoanDr. finance engine — real mortgage math.
//
// Replaces the prototype's placeholder figures with proper formulas:
//   • Principal & Interest (standard amortization)
//   • Property tax + homeowners insurance estimates (configurable rates)
//   • Mortgage insurance: conventional PMI by LTV + credit, FHA upfront+annual MIP,
//     VA funding fee, USDA upfront guarantee + annual fee
//   • APR (solved numerically from the payment stream and financed costs)
//   • Total interest + full amortization schedule
//   • HECM principal limit via an interpolated PLF table
//
// All rates are documented inline. Lender-specific factors are centralized here so a
// backend can later override them per lender.

import type { LoanType, Scenario } from '@/types';

export const DEFAULT_TAX_RATE = 1.25; // %/yr of home value
export const DEFAULT_INSURANCE_RATE = 0.35; // %/yr of home value
export const DEFAULT_CLOSING_RATE = 0.03; // 3% of loan, rough estimate
/** FHA national HECM max claim amount (2025 lending limit). */
export const HECM_MAX_CLAIM = 1209750;

/** Standard amortized monthly payment. r is monthly rate (fraction), n months. */
export function monthlyPayment(principal: number, annualRatePct: number, termYears: number): number {
  const n = Math.max(1, Math.round(termYears * 12));
  const r = annualRatePct / 100 / 12;
  if (principal <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

export function ltvPct(loan: number, homeValue: number): number {
  return homeValue > 0 ? (loan / homeValue) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Conventional PMI — borrower-paid monthly, 30-yr fixed, by LTV band & credit.
// Annual premium as a % of the loan amount. Values approximate national MI rate
// cards (e.g. MGIC/Radian) and are intentionally centralized for easy override.
// ---------------------------------------------------------------------------
// Ordered ASCENDING by maxLtv so the tightest applicable band wins, e.g. LTV 90
// maps to the 85.01–90 band, not 95.01–97. Each byCredit entry: [minScore, annualPct].
const PMI_TABLE: { maxLtv: number; byCredit: [number, number][] }[] = [
  { maxLtv: 85, byCredit: [[760, 0.14], [740, 0.16], [720, 0.19], [700, 0.21], [680, 0.27], [660, 0.34], [640, 0.38], [0, 0.46]] },
  { maxLtv: 90, byCredit: [[760, 0.19], [740, 0.23], [720, 0.3], [700, 0.38], [680, 0.52], [660, 0.66], [640, 0.78], [0, 0.94]] },
  { maxLtv: 95, byCredit: [[760, 0.3], [740, 0.38], [720, 0.54], [700, 0.7], [680, 0.9], [660, 1.1], [640, 1.32], [0, 1.55]] },
  { maxLtv: 97, byCredit: [[760, 0.41], [740, 0.55], [720, 0.7], [700, 0.87], [680, 1.1], [660, 1.36], [640, 1.6], [0, 1.84]] },
];

/** Conventional PMI annual rate (%) — 0 when LTV ≤ 80. */
export function pmiAnnualPct(ltv: number, creditScore: number): number {
  if (ltv <= 80) return 0;
  const band = PMI_TABLE.find((b) => ltv <= b.maxLtv) ?? PMI_TABLE[PMI_TABLE.length - 1];
  for (const [minScore, pctVal] of band.byCredit) {
    if (creditScore >= minScore) return pctVal;
  }
  return band.byCredit[band.byCredit.length - 1][1];
}

/** FHA annual MIP (%). Depends on LTV and term length. Base loan ≤ conforming. */
export function fhaAnnualMipPct(ltv: number, termYears: number): number {
  if (termYears > 15) return ltv > 90 ? 0.55 : 0.5;
  // 15-year (and shorter) terms
  return ltv > 90 ? 0.4 : 0.15;
}
export const FHA_UPFRONT_MIP = 1.75; // % of base loan, financed
export const USDA_UPFRONT_FEE = 1.0; // % of loan, financed
export const USDA_ANNUAL_FEE = 0.35; // % of balance, ~constant approximation

/** VA funding fee (%) for a first-use purchase, tiered by down payment. Financed. */
export function vaFundingFeePct(downPct: number, subsequentUse = false): number {
  if (downPct >= 10) return subsequentUse ? 1.25 : 1.25;
  if (downPct >= 5) return subsequentUse ? 1.5 : 1.5;
  return subsequentUse ? 3.3 : 2.15;
}

export interface MortgageInsurance {
  /** Monthly MI payment in dollars. */
  monthly: number;
  /** Upfront fee financed into the loan (FHA/VA/USDA). */
  upfrontFinanced: number;
  /** Annual rate as a % (0 if none). */
  annualPct: number;
  /** Human label for the MI row. */
  label: string;
  /** Whether MI applies at all. */
  applies: boolean;
}

/**
 * Mortgage insurance / guarantee fees by program.
 * baseLoan = homePrice - downPayment (the financed principal before upfront fees).
 */
export function mortgageInsurance(
  loanType: LoanType,
  baseLoan: number,
  homeValue: number,
  downPct: number,
  creditScore: number,
  termYears: number,
): MortgageInsurance {
  const ltv = ltvPct(baseLoan, homeValue);
  if (loanType === 'fha') {
    const annualPct = fhaAnnualMipPct(ltv, termYears);
    const upfront = baseLoan * (FHA_UPFRONT_MIP / 100);
    return {
      monthly: ((baseLoan + upfront) * (annualPct / 100)) / 12,
      upfrontFinanced: upfront,
      annualPct,
      label: 'FHA Mortgage Insurance (MIP)',
      applies: true,
    };
  }
  if (loanType === 'usda') {
    const upfront = baseLoan * (USDA_UPFRONT_FEE / 100);
    return {
      monthly: ((baseLoan + upfront) * (USDA_ANNUAL_FEE / 100)) / 12,
      upfrontFinanced: upfront,
      annualPct: USDA_ANNUAL_FEE,
      label: 'USDA Guarantee Fee',
      applies: true,
    };
  }
  if (loanType === 'va') {
    const feePct = vaFundingFeePct(downPct);
    return {
      monthly: 0, // VA has no monthly MI
      upfrontFinanced: baseLoan * (feePct / 100),
      annualPct: 0,
      label: 'VA Funding Fee (financed)',
      applies: false, // no recurring MI row
    };
  }
  if (loanType === 'arm' || loanType === 'conventional') {
    const annualPct = pmiAnnualPct(ltv, creditScore);
    return {
      monthly: annualPct > 0 ? (baseLoan * (annualPct / 100)) / 12 : 0,
      upfrontFinanced: 0,
      annualPct,
      label: annualPct > 0 ? 'Private Mortgage Insurance (PMI)' : 'Mortgage Insurance',
      applies: annualPct > 0,
    };
  }
  return { monthly: 0, upfrontFinanced: 0, annualPct: 0, label: 'Mortgage Insurance', applies: false };
}

/** Solve APR (%) from the financed loan, payment, term, and prepaid finance charges. */
export function computeApr(
  financedLoan: number,
  monthly: number,
  termYears: number,
  prepaidFinanceCharges: number,
): number {
  const n = Math.max(1, Math.round(termYears * 12));
  const amountFinanced = financedLoan - prepaidFinanceCharges;
  if (amountFinanced <= 0 || monthly <= 0) return 0;
  // Find monthly rate i where amountFinanced = monthly * (1 - (1+i)^-n) / i  (bisection)
  const pv = (i: number) => (i === 0 ? monthly * n : (monthly * (1 - Math.pow(1 + i, -n))) / i);
  let lo = 0;
  let hi = 1; // 100%/mo upper bound, plenty
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > amountFinanced) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export interface AmortRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  cumulativeInterest: number;
}

/** Full amortization schedule, optionally with an extra monthly principal payment. */
export function amortizationSchedule(
  principal: number,
  annualRatePct: number,
  termYears: number,
  extraMonthly = 0,
): AmortRow[] {
  const rows: AmortRow[] = [];
  const r = annualRatePct / 100 / 12;
  const base = monthlyPayment(principal, annualRatePct, termYears);
  let balance = principal;
  let cumulativeInterest = 0;
  const maxMonths = Math.round(termYears * 12) + 600; // guard
  for (let month = 1; balance > 0.005 && month <= maxMonths; month++) {
    const interest = balance * r;
    let principalPaid = base - interest + extraMonthly;
    if (principalPaid > balance) principalPaid = balance;
    const payment = interest + principalPaid;
    balance -= principalPaid;
    cumulativeInterest += interest;
    rows.push({ month, payment, principal: principalPaid, interest, balance: Math.max(0, balance), cumulativeInterest });
  }
  return rows;
}

export interface ScenarioResult {
  typeLabel: string;
  baseLoan: number;
  financedLoan: number;
  ltv: number;
  pi: number;
  taxes: number;
  insurance: number;
  mi: MortgageInsurance;
  totalMonthly: number;
  apr: number;
  totalInterest: number;
  payoffMonths: number;
  closingCosts: number;
  creditsApplied: number;
  cashToClose: number;
  subline: string;
}

const TYPE_LABELS: Record<LoanType, string> = {
  conventional: 'Conventional',
  fha: 'FHA',
  va: 'VA',
  usda: 'USDA',
  arm: 'ARM',
};

export function loanTypeLabel(t: LoanType): string {
  return TYPE_LABELS[t] ?? 'Loan';
}

/** Compute the full result set for one scenario. */
export function computeScenario(s: Scenario): ScenarioResult {
  const homeValue = s.homePrice || 0;
  const baseLoan = Math.max(0, homeValue - (s.downPayment || 0));
  const termYears = parseInt(s.term, 10) || 30;
  const creditScore = parseInt(s.credit, 10) || 700;
  const ltv = ltvPct(baseLoan, homeValue);

  const mi = mortgageInsurance(s.loanType, baseLoan, homeValue, s.downPct || 0, creditScore, termYears);
  const financedLoan = baseLoan + mi.upfrontFinanced;

  const pi = monthlyPayment(financedLoan, s.rate || 0, termYears);
  const taxRate = s.taxRatePct ?? DEFAULT_TAX_RATE;
  const insRate = s.insuranceRatePct ?? DEFAULT_INSURANCE_RATE;
  const taxes = (homeValue * (taxRate / 100)) / 12;
  const insurance = (homeValue * (insRate / 100)) / 12;
  const totalMonthly = pi + taxes + insurance + mi.monthly;

  const schedule = amortizationSchedule(financedLoan, s.rate || 0, termYears);
  const totalInterest = schedule.length ? schedule[schedule.length - 1].cumulativeInterest : 0;
  const payoffMonths = schedule.length;

  // APR: treat estimated lender fees + financed upfront MI as prepaid finance charges.
  const lenderFees = baseLoan * 0.005 + 1200; // ~0.5% origination + fixed fees
  const apr = computeApr(financedLoan, pi, termYears, mi.upfrontFinanced + lenderFees);

  const closingCosts = baseLoan * DEFAULT_CLOSING_RATE;
  const creditsApplied = (s.lenderCredit || 0) + (s.sellerCredit || 0) + (s.otherCredits || 0);
  const cashToClose = Math.max(0, (s.downPayment || 0) + closingCosts - creditsApplied);

  return {
    typeLabel: loanTypeLabel(s.loanType),
    baseLoan,
    financedLoan,
    ltv,
    pi,
    taxes,
    insurance,
    mi,
    totalMonthly,
    apr,
    totalInterest,
    payoffMonths,
    closingCosts,
    creditsApplied,
    cashToClose,
    subline: `${Math.round(baseLoan).toLocaleString('en-US')} loan · ${s.rate || 0}% · ${s.term} yr · ${Math.round(ltv)}% LTV`,
  };
}

// ---------------------------------------------------------------------------
// HECM (reverse mortgage) — principal limit factors.
// Interpolated table of PLFs by youngest-borrower age and expected rate, derived
// from the shape of HUD's published PLF tables (10/2017 onward). Approximate but
// monotonic in the right directions; swap in the exact HUD CSV for production.
// ---------------------------------------------------------------------------
const PLF_AGES = [62, 65, 70, 75, 80, 85, 90];
const PLF_RATES = [3, 4, 5, 6, 7, 8]; // expected rate %
// rows = ages, cols = rates
const PLF_TABLE: number[][] = [
  [0.524, 0.45, 0.375, 0.31, 0.26, 0.22], // 62
  [0.548, 0.474, 0.4, 0.334, 0.282, 0.24], // 65
  [0.594, 0.522, 0.448, 0.382, 0.328, 0.282], // 70
  [0.642, 0.572, 0.5, 0.434, 0.378, 0.33], // 75
  [0.694, 0.626, 0.556, 0.49, 0.432, 0.382], // 80
  [0.752, 0.688, 0.622, 0.556, 0.498, 0.446], // 85
  [0.79, 0.74, 0.69, 0.636, 0.582, 0.532], // 90
];

function interp(x: number, xs: number[], lerp: (i: number, t: number) => number): number {
  if (x <= xs[0]) return lerp(0, 0);
  if (x >= xs[xs.length - 1]) return lerp(xs.length - 1, 0);
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return lerp(i, t);
    }
  }
  return lerp(xs.length - 1, 0);
}

/** Bilinear interpolation of the PLF table. */
export function principalLimitFactor(age: number, expectedRatePct: number): number {
  const a = Math.max(62, age || 62);
  const rate = Math.max(PLF_RATES[0], Math.min(PLF_RATES[PLF_RATES.length - 1], expectedRatePct || 5));
  return interp(a, PLF_AGES, (ai, at) => {
    const rowLo = PLF_TABLE[ai];
    const rowHi = PLF_TABLE[Math.min(ai + 1, PLF_TABLE.length - 1)];
    const valLo = interp(rate, PLF_RATES, (ri, rt) => rowLo[ri] + (rowLo[Math.min(ri + 1, rowLo.length - 1)] - rowLo[ri]) * rt);
    const valHi = interp(rate, PLF_RATES, (ri, rt) => rowHi[ri] + (rowHi[Math.min(ri + 1, rowHi.length - 1)] - rowHi[ri]) * rt);
    return valLo + (valHi - valLo) * at;
  });
}

export interface HecmResult {
  plf: number;
  maxClaim: number;
  grossPrincipalLimit: number;
  available: number;
  payoutLabel: string;
}

export function computeHecm(age: number, value: number, mortgage: number, rate: number, payout: string): HecmResult {
  const plf = principalLimitFactor(age, rate);
  const maxClaim = Math.min(value || 0, HECM_MAX_CLAIM);
  const grossPrincipalLimit = maxClaim * plf;
  const available = Math.max(0, grossPrincipalLimit - (mortgage || 0));
  const labels: Record<string, string> = { lump: 'Lump Sum', tenure: 'Tenure', line: 'Line of Credit' };
  return { plf, maxClaim, grossPrincipalLimit, available, payoutLabel: labels[payout] || 'Lump Sum' };
}

// ---------------------------------------------------------------------------
// Rate buydowns
// ---------------------------------------------------------------------------

/** Per-year reduction schedules for the common temporary buydown structures. */
export const TEMP_BUYDOWN_STRUCTURES: Record<string, { label: string; reductions: number[] }> = {
  '1-0': { label: '1-0', reductions: [1] },
  '1-1': { label: '1-1', reductions: [1, 1] },
  '2-1': { label: '2-1', reductions: [2, 1] },
  '3-2-1': { label: '3-2-1', reductions: [3, 2, 1] },
};

export interface TempBuydownYear {
  year: number;
  rate: number;
  monthly: number;
  monthlySaved: number;
  annualSaved: number;
}

export interface TempBuydownResult {
  noteMonthly: number;
  schedule: TempBuydownYear[];
  /** Total escrow needed to fund the temporary buydown (paid by seller/lender/buyer). */
  subsidyCost: number;
  firstYearMonthly: number;
  firstYearSavings: number;
}

/**
 * Temporary buydown: the rate is reduced for the first N years, then snaps back to
 * the note rate. The funded subsidy = the sum of monthly payment differences over the
 * buydown period (the reduced payment is the standard note-amount/full-term payment at
 * each reduced rate).
 */
export function temporaryBuydown(
  loan: number,
  noteRate: number,
  termYears: number,
  reductions: number[],
): TempBuydownResult {
  const noteMonthly = monthlyPayment(loan, noteRate, termYears);
  let subsidyCost = 0;
  const schedule: TempBuydownYear[] = reductions.map((red, i) => {
    const rate = Math.max(0, noteRate - red);
    const monthly = monthlyPayment(loan, rate, termYears);
    const monthlySaved = noteMonthly - monthly;
    const annualSaved = monthlySaved * 12;
    subsidyCost += annualSaved;
    return { year: i + 1, rate, monthly, monthlySaved, annualSaved };
  });
  return {
    noteMonthly,
    schedule,
    subsidyCost,
    firstYearMonthly: schedule[0]?.monthly ?? noteMonthly,
    firstYearSavings: schedule[0]?.monthlySaved ?? 0,
  };
}

export interface PermBuydownResult {
  noteMonthly: number;
  buydownMonthly: number;
  monthlySavings: number;
  /** Upfront cost in dollars (points % of loan). */
  cost: number;
  /** Months to recoup the cost from the lower payment. */
  breakEvenMonths: number;
  /** Interest saved over the full loan term. */
  lifetimeInterestSaved: number;
  /** Net benefit if the borrower keeps the loan for `holdYears` (savings − cost). */
  netOverHold: number;
}

/**
 * Permanent buydown (discount points): the borrower pays points upfront to permanently
 * lower the rate for the life of the loan.
 */
export function permanentBuydown(
  loan: number,
  noteRate: number,
  boughtRate: number,
  termYears: number,
  pointsPct: number,
  holdYears: number,
): PermBuydownResult {
  const noteMonthly = monthlyPayment(loan, noteRate, termYears);
  const buydownMonthly = monthlyPayment(loan, boughtRate, termYears);
  const monthlySavings = noteMonthly - buydownMonthly;
  const cost = (loan * pointsPct) / 100;
  const breakEvenMonths = monthlySavings > 0 ? cost / monthlySavings : Infinity;
  const noteInterest = amortizationSchedule(loan, noteRate, termYears).reduce((a, r) => a + r.interest, 0);
  const buyInterest = amortizationSchedule(loan, boughtRate, termYears).reduce((a, r) => a + r.interest, 0);
  return {
    noteMonthly,
    buydownMonthly,
    monthlySavings,
    cost,
    breakEvenMonths,
    lifetimeInterestSaved: noteInterest - buyInterest,
    netOverHold: monthlySavings * holdYears * 12 - cost,
  };
}
