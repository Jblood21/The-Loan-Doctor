// Builds the pre-approval letter content in a narrative letterhead format
// (optional title → RE line → salutation → body paragraphs → optional terms table →
// optional validity → closing → signature). Supports selectable program templates,
// an editable body, and several optional/editable parts. Pure (pass `now`).

import type { LoanType, Scenario, Settings } from '@/types';
import { computeScenario, loanTypeLabel } from './finance';
import { fmt, longDate, longDateWeekday } from './format';

export interface LetterTemplateMeta {
  id: string;
  label: string;
}

/** Program templates offered in the picker — each sets the financing wording. */
export const LETTER_TEMPLATES: LetterTemplateMeta[] = [
  { id: 'auto', label: 'Auto — match loan type' },
  { id: 'conventional', label: 'Conventional' },
  { id: 'fha', label: 'FHA' },
  { id: 'va', label: 'VA' },
  { id: 'usda', label: 'USDA' },
  { id: 'jumbo', label: 'Jumbo' },
  { id: 'nonqm', label: 'Non-QM' },
  { id: 'firsttime', label: 'First-Time Buyer' },
];

/** Visual letterhead styles offered in the picker. */
export const LETTERHEAD_STYLES: LetterTemplateMeta[] = [
  { id: 'mortgage-expert', label: 'Summit (navy band)' },
  { id: 'classic', label: 'Classic (centered)' },
];

/** Quick-pick presets for the salutation + closing fields. */
export const SALUTATION_PRESETS = ['To Whom It May Concern:', 'Dear Listing Agent:', 'Dear Seller:', 'Dear Buyer’s Agent:'];
export const CLOSING_PRESETS = ['Best regards,', 'Sincerely,', 'Warm regards,', 'Respectfully,'];

export type PronounChoice = 'he' | 'she' | 'they';

/** Borrower reference (pronoun) options for the picker. */
export const PRONOUN_OPTIONS: { value: PronounChoice; label: string }[] = [
  { value: 'he', label: 'He / Him' },
  { value: 'she', label: 'She / Her' },
  { value: 'they', label: 'They / Them' },
];

interface PronounSet {
  subjCap: string;
  poss: string;
  have: string;
}

/** Two borrowers always read as plural "they". */
function pronounSet(choice: PronounChoice, twoBorrowers: boolean): PronounSet {
  if (twoBorrowers) return { subjCap: 'They', poss: 'their', have: 'have' };
  if (choice === 'he') return { subjCap: 'He', poss: 'his', have: 'has' };
  if (choice === 'she') return { subjCap: 'She', poss: 'her', have: 'has' };
  return { subjCap: 'They', poss: 'their', have: 'have' };
}

interface TemplateSpec {
  label: string | null;
  tail: string;
}

const TEMPLATE_SPECS: Record<string, TemplateSpec> = {
  auto: { label: null, tail: '' },
  conventional: { label: 'Conventional', tail: '' },
  fha: { label: 'FHA', tail: '' },
  va: { label: 'VA', tail: ', available to eligible Veterans and service members' },
  usda: { label: 'USDA', tail: ', offering up to 100% financing for eligible rural and suburban properties' },
  jumbo: { label: 'jumbo', tail: ', financing above standard conforming limits' },
  nonqm: { label: 'non-QM', tail: '' },
  firsttime: { label: null, tail: ', under our first-time homebuyer program' },
};

export interface ResolvedTemplate {
  paragraphs: string[];
}

interface BodyOpts {
  borrowerName?: string;
  propertyAddress?: string;
  pronoun?: PronounChoice;
}

export function resolveTemplate(id: string, scenario: Scenario, opts: BodyOpts = {}): ResolvedTemplate {
  const spec = TEMPLATE_SPECS[id] || TEMPLATE_SPECS.auto;
  const label = spec.label ?? loanTypeLabel(scenario.loanType);
  return { paragraphs: bodyParagraphs(scenario, opts, label, spec.tail) };
}

function bodyParagraphs(scenario: Scenario, opts: BodyOpts, financingLabel: string, tail: string): string[] {
  const calc = computeScenario(scenario);
  const isRefi = scenario.transaction === 'refinance';
  const two = scenario.borrowers === '2';
  const name = (opts.borrowerName || '').trim() || 'The borrower';
  const isAre = two ? 'are' : 'is';
  const property = (opts.propertyAddress || '').trim() || 'the subject property';
  const price = fmt(scenario.homePrice || 0);
  const loan = fmt(calc.baseLoan);
  const pr = pronounSet(opts.pronoun || 'they', two);
  const scores = two ? 'credit scores' : 'credit score';

  const p1 = isRefi
    ? `${name} ${isAre} pre-approved to refinance the property located at ${property} with a loan amount of ${loan} using ${financingLabel} financing${tail}.`
    : `${name} ${isAre} pre-approved for the purchase of the home located at ${property} at a purchase price of ${price} using ${financingLabel} financing${tail}.`;
  const p2 = `This pre-approval is supported by ${pr.poss} strong credit history and ${scores}. ${pr.subjCap} ${pr.have} provided income and asset documentation verifying sufficient income and assets needed for this transaction.`;
  const p3 = `Based on this, ${name} can close in a timely manner pending underwriter review of the file, including a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`;
  const p4 = `Please contact me with any questions regarding this financing and credit pre-approval.`;
  return [p1, p2, p3, p4];
}

