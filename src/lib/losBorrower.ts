// Turn a borrower pulled off the LOS/Zap feed into the loan scenario that drives a
// pre-approval letter, so the letter reflects the borrower's real terms instead of an
// unrelated default scenario. Kept pure and unit-tested because a wrong mapping here
// puts wrong numbers on a letter that goes out under the officer's signature.

import type { LoanType, Scenario } from '@/types';

/** The subset of borrower fields the feed may carry (all optional, free-text). */
export interface LosBorrowerInput {
  name?: string;
  amount?: string;
  rate?: string;
  loanType?: string;
  purpose?: string;
}

/** Strip formatting and parse a numeric string ("$415,000" → 415000, "6.375%" → 6.375). */
export const parseNum = (v: string | undefined): number => Number(String(v || '').replace(/[^0-9.]/g, ''));

/** Map a free-text loan-type string from the LOS/Zap to our LoanType, or null if unknown. */
export function mapLoanType(raw: string | undefined): LoanType | null {
  const s = (raw || '').toLowerCase();
  if (!s) return null;
  if (/\bfha\b/.test(s)) return 'fha';
  if (/\bva\b|veteran/.test(s)) return 'va';
  if (/usda|rural/.test(s)) return 'usda';
  if (/\barm\b|adjustable/.test(s)) return 'arm';
  if (/conv|conform/.test(s)) return 'conventional';
  return null;
}

export interface LosScenarioResult {
  scenario: Scenario;
  /** Human-readable list of the fields that actually came from the feed (for a banner). */
  fromFeed: string[];
}

/**
 * Build a letter scenario from a feed borrower, using `base` (the user's selected saved
 * scenario) for anything the feed doesn't provide. Returns null when the feed carried no
 * usable loan detail — the caller then keeps the explicit saved-scenario fallback rather
 * than guessing. The loan amount is mapped so the scenario's baseLoan equals it exactly
 * (homePrice = amount, downPayment = 0); price/down aren't in a typical feed, so they're
 * surfaced for confirmation rather than fabricated.
 */
export function losBorrowerToScenario(b: LosBorrowerInput, base: Scenario): LosScenarioResult | null {
  const amt = parseNum(b.amount);
  const hasAmt = Number.isFinite(amt) && amt > 0;
  const rate = parseNum(b.rate);
  const hasRate = Number.isFinite(rate) && rate > 0;
  const lt = mapLoanType(b.loanType);
  const hasPurpose = !!(b.purpose && b.purpose.trim());
  if (!hasAmt && !lt && !hasRate && !hasPurpose) return null;

  const isRefi = /refi/i.test(b.purpose || '');
  const fromFeed: string[] = [];
  if (hasAmt) fromFeed.push(`loan amount ${b.amount}`);
  if (lt) fromFeed.push(`${b.loanType} type`);
  if (hasPurpose) fromFeed.push(isRefi ? 'refinance' : 'purchase');
  if (hasRate) fromFeed.push(`${rate}% rate`);

  const scenario: Scenario = {
    ...base,
    name: (b.name || base.name || '').trim() || base.name,
    transaction: hasPurpose ? (isRefi ? 'refinance' : 'purchase') : base.transaction,
    loanType: lt || base.loanType,
    homePrice: hasAmt ? amt : base.homePrice,
    downPayment: hasAmt ? 0 : base.downPayment,
    downPct: hasAmt ? 0 : base.downPct,
    rate: hasRate ? rate : base.rate,
  };
  return { scenario, fromFeed };
}
