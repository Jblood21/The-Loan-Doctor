// Dynamic comparison model — decides which rows and program notes a comparison
// needs based on the ACTUAL scenarios selected, instead of forcing every scenario
// into one fixed template.
//
// This is the producer-side engine the spec calls for: given the scenarios, it
// identifies the loan programs present, adds only the program-specific rows that
// are relevant (FHA UFMIP/MIP only when an FHA scenario is present, VA funding fee
// only for VA, USDA fees only for USDA, PMI only when a conventional scenario
// actually carries it), hides rows nothing uses (e.g. HOA when every scenario is 0),
// and generates the matching program notes. It is pure and unit-tested; the on-screen
// notes and (in a later phase) the dynamic PDF both render from this one model.

import type { LoanType, Scenario } from '@/types';
import { computeScenario, type ScenarioResult } from './finance';
import { FHA, VA, USDA } from './loanProgramRules';
import { fmt, fmt2 } from './format';

export interface ComparisonColumn {
  name: string;
  loanType: LoanType;
  typeLabel: string;
  /** Representative credit score for the scenario, e.g. "700". */
  credit: string;
  /** Down-payment percent (rounded), for the column subheader. */
  downPct: number;
  /** Formatted cell values keyed by row key. */
  cells: Record<string, string>;
}

export interface ComparisonModel {
  /** Unique loan types present, in first-seen order. */
  programs: LoanType[];
  programLabels: string[];
  /** Whether more than one distinct loan program is being compared. */
  mixed: boolean;
  rows: { key: string; label: string }[];
  columns: ComparisonColumn[];
  notes: string[];
}

const DASH = '—';
const isConv = (t: LoanType) => t === 'conventional' || t === 'arm';

/** The value for one (row, scenario) cell. Program-specific rows show DASH for
 *  scenarios of a different program. */
function cellValue(key: string, s: Scenario, c: ScenarioResult): string {
  switch (key) {
    case 'price':
      return fmt(s.homePrice);
    case 'downPayment':
      return fmt(s.downPayment);
    case 'loanAmount':
      return fmt(Math.round(c.baseLoan));
    case 'rate':
      return `${s.rate || 0}%`;
    case 'pi':
      return fmt2(c.pi);
    case 'fhaUfmip':
      return s.loanType === 'fha' ? fmt(c.mi.upfrontFinanced) : DASH;
    case 'fhaMip':
      return s.loanType === 'fha' ? fmt2(c.mi.monthly) : DASH;
    case 'vaFundingFee':
      return s.loanType === 'va' ? (s.vaFundingFeeExempt ? 'Exempt ($0)' : fmt(c.mi.upfrontFinanced)) : DASH;
    case 'usdaUpfront':
      return s.loanType === 'usda' ? fmt(c.mi.upfrontFinanced) : DASH;
    case 'usdaAnnual':
      return s.loanType === 'usda' ? fmt2(c.mi.monthly) : DASH;
    case 'pmi':
      return isConv(s.loanType) && c.mi.applies ? fmt2(c.mi.monthly) : DASH;
    case 'taxes':
      return fmt2(c.taxes);
    case 'insurance':
      return fmt2(c.insurance);
    case 'hoa':
      return c.hoa > 0 ? fmt2(c.hoa) : 'NA';
    case 'totalMonthly':
      return fmt2(c.totalMonthly);
    case 'cashToClose':
      return fmt(c.cashToClose);
    default:
      return DASH;
  }
}

export function buildComparisonModel(scenarios: Scenario[]): ComparisonModel {
  const results = scenarios.map((s) => ({ s, c: computeScenario(s) }));

  const programs: LoanType[] = [];
  for (const { s } of results) if (!programs.includes(s.loanType)) programs.push(s.loanType);
  const has = (t: LoanType) => programs.includes(t);

  const anyFha = has('fha');
  const anyVa = has('va');
  const anyUsda = has('usda');
  const anyConvPmi = results.some(({ s, c }) => isConv(s.loanType) && c.mi.applies && c.mi.monthly > 0);
  const anyHoa = results.some(({ c }) => c.hoa > 0);
  const allRefi = results.length > 0 && results.every(({ s }) => s.transaction === 'refinance');

  // Build the dynamic row set: shared rows always, program-specific rows only when
  // their program is present, escrow/HOA only when relevant.
  const rows: { key: string; label: string }[] = [
    { key: 'price', label: allRefi ? 'Home Value' : 'Purchase Price' },
    { key: 'downPayment', label: 'Down Payment' },
    { key: 'loanAmount', label: 'Loan Amount' },
    { key: 'rate', label: 'Interest Rate' },
    { key: 'pi', label: 'Principal & Interest' },
  ];
  if (anyFha) {
    rows.push({ key: 'fhaUfmip', label: 'FHA Upfront MIP' });
    rows.push({ key: 'fhaMip', label: 'FHA Monthly MIP' });
  }
  if (anyVa) rows.push({ key: 'vaFundingFee', label: 'VA Funding Fee' });
  if (anyUsda) {
    rows.push({ key: 'usdaUpfront', label: 'USDA Upfront Fee' });
    rows.push({ key: 'usdaAnnual', label: 'USDA Monthly Fee' });
  }
  if (anyConvPmi) rows.push({ key: 'pmi', label: 'Mortgage Insurance (PMI)' });
  rows.push({ key: 'taxes', label: 'Property Taxes' });
  rows.push({ key: 'insurance', label: 'Homeowners Insurance' });
  if (anyHoa) rows.push({ key: 'hoa', label: 'HOA Dues' });
  rows.push({ key: 'totalMonthly', label: 'Estimated Monthly Payment' });
  rows.push({ key: 'cashToClose', label: 'Estimated Cash to Close' });

  const columns: ComparisonColumn[] = results.map(({ s, c }) => {
    const cells: Record<string, string> = {};
    for (const row of rows) cells[row.key] = cellValue(row.key, s, c);
    const downPct = Math.round(s.homePrice > 0 ? ((s.downPayment || 0) / s.homePrice) * 100 : s.downPct || 0);
    return { name: s.name, loanType: s.loanType, typeLabel: c.typeLabel, credit: String(s.credit || ''), downPct, cells };
  });

  // Program notes — only for the programs actually present.
  const notes: string[] = [];
  if (anyFha) notes.push(...FHA.programNotes);
  if (anyVa) notes.push(...VA.programNotes);
  if (anyUsda) notes.push(...USDA.programNotes);
  if (anyConvPmi) {
    notes.push('Conventional PMI applies when the down payment is under 20%; it can be cancelled at 80% LTV (auto at 78%) of the original value.');
  }

  return {
    programs,
    programLabels: programs.map((t) => results.find(({ s }) => s.loanType === t)!.c.typeLabel),
    mixed: programs.length > 1,
    rows,
    columns,
    notes,
  };
}
