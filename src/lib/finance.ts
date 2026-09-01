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

import type { ClosingCostItem, LoanType, Scenario, TransactionType } from '@/types';
import { buildTitleScheduleFees, titleBasisAmount } from './titleFees';

export const DEFAULT_TAX_RATE = 1.25; // %/yr of home value
export const DEFAULT_INSURANCE_RATE = 0.35; // %/yr of home value
export const DEFAULT_CLOSING_RATE = 0.03; // 3% of loan, rough fallback estimate
/** FHA national HECM max claim amount (2025 lending limit). */
export const HECM_MAX_CLAIM = 1209750;

// ---------------------------------------------------------------------------
// Closing costs — itemized base + custom fees
// ---------------------------------------------------------------------------

let _feeSeq = 0;
const feeId = () => `f${++_feeSeq}`;

/** A starter set of common closing-cost line items the LO can edit/extend.
 *  Lender fees are manual; the title block is driven by the title rate schedule
 *  (titleFees.ts) so its amounts auto-update from the scenario's price/loan. */
export function defaultClosingCosts(transaction: TransactionType = 'purchase'): ClosingCostItem[] {
  const lender: ClosingCostItem[] = [
    { id: feeId(), label: 'Origination Fee', basis: 'loan', value: 1.0 },
    { id: feeId(), label: 'Underwriting / Processing', basis: 'flat', value: 1195 },
    { id: feeId(), label: 'Appraisal', basis: 'flat', value: 650 },
    { id: feeId(), label: 'Credit Report', basis: 'flat', value: 75 },
  ];
  const title = buildTitleScheduleFees({ transaction, mode: 'full', newId: feeId });
  const tail: ClosingCostItem[] = transaction === 'purchase' ? [{ id: feeId(), label: 'Transfer Tax', basis: 'price', value: 0 }] : [];
  return [...lender, ...title, ...tail];
}

/** Resolve one fee line to a dollar amount. */
export function closingCostAmount(item: ClosingCostItem, loan: number, price: number): number {
  if (item.basis === 'loan') return (loan * (item.value || 0)) / 100;
  if (item.basis === 'price') return (price * (item.value || 0)) / 100;
  const title = titleBasisAmount(item.basis, loan, price);
  if (title !== null) return title;
  return item.value || 0;
}

export function totalClosingCosts(items: ClosingCostItem[], loan: number, price: number): number {
  return (items || []).reduce((sum, it) => sum + closingCostAmount(it, loan, price), 0);
}

// Which fees count as APR "finance charges" (Reg Z): lender-retained charges —
// origination/points (% of loan), plus flat lender fees by label. Third-party
// costs (appraisal, title, recording, transfer tax, credit) are excluded, as is
// anything unrecognized (conservative — never overstates APR).
const FINANCE_CHARGE_RE = /originat|underwrit|processing|application|discount|points|admin|commitment|rate.?lock|broker/i;
export function isFinanceCharge(item: ClosingCostItem): boolean {
  if (item.basis === 'loan') return true;
  if (item.basis === 'price' || item.basis.startsWith('title-')) return false;
  return FINANCE_CHARGE_RE.test(item.label || '');
}
export function financeCharges(items: ClosingCostItem[], loan: number, price: number): number {
  return (items || []).filter(isFinanceCharge).reduce((sum, it) => sum + closingCostAmount(it, loan, price), 0);
}

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

/** FHA base-loan threshold above which the higher "high-balance" MIP applies. */
export const FHA_HIGH_BALANCE = 726200;

/** FHA annual MIP (%) — by term, LTV, and whether the base loan is high-balance.
 *  Reflects the schedule effective March 2023 (the 30-yr break is at 95% LTV). */
