// Central Loan Program Rules — the single source of truth for program-specific
// figures and notes used by the comparison engine.
//
// WHY THIS FILE EXISTS
// The mortgage-comparison spec calls for program rules to live as *configuration*,
// not scattered through the calculation code or the UI, so they can be updated as
// program requirements change without touching the engine. This module holds the
// numbers (MIP/PMI/funding-fee/guarantee-fee rates and thresholds) plus metadata
// (as-of date, sources, volatility notes) and borrower-facing note templates.
//
// Phase 1 of the rebuild: extracting these figures verbatim from the finance engine
// with ZERO behavior change — every value here matches what finance.ts used before.
// Later phases add per-scenario toggles and dynamic report rows on top of this config.
//
// MAINTENANCE: re-verify each figure against its authoritative source on the cadence
// noted below and bump RATES_AS_OF. Do NOT hardcode PMI as a firm number — it is a
// per-insurer estimate range that changes frequently.

/** Human-facing "rates as of" stamp. Bump when any figure below is re-verified. */
export const RATES_AS_OF = 'March 2023 (FHA MIP) · 2025 program year';

export interface ProgramMeta {
  /** Short label for the program. */
  label: string;
  /** When these figures were last verified. */
  asOf: string;
  /** Authoritative sources to re-verify against. */
  sources: string[];
  /** Volatility / maintenance notes and known caveats. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Conventional (Fannie Mae / Freddie Mac) — borrower-paid monthly PMI (BPMI)
// ---------------------------------------------------------------------------
export const CONVENTIONAL = {
  meta: {
    label: 'Conventional',
    asOf: '2025',
    sources: ['Fannie Mae', 'Freddie Mac', 'CFPB (HPA)', 'Private MI rate cards (MGIC/Radian/Essent/Arch/Enact/National MI)'],
    notes: [
      'PMI applies only when the down payment is under 20% (LTV > 80%).',
      'PMI factors approximate national MI rate cards and vary by LTV and credit score; they are ESTIMATES that change frequently and per-insurer — never present as a firm quote.',
      'PMI auto-terminates at 78% LTV of the original value (Homeowners Protection Act), and a borrower may request cancellation at 80% LTV.',
    ],
  } as ProgramMeta,

  /** Whether monthly MI can apply. */
  monthlyMortgageInsurance: 'conditional' as const,
  upfrontFee: false,
  fundingFee: false,

  /** PMI auto-termination LTV ratio (fraction of original value) — HPA. */
  pmiCancelLtvRatio: 0.78,

  /**
   * Conventional PMI annual premium (% of loan). Ordered ASCENDING by maxLtv so the
   * tightest applicable band wins (LTV 90 → the ≤90 band, not ≤97). Each byCredit
   * entry is [minScore, annualPct]; the first tier whose minScore ≤ score wins.
   */
  pmiTable: [
    { maxLtv: 85, byCredit: [[760, 0.14], [740, 0.16], [720, 0.19], [700, 0.21], [680, 0.27], [660, 0.34], [640, 0.38], [0, 0.46]] },
    { maxLtv: 90, byCredit: [[760, 0.19], [740, 0.23], [720, 0.3], [700, 0.38], [680, 0.52], [660, 0.66], [640, 0.78], [0, 0.94]] },
    { maxLtv: 95, byCredit: [[760, 0.3], [740, 0.38], [720, 0.54], [700, 0.7], [680, 0.9], [660, 1.1], [640, 1.32], [0, 1.55]] },
    { maxLtv: 97, byCredit: [[760, 0.41], [740, 0.55], [720, 0.7], [700, 0.87], [680, 1.1], [660, 1.36], [640, 1.6], [0, 1.84]] },
  ] as { maxLtv: number; byCredit: [number, number][] }[],
};