function buildTerms(scenario: Scenario): { label: string; value: string }[] {
  const calc = computeScenario(scenario);
  const isRefi = scenario.transaction === 'refinance';
  const two = scenario.borrowers === '2';
  return [
    { label: 'Loan Type', value: loanTypeLabel(scenario.loanType) },
    { label: 'Borrowers', value: two ? 'Two (co-borrowers)' : 'One' },
    { label: isRefi ? 'Estimated Home Value' : 'Purchase Price', value: fmt(scenario.homePrice || 0) },
    { label: 'Loan Amount', value: fmt(calc.baseLoan) },
    { label: isRefi ? 'Estimated Equity' : 'Down Payment', value: fmt(scenario.downPayment || 0) },
    { label: 'Interest Rate', value: `${scenario.rate || 0}%` },
    { label: 'Loan Term', value: `${scenario.term}-year ${scenario.loanType === 'arm' ? 'ARM' : 'fixed'}` },
  ];
}

export interface LetterAgent {
  name: string;
  brokerage: string;
  phone: string;
}

export interface PreApprovalLetter {
  date: string;
  title: string;
  reLine: string;
  subjectAddress: string;
  salutation: string;
  paragraphs: string[];
  terms: { label: string; value: string }[] | null;
  validity: string;
  closing: string;
  officerName: string;
  officerTitle: string;
  partnerLine: string;
  agent: LetterAgent | null;
}

export interface LetterOptions {
  borrowerName: string;
  propertyAddress?: string;
  includeAgent: boolean;
  now?: Date;
  templateId?: string;
  /** How to reference the borrower (single-borrower pronoun). */
  pronoun?: PronounChoice;
  /** Edited body override (paragraphs). */
  paragraphs?: string[];
  // Editable parts (empty/undefined → sensible default).
  reLine?: string;
  salutation?: string;
  closing?: string;
  title?: string;
  /** Display date override; empty → today's weekday date. */
  dateText?: string;
  // Optional sections.
  showTerms?: boolean;
  showValidity?: boolean;
  expDays?: number;
  showSubjectAddress?: boolean;
}

export function buildPreApprovalLetter(scenario: Scenario, settings: Settings, opts: LetterOptions): PreApprovalLetter {
  const def = resolveTemplate(opts.templateId || 'auto', scenario, {
    borrowerName: opts.borrowerName,
    propertyAddress: opts.propertyAddress,
    pronoun: opts.pronoun,
  });
  const paragraphs = opts.paragraphs && opts.paragraphs.length ? opts.paragraphs : def.paragraphs;

  const now = opts.now || new Date();
  const name = (opts.borrowerName || '').trim() || '—';
  const showSubjectAddress = opts.showSubjectAddress !== false;

  const expDays = opts.expDays || 90;
  const exp = new Date(now.getTime() + expDays * 86_400_000);
  const validity = `This pre-approval is valid through ${longDate(exp)} and is subject to property appraisal, title review, and final underwriting verification.`;

  const hasAgent = !!(settings.agentName && settings.agentName.trim());
  const includeAgent = opts.includeAgent && hasAgent;
  const agent: LetterAgent | null = includeAgent
    ? { name: settings.agentName, brokerage: settings.brokerage, phone: settings.agentPhone }
    : null;
  const partnerLine = includeAgent
    ? `Prepared in partnership with ${settings.agentName}${settings.brokerage ? `, ${settings.brokerage}` : ''}.`
    : '';

  return {
    date: (opts.dateText || '').trim() || longDateWeekday(now),
    title: (opts.title || '').trim(),
    reLine: (opts.reLine || '').trim() || `Pre-Approval for ${name}`,
    subjectAddress: showSubjectAddress ? (opts.propertyAddress || '').trim() : '',
    salutation: (opts.salutation || '').trim() || 'To Whom It May Concern:',
    paragraphs,
    terms: opts.showTerms ? buildTerms(scenario) : null,
    validity: opts.showValidity ? validity : '',
    closing: (opts.closing || '').trim() || 'Best regards,',
    officerName: settings.name || 'Your Loan Officer',
    officerTitle: settings.officerTitle || 'Mortgage Specialist',
    partnerLine,
    agent,
  };
}

export type { LoanType };