export function fhaAnnualMipPct(ltv: number, termYears: number, baseLoan = 0): number {
  const highBalance = baseLoan > FHA_HIGH_BALANCE;
  if (termYears > 15) {
    if (highBalance) return ltv > 95 ? 0.75 : 0.7;
    return ltv > 95 ? 0.55 : 0.5;
  }
  // 15-year (and shorter) terms
  if (highBalance) return ltv > 90 ? 0.65 : ltv > 78 ? 0.4 : 0.15;
  return ltv > 90 ? 0.4 : 0.15;
}
export const FHA_UPFRONT_MIP = 1.75; // % of base loan, financed
export const USDA_UPFRONT_FEE = 1.0; // % of loan, financed
export const USDA_ANNUAL_FEE = 0.35; // % of balance, ~constant approximation

/** VA funding fee (%), tiered by down payment. Only the <5%-down tier differs for
 *  subsequent use (3.3% vs 2.15%); the 5%+ and 10%+ tiers are the same either way. */
export function vaFundingFeePct(downPct: number, subsequentUse = false): number {
  if (downPct >= 10) return 1.25;
  if (downPct >= 5) return 1.5;
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
    const annualPct = fhaAnnualMipPct(ltv, termYears, baseLoan);
    const upfront = baseLoan * (FHA_UPFRONT_MIP / 100);
    return {
      // Annual MIP is quoted on the base loan amount (not base + financed UFMIP).
      monthly: (baseLoan * (annualPct / 100)) / 12,
      upfrontFinanced: upfront,
      annualPct,
      label: 'FHA Mortgage Insurance (MIP)',
      applies: true,
    };
  }
  if (loanType === 'usda') {
    const upfront = baseLoan * (USDA_UPFRONT_FEE / 100);
    return {
      // Annual fee is quoted on the (base) loan balance, not base + financed upfront.
      monthly: (baseLoan * (USDA_ANNUAL_FEE / 100)) / 12,
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

/**
 * Solve APR (%) from the financed loan, the P&I payment, term, and prepaid finance
 * charges. Recurring mortgage insurance is a Reg Z finance charge, so when it applies
 * it is added to the payment stream for the months it is actually paid (miMonthly for
 * the first miMonths payments) — otherwise a high-LTV/FHA loan's APR collapses to the
 * note rate and understates the true cost. miMonthly/miMonths default to 0 (P&I only).
 */
export function computeApr(
  financedLoan: number,
  monthly: number,
  termYears: number,
  prepaidFinanceCharges: number,
  miMonthly = 0,
  miMonths = 0,
): number {
  const n = Math.max(1, Math.round(termYears * 12));
  const amountFinanced = financedLoan - prepaidFinanceCharges;
  if (amountFinanced <= 0 || monthly <= 0) return 0;
  const mi = miMonthly > 0 ? miMonthly : 0;
  const miN = Math.max(0, Math.min(n, Math.round(miMonths)));
  // amountFinanced = PV of the payment stream at monthly rate i (bisection). The stream
  // is level P&I for n months plus MI for the first miN months (closed-form annuities).
  const pv = (i: number) => {
    if (i === 0) return monthly * n + mi * miN;
    const level = (monthly * (1 - Math.pow(1 + i, -n))) / i;
    const miPv = mi > 0 && miN > 0 ? (mi * (1 - Math.pow(1 + i, -miN))) / i : 0;
    return level + miPv;
  };
  let lo = 0;
  let hi = 1; // 100%/mo upper bound, plenty
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > amountFinanced) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

/**
 * How many months recurring MI is included in the APR payment stream:
 *  • Conventional/ARM PMI auto-terminates when the scheduled balance reaches 78% of the
 *    original value (Homeowners Protection Act).
 *  • FHA MIP runs the life of the loan when LTV > 90% at origination, else ~11 years.
 *  • USDA annual fee runs the life of the loan.
 */
function miAprMonths(
  loanType: LoanType,
  ltv: number,
  schedule: AmortRow[],
  homeValue: number,
): number {
  const n = schedule.length;
  if (loanType === 'fha') return ltv > 90 ? n : Math.min(132, n);
  if (loanType === 'usda') return n;
  if (loanType === 'conventional' || loanType === 'arm') {
    if (homeValue <= 0) return n;
    const threshold = 0.78 * homeValue;
    const idx = schedule.findIndex((row) => row.balance <= threshold);
    return idx === -1 ? n : idx + 1;
  }
  return 0;
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
  hoa: number;
  mi: MortgageInsurance;
  totalMonthly: number;
  apr: number;
  totalInterest: number;
  payoffMonths: number;
  closingCosts: number;
  closingItemized: boolean;
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

  // Derive the down-payment % from the dollars that actually built baseLoan, so the VA
  // funding-fee tier can't disagree with a separately-stored downPct field.
  const downPct = homeValue > 0 ? ((s.downPayment || 0) / homeValue) * 100 : s.downPct || 0;
  const mi = mortgageInsurance(s.loanType, baseLoan, homeValue, downPct, creditScore, termYears);
  const financedLoan = baseLoan + mi.upfrontFinanced;

  const pi = monthlyPayment(financedLoan, s.rate || 0, termYears);
  const taxRate = s.taxRatePct ?? DEFAULT_TAX_RATE;
  const insRate = s.insuranceRatePct ?? DEFAULT_INSURANCE_RATE;
  // A manual $/mo entry (taxMonthly / insuranceMonthly) overrides the auto % estimate.
  const taxes = s.taxMonthly != null ? Math.max(0, s.taxMonthly) : (homeValue * (taxRate / 100)) / 12;
  const insurance = s.insuranceMonthly != null ? Math.max(0, s.insuranceMonthly) : (homeValue * (insRate / 100)) / 12;
  const hoa = Math.max(0, s.hoaMonthly || 0);
  const totalMonthly = pi + taxes + insurance + hoa + mi.monthly;

  const schedule = amortizationSchedule(financedLoan, s.rate || 0, termYears);
  const totalInterest = schedule.length ? schedule[schedule.length - 1].cumulativeInterest : 0;
  const payoffMonths = schedule.length;

  const closingItemized = !!(s.closingCosts && s.closingCosts.length);
  const closingCosts = closingItemized
    ? totalClosingCosts(s.closingCosts as ClosingCostItem[], baseLoan, homeValue)
    : baseLoan * DEFAULT_CLOSING_RATE;

  // APR: prepaid finance charges = the lender/finance-charge portion of the itemized
  // fees (origination, points, underwriting…) + financed upfront MI. Falls back to a
  // rough estimate only when fees aren't itemized.
  const prepaidFinanceCharges = closingItemized
    ? financeCharges(s.closingCosts as ClosingCostItem[], baseLoan, homeValue) + mi.upfrontFinanced
    : mi.upfrontFinanced + baseLoan * 0.005 + 1200;
  // Recurring MI is a finance charge — include it in the APR stream for the months it applies.
  const miMonths = mi.monthly > 0 ? miAprMonths(s.loanType, ltv, schedule, homeValue) : 0;
  const apr = computeApr(financedLoan, pi, termYears, prepaidFinanceCharges, mi.monthly, miMonths);
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
    hoa,
    mi,
    totalMonthly,
    apr,
    totalInterest,
    payoffMonths,
    closingCosts,
    creditsApplied,
    cashToClose,
    closingItemized,
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

export type HecmMode = 'refinance' | 'purchase';

export interface HecmComputeInput {
  mode: HecmMode;
  age: number;
  /** Appraised value (refinance) or purchase price (HECM for Purchase). */
  homeValue: number;
  existingMortgage: number;
  otherDebts: number;
  rate: number;
  payout: string;
}

export interface HecmResult {
  mode: HecmMode;
  plf: number;
  maxClaim: number;
  grossPrincipalLimit: number;
  /** Existing mortgage + other liens/debts paid from proceeds (refinance). */
  payoffTotal: number;
  /** Net cash available to the borrower (refinance). */
  available: number;
  /** Cash the borrower must bring (HECM for Purchase) = price − principal limit. */
  requiredDownPayment: number;
  payoutLabel: string;
}

/**
 * HECM principal limit + proceeds.
 *  - refinance: available = principal limit − (existing mortgage + other debts to pay off)
 *  - purchase (H4P): required down payment = purchase price − principal limit (borrower's investment;
 *    the HECM covers the rest and there is no monthly mortgage payment).
 * Max claim is capped at the FHA national lending limit.
 */
export function computeHecm(input: HecmComputeInput): HecmResult {
  const plf = principalLimitFactor(input.age, input.rate);
  const maxClaim = Math.min(input.homeValue || 0, HECM_MAX_CLAIM);
  const grossPrincipalLimit = maxClaim * plf;
  const labels: Record<string, string> = { lump: 'Lump Sum', tenure: 'Tenure', line: 'Line of Credit' };

  if (input.mode === 'purchase') {
    return {
      mode: 'purchase',
      plf,
      maxClaim,
      grossPrincipalLimit,
      payoffTotal: 0,
      available: 0,
      requiredDownPayment: Math.max(0, (input.homeValue || 0) - grossPrincipalLimit),
      payoutLabel: 'HECM for Purchase',
    };
  }

  const payoffTotal = (input.existingMortgage || 0) + (input.otherDebts || 0);
  return {
    mode: 'refinance',
    plf,
    maxClaim,
    grossPrincipalLimit,
    payoffTotal,
    available: Math.max(0, grossPrincipalLimit - payoffTotal),
    requiredDownPayment: 0,
    payoutLabel: labels[input.payout] || 'Lump Sum',
  };
}

// ---------------------------------------------------------------------------
// VA entitlement (bonus / second-tier)
// ---------------------------------------------------------------------------

/** 2025 baseline conforming loan limit (one-unit), used as the default county loan limit. */
export const VA_BASELINE_LIMIT = 806500;
export const VA_BASIC_ENTITLEMENT = 36000;

export interface VaEntitlementInput {
  purchasePrice: number;
  /** County one-unit loan limit (defaults to the national baseline). */
  countyLoanLimit: number;
  /** Veteran has full/restored entitlement (Blue Water Act: no county limit, no money down). */
  fullEntitlement: boolean;
  /** Prior VA loan balance still in use (used only when entitlement is partial). */
  priorLoanAmount: number;
  downPayment: number;
  /** Subsequent VA use raises the funding fee on low-down loans. */
  subsequentUse: boolean;
  /** Funding-fee exempt (e.g. service-connected disability). */
  fundingFeeExempt: boolean;
}

export interface VaEntitlementResult {
  fullEntitlement: boolean;
  maxGuaranty: number;
  entitlementUsed: number;
  availableEntitlement: number;
  /** Max loan with no money down (partial entitlement) — Infinity when full entitlement. */
  maxZeroDownLoan: number;
  requiredDownPayment: number;
  zeroDownEligible: boolean;
  guarantyOnLoan: number;
  fundingFeePct: number;
  fundingFee: number;
}

/**
 * VA second-tier (bonus) entitlement.
 * The lender needs VA guaranty + borrower equity ≥ 25% of the price. With full/restored
 * entitlement there is no county limit and no down payment (Blue Water Act, 2020). With
 * partial entitlement, available guaranty = 25%×county limit − entitlement already used,
 * the max no-down loan = available×4, and any shortfall to reach 25% must be covered by a
 * down payment.
 */
export function vaEntitlement(input: VaEntitlementInput): VaEntitlementResult {
  const price = input.purchasePrice || 0;
  const down = input.downPayment || 0;
  const downPct = price > 0 ? (down / price) * 100 : 0;
  const fundingFeePct = input.fundingFeeExempt ? 0 : vaFundingFeePct(downPct, input.subsequentUse);
  const loanAmount = Math.max(0, price - down);
  const fundingFee = loanAmount * (fundingFeePct / 100);
  const maxGuaranty = 0.25 * (input.countyLoanLimit || VA_BASELINE_LIMIT);

  if (input.fullEntitlement) {
    return {
      fullEntitlement: true,
      maxGuaranty,
      entitlementUsed: 0,
      availableEntitlement: maxGuaranty,
      maxZeroDownLoan: Infinity,
      requiredDownPayment: 0,
      zeroDownEligible: true,
      guarantyOnLoan: 0.25 * price,
      fundingFeePct,
      fundingFee,
    };
  }

  const entitlementUsed = 0.25 * (input.priorLoanAmount || 0);
  const availableEntitlement = Math.max(0, maxGuaranty - entitlementUsed);
  const maxZeroDownLoan = availableEntitlement * 4;
  const requiredDownPayment = Math.max(0, 0.25 * price - availableEntitlement);
  return {
    fullEntitlement: false,
    maxGuaranty,
    entitlementUsed,
    availableEntitlement,
    maxZeroDownLoan,
    requiredDownPayment,
    zeroDownEligible: requiredDownPayment <= 0,
    guarantyOnLoan: Math.min(availableEntitlement, 0.25 * price),
    fundingFeePct,
    fundingFee,
  };
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

// ---------------------------------------------------------------------------
// Seller net sheet — estimated proceeds from a home sale.
// ---------------------------------------------------------------------------

export interface SellerNetInput {
  salePrice: number;
  mortgagePayoff: number;
  /** Total agent commission as a % of sale price (both sides). */
  commissionPct: number;
  /** Seller-paid closing costs (title, transfer tax, attorney, escrow) in dollars. */
  sellerClosingCosts: number;
  /** Credits/concessions to the buyer in dollars. */
  concessions: number;
  /** Other liens/HOA/repairs paid at closing in dollars. */
  otherLiens: number;
}

export interface SellerNetResult {
  salePrice: number;
  commission: number;
  totalCosts: number;
  netProceeds: number;
  /** Net as a % of sale price. */
  netPct: number;
}

export function sellerNetSheet(i: SellerNetInput): SellerNetResult {
  const salePrice = i.salePrice || 0;
  const commission = salePrice * ((i.commissionPct || 0) / 100);
  const totalCosts = commission + (i.mortgagePayoff || 0) + (i.sellerClosingCosts || 0) + (i.concessions || 0) + (i.otherLiens || 0);
  const netProceeds = salePrice - totalCosts;
  return {
    salePrice,
    commission,
    totalCosts,
    netProceeds,
    netPct: salePrice > 0 ? (netProceeds / salePrice) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Cash-out refinance / debt consolidation.
// ---------------------------------------------------------------------------

export interface CashOutInput {
  homeValue: number;
  currentBalance: number;
  /** Current mortgage P&I payment. */
  currentPayment: number;
  /** Aggregate balance of consumer debts being rolled into the new loan. */
  debtBalance: number;
  /** Aggregate monthly payment of those consumer debts. */
  debtPayment: number;
  /** Additional cash the borrower takes out beyond paying off debts. */
  extraCash: number;
  newRate: number;
  newTermYears: number;
}

export interface CashOutResult {
  newLoanAmount: number;
  ltv: number;
  newPayment: number;
  /** Current mortgage payment + the debts' monthly payments. */
  currentTotalMonthly: number;
  /** currentTotalMonthly − newPayment (positive = lower monthly outflow). */
  monthlySavings: number;
  cashOut: number;
  debtsPaidOff: number;
}

export function cashOutConsolidation(i: CashOutInput): CashOutResult {
  const newLoanAmount = (i.currentBalance || 0) + (i.debtBalance || 0) + (i.extraCash || 0);
  const newPayment = monthlyPayment(newLoanAmount, i.newRate || 0, i.newTermYears || 30);
  const currentTotalMonthly = (i.currentPayment || 0) + (i.debtPayment || 0);
  return {
    newLoanAmount,
    ltv: i.homeValue > 0 ? (newLoanAmount / i.homeValue) * 100 : 0,
    newPayment,
    currentTotalMonthly,
    monthlySavings: currentTotalMonthly - newPayment,
    cashOut: i.extraCash || 0,
    debtsPaidOff: i.debtBalance || 0,
  };
}