// ---------------------------------------------------------------------------
// FHA (HUD) — upfront MIP (financed) + annual MIP
// ---------------------------------------------------------------------------
export const FHA = {
  meta: {
    label: 'FHA',
    asOf: 'March 20, 2023 (HUD Mortgagee Letter 2023-05)',
    sources: ['HUD Handbook 4000.1', 'HUD Mortgagee Letters'],
    notes: [
      'FHA loans require mortgage insurance: an upfront premium (UFMIP) plus an ongoing annual MIP.',
      'UFMIP is financed into the loan by default.',
      'Annual MIP factors were set by HUD ML 2023-05 (effective March 20, 2023) and change by Mortgagee Letter.',
      'KNOWN STALE: highBalanceThreshold (726200) is the 2023 conforming baseline. It should track the current FHFA conforming loan limit (~806,500 for 2025). VERIFY against HUD 4000.1 / the latest ML before relying on the high-balance factors.',
      'MIP duration: term > 15 yr with LTV > 90% at origination → life of loan; otherwise ~11 years.',
    ],
  } as ProgramMeta,

  monthlyMortgageInsurance: true,
  upfrontFee: true,
  fundingFee: false,

  /** Upfront MIP as a % of the base loan (financed). */
  upfrontMipPct: 1.75,

  /** Base-loan threshold above which the higher "high-balance" annual MIP applies. */
  highBalanceThreshold: 726200,

  /** Annual MIP (%) grid, selected by term length, high-balance, and LTV break. */
  annualMip: {
    longTerm: {
      // term > 15 years; break at 95% LTV
      standard: { gt95: 0.55, le95: 0.5 },
      highBalance: { gt95: 0.75, le95: 0.7 },
    },
    shortTerm: {
      // term ≤ 15 years
      standard: { gt90: 0.4, le90: 0.15 },
      highBalance: { gt90: 0.65, gt78: 0.4, le78: 0.15 },
    },
  },

  /** LTV at origination above which MIP runs the life of the loan (else cancellable). */
  mipLifeOfLoanLtv: 90,
  /** Months MIP is paid when it is cancellable (~11 years). */
  mipCancellableMonths: 132,

  programNotes: [
    'FHA loans include mortgage insurance: an upfront premium (financed) and an ongoing annual MIP.',
  ],
};

// ---------------------------------------------------------------------------
// VA — funding fee (financed), no monthly MI
// ---------------------------------------------------------------------------
export const VA = {
  meta: {
    label: 'VA',
    asOf: 'Effective Jan 1, 2020 (Blue Water Navy Vietnam Veterans Act) — 2025 schedule',
    sources: ['U.S. Department of Veterans Affairs', '38 U.S.C.'],
    notes: [
      'VA-backed loans have no monthly PMI; instead a one-time funding fee (typically financed).',
      'The funding fee depends on down payment and whether the benefit is used for the first time or a subsequent time.',
      'The funding fee is WAIVED for veterans receiving VA disability compensation, Purple Heart recipients serving on active duty, and qualifying surviving spouses.',
      'Rates are statutory and change on specific effective dates — guard by effective date rather than treating as permanent.',
    ],
  } as ProgramMeta,

  monthlyMortgageInsurance: false,
  upfrontFee: false,
  fundingFee: 'conditional' as const,

  /**
   * Funding fee (%), by down-payment tier. Only the <5%-down tier differs for
   * subsequent use; the 5%+ and 10%+ tiers are the same either way.
   */
  fundingFee_purchase: {
    down10: 1.25, // ≥ 10% down
    down5: 1.5, // 5%–9.99% down
    firstUseLow: 2.15, // < 5% down, first use
    subsequentUseLow: 3.3, // < 5% down, subsequent use
  },

  programNotes: [
    'VA funding fee may apply depending on eligibility, down payment, and first vs. subsequent use; it is waived for exempt borrowers.',
    'VA loans do not require monthly mortgage insurance.',
  ],
};

// ---------------------------------------------------------------------------
// USDA (Rural Development, Section 502 Guaranteed) — upfront + annual fee
// ---------------------------------------------------------------------------
export const USDA = {
  meta: {
    label: 'USDA',
    asOf: 'Federal fiscal year 2025 (Oct 2024 – Sep 2025)',
    sources: ['USDA Rural Development', 'CFPB'],
    notes: [
      'USDA Guaranteed loans have their own mortgage-insurance-like structure: an upfront guarantee fee (financed) plus an annual fee for the life of the loan.',
      'Fees are reviewed and re-published each federal fiscal year (Oct 1) — re-verify at each rollover.',
      'The annual fee is charged on the average scheduled unpaid balance; the figure used here is a level (year-1) approximation.',
    ],
  } as ProgramMeta,

  monthlyMortgageInsurance: true,
  upfrontFee: true,
  fundingFee: false,

  /** Upfront guarantee fee as a % of the loan (financed). */
  upfrontFeePct: 1.0,
  /** Annual fee as a % of the balance (level approximation). */
  annualFeePct: 0.35,

  programNotes: ['USDA loans include an upfront guarantee fee (financed) and an ongoing annual fee.'],
};

/** Every program keyed by the app's LoanType values (ARM reuses conventional rules). */
export const LOAN_PROGRAM_RULES = {
  conventional: CONVENTIONAL,
  arm: CONVENTIONAL,
  fha: FHA,
  va: VA,
  usda: USDA,
};
