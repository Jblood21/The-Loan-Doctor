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

/** Approval level — sets the core verbiage throughout the letter. */
export type LetterKind = 'preapproval' | 'preunderwritten' | 'prequalified';

export const LETTER_KINDS: { value: LetterKind; label: string }[] = [
  { value: 'preapproval', label: 'Pre-Approval' },
  { value: 'preunderwritten', label: 'Pre-Underwritten' },
  { value: 'prequalified', label: 'Pre-Qualified' },
];

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

/** Per-kind wording. Drives the opening verb, the two supporting paragraphs, and the
 *  nouns used in the RE line, closing paragraph, and validity sentence. */
interface KindWording {
  /** Noun for the RE line, e.g. "Pre-Approval". */
  noun: string;
  /** Lowercased noun for mid-sentence use, e.g. "pre-approval". */
  nounLower: string;
  /** Opening verb phrase: "${name} is ${verb} for the purchase of…". */
  verb: string;
  /** Second paragraph — what the decision rests on. */
  basis: (pr: PronounSet, scores: string) => string;
  /** Third paragraph — readiness / remaining steps. */
  readiness: (name: string) => string;
}

const KIND_WORDING: Record<LetterKind, KindWording> = {
  preapproval: {
    noun: 'Pre-Approval',
    nounLower: 'pre-approval',
    verb: 'pre-approved',
    basis: (pr, scores) =>
      `This pre-approval is supported by ${pr.poss} strong credit history and ${scores}. ${pr.subjCap} ${pr.have} provided income and asset documentation verifying sufficient income and assets needed for this transaction.`,
    readiness: (name) =>
      `Based on this, ${name} can close in a timely manner pending underwriter review of the file, including a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
  },
  preunderwritten: {
    noun: 'Underwritten Pre-Approval',
    nounLower: 'underwritten pre-approval',
    verb: 'fully underwritten and conditionally approved',
    basis: (pr, scores) =>
      `This approval reflects a full underwriting review of ${pr.poss} credit, income, and asset documentation by a mortgage underwriter, including ${pr.poss} ${scores}. ${pr.subjCap} ${pr.have} met the requirements for this financing, subject only to the conditions noted below.`,
    readiness: (name) =>
      `Because the file has already been underwritten, ${name} is positioned to close quickly — the remaining items are a satisfactory appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
  },
  prequalified: {
    noun: 'Pre-Qualification',
    nounLower: 'pre-qualification',
    verb: 'pre-qualified',
    basis: (pr, scores) =>
      `This pre-qualification is based on ${pr.poss} stated income, assets, and ${scores}, which have not yet been verified with documentation.`,
    readiness: (name) =>
      `Based on the information provided, ${name} appears well-qualified for this financing. Final approval is subject to verification of income and assets, a satisfactory appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
  },
};

/** The RE-line / heading noun for a kind (e.g. "Pre-Approval"). */
export function letterKindNoun(kind: LetterKind): string {
  return (KIND_WORDING[kind] || KIND_WORDING.preapproval).noun;
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
  /** Approval level — defaults to a standard pre-approval. */
  kind?: LetterKind;
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
  const w = KIND_WORDING[opts.kind || 'preapproval'] || KIND_WORDING.preapproval;

  const p1 = isRefi
    ? `${name} ${isAre} ${w.verb} to refinance the property located at ${property} with a loan amount of ${loan} using ${financingLabel} financing${tail}.`
    : `${name} ${isAre} ${w.verb} for the purchase of the home located at ${property} at a purchase price of ${price} using ${financingLabel} financing${tail}.`;
  const p2 = w.basis(pr, scores);
  const p3 = w.readiness(name);
  const p4 = `Please contact me with any questions regarding this ${w.nounLower}.`;
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
  /** Approval level (Pre-Approval / Pre-Underwritten / Pre-Qualified). */
  kind?: LetterKind;
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
  /** Selected real-estate agent to co-brand with (from the saved contacts). Falls back
   *  to the legacy single settings.agent fields when not provided. */
  agent?: LetterAgent | null;
}

export function buildPreApprovalLetter(scenario: Scenario, settings: Settings, opts: LetterOptions): PreApprovalLetter {
  const def = resolveTemplate(opts.templateId || 'auto', scenario, {
    borrowerName: opts.borrowerName,
    propertyAddress: opts.propertyAddress,
    pronoun: opts.pronoun,
    kind: opts.kind,
  });
  const paragraphs = opts.paragraphs && opts.paragraphs.length ? opts.paragraphs : def.paragraphs;

  const w = KIND_WORDING[opts.kind || 'preapproval'] || KIND_WORDING.preapproval;
  const now = opts.now || new Date();
  const name = (opts.borrowerName || '').trim() || '—';
  const showSubjectAddress = opts.showSubjectAddress !== false;

  const expDays = opts.expDays || 90;
  const exp = new Date(now.getTime() + expDays * 86_400_000);
  const validity = `This ${w.nounLower} is valid through ${longDate(exp)} and is subject to property appraisal, title review, and final underwriting verification.`;

  // The selected agent (from the saved contacts) wins; otherwise fall back to the legacy
  // single agent fields on settings.
  const chosenAgent: LetterAgent | null =
    opts.agent && opts.agent.name && opts.agent.name.trim()
      ? opts.agent
      : settings.agentName && settings.agentName.trim()
        ? { name: settings.agentName, brokerage: settings.brokerage, phone: settings.agentPhone }
        : null;
  const includeAgent = opts.includeAgent && !!chosenAgent;
  const agent: LetterAgent | null = includeAgent ? chosenAgent : null;
  const partnerLine =
    includeAgent && agent ? `Prepared in partnership with ${agent.name}${agent.brokerage ? `, ${agent.brokerage}` : ''}.` : '';

  return {
    date: (opts.dateText || '').trim() || longDateWeekday(now),
    title: (opts.title || '').trim(),
    reLine: (opts.reLine || '').trim() || `${w.noun} for ${name}`,
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
