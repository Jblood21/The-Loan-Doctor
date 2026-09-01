// Shared domain types for LoanDr.

export type TransactionType = 'purchase' | 'refinance';
export type LoanType = 'conventional' | 'fha' | 'va' | 'usda' | 'arm';
export type LoanProgram = 'standard' | 'homeready' | 'homepossible' | 'firsttime';
export type LoanTerm = '30' | '20' | '15' | '10';
export type PayoutOption = 'lump' | 'tenure' | 'line';

/** How a closing-cost line item is computed.
 *  flat / loan / price are manual; the `title-*` bases auto-read the title-insurance
 *  rate schedule (src/lib/titleFees.ts) by purchase price or loan amount. */
export type FeeBasis =
  | 'flat'
  | 'loan'
  | 'price'
  | 'title-owners'
  | 'title-homeowners'
  | 'title-builder'
  | 'title-loan'
  | 'title-refi';

export interface ClosingCostItem {
  id: string;
  label: string;
  basis: FeeBasis;
  /** Dollar amount when basis is 'flat', otherwise a percentage. */
  value: number;
}

export interface Scenario {
  /** Server id, present once persisted. */
  id?: string;
  name: string;
  transaction: TransactionType;
  borrowers: '1' | '2';
  loanType: LoanType;
  program: LoanProgram;
  homePrice: number;
  downPayment: number;
  downPct: number;
  rate: number;
  term: LoanTerm;
  /** Representative credit score for the chosen band, e.g. "700". */
  credit: string;
  lenderCredit: number;
  sellerCredit: number;
  otherCredits: number;
  /** Itemized closing costs (base + custom fees). When empty, a 3% estimate is used. */
  closingCosts?: ClosingCostItem[];
  /** Optional per-scenario override for property tax rate (%/yr of home value). */
  taxRatePct?: number;
  /** Optional per-scenario override for homeowners insurance rate (%/yr of home value). */
  insuranceRatePct?: number;
  /** Manual monthly property tax ($/mo). When set, overrides the auto % calculation. */
  taxMonthly?: number;
  /** Manual monthly homeowners insurance ($/mo). When set, overrides the auto % calculation. */
  insuranceMonthly?: number;
  /** Monthly HOA dues ($/mo). 0/undefined = none. */
  hoaMonthly?: number;
}

export interface HecmInputs {
  /** Traditional reverse refinance vs. HECM for Purchase. */
  mode: 'refinance' | 'purchase';
  age: number;
  /** Appraised home value (refinance) or purchase price (purchase). */
  value: number;
  mortgage: number;
  /** Other liens/debts the borrower wants paid off from proceeds. */
  otherDebts: number;
  payout: PayoutOption;
  rate: number;
}

export interface Settings {
  // My Account
  name: string;
  company: string;
  phone: string;
  nmls: string;
  email: string;
  officerTitle: string;
  /** Custom letterhead logo as a data URL (overrides the built-in logo). */
  logoDataUrl?: string;
  /** Saved signature (transparent PNG data URL) auto-filled into pre-approval letters. */
  signatureDataUrl?: string;
  // Lender Information
  lenderName: string;
  lenderNmls: string;
  website: string;
  lenderAddress: string;
  lenderPhone: string;
  // Dual Branding (real-estate agent)
  agentName: string;
  brokerage: string;
  agentPhone: string;
  // Title / Settlement
  titleCompany: string;
  titleFeesPct: number;
  titleAgentName: string;
  // Default closing-cost fee schedule used to seed new scenarios.
  feeDefaults: ClosingCostItem[];
  // Preferences
  darkMode: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  nmls: string;
  role: 'user' | 'admin';
  status?: 'Active' | 'Trial' | 'Inactive';
  createdAt?: string;
  scenarioCount?: number;
}

export interface AdminStat {
  label: string;
  value: string;
  delta: string;
}

/** A pre-approval letter that was issued — the historical record tied to a borrower. */
export interface PreApprovalRecord {
  id: string;
  borrowerName: string;
  propertyAddress: string;
  loanType: string;
  transaction: string;
  price: number;
  loanAmount: number;
  downPayment: number;
  rate: number;
  term: string;
  monthlyPayment: number;
  apr: number;
  reLine: string;
  validityDays: number;
  issuedAt: string;
}

export interface PreApprovalState {
  source: 'scenario' | 'los' | 'import';
  scenarioIdx: number;
  losProvider: 'arive' | 'encompass' | 'calyx' | 'byte';
  losConnected: boolean;
  losQuery: string;
  borrowerName: string;
  propertyAddress: string;
  expDays: '30' | '60' | '90';
}
