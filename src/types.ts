// Shared domain types for LoanDr.

export type TransactionType = 'purchase' | 'refinance';
export type LoanType = 'conventional' | 'fha' | 'va' | 'usda' | 'arm';
export type LoanProgram = 'standard' | 'homeready' | 'homepossible' | 'firsttime';
export type LoanTerm = '30' | '20' | '15' | '10';
export type PayoutOption = 'lump' | 'tenure' | 'line';

/** How a closing-cost line item is computed. */
export type FeeBasis = 'flat' | 'loan' | 'price';

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

export interface PreApprovalState {
  source: 'scenario' | 'los';
  scenarioIdx: number;
  losProvider: 'arive' | 'encompass' | 'calyx' | 'byte';
  losConnected: boolean;
  losQuery: string;
  borrowerName: string;
  propertyAddress: string;
  expDays: '30' | '60' | '90';
}
