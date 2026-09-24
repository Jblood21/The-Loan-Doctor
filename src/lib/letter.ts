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
  /** Lowercase subject pronoun for mid-sentence use ("they/he/she"). */
  subj: string;
  subjCap: string;
  poss: string;
  have: string;
}

/** Two borrowers always read as plural "they". */
function pronounSet(choice: PronounChoice, twoBorrowers: boolean): PronounSet {
  if (twoBorrowers) return { subj: 'they', subjCap: 'They', poss: 'their', have: 'have' };
  if (choice === 'he') return { subj: 'he', subjCap: 'He', poss: 'his', have: 'has' };
  if (choice === 'she') return { subj: 'she', subjCap: 'She', poss: 'her', have: 'has' };
  return { subj: 'they', subjCap: 'They', poss: 'their', have: 'have' };
}

/** Credit descriptor woven into the letter, plus an optional inline score clause. */
interface CreditClause {
  /** Adjective TOKEN placed immediately before "credit history" — already includes its
   *  trailing space when present (e.g. "excellent "), or "" for no adjective. */
  adjective: string;
  /** Inline " and credit score(s) of NNN" appended after the credit-history phrase when
   *  the number is shown, else "". */
  scoreClause: string;
}

/** Replace ampersands with the word "and" — spelled out reads cleaner in a formal
 *  letter. Collapses the surrounding spaces so "Ferris & Co" and "A&B" both normalize. */
export function andify(s: string): string {
  return (s || '').replace(/\s*&\s*/g, ' and ').replace(/\s{2,}/g, ' ').trim();
}

/** Map a FICO score to the letter adjective. Bands: ≤680 acceptable, 681–700 good,
 *  701–740 excellent, 741+ exceptional. Falls back to "strong" (the prior wording) when
 *  no score is provided. Scores in the "acceptable" band are described but never printed
 *  (see creditClauseFrom). */
export function creditAdjective(score: number | string | undefined | null): string {
  const n = typeof score === 'number' ? score : parseInt(String(score ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 'strong';
  if (n >= 741) return 'exceptional';
  if (n >= 701) return 'excellent';
  if (n >= 681) return 'good';
  return 'acceptable';
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
  /** Second paragraph — what the decision rests on. `credit` supplies the adjective and
   *  the optional inline score clause; `two` selects singular/plural agreement. */
  basis: (name: string, pr: PronounSet, credit: CreditClause, two: boolean) => string;
  /** Third paragraph — readiness / remaining steps. Drops the appraisal from the
   *  remaining items when the borrower has an appraisal waiver. */
  readiness: (name: string, pr: PronounSet, appraisalWaiver: boolean) => string;
  /** Tail of the validity sentence ("… and is <validityTail>"), so each level's
   *  remaining conditions match what has actually been done. Omits the appraisal
   *  condition when an appraisal waiver applies. */
  validityTail: (appraisalWaiver: boolean) => string;
}

const KIND_WORDING: Record<LetterKind, KindWording> = {
  // Standard pre-approval: credit reviewed and income/assets documented; the file still
  // goes to a final underwriter review before closing.
  preapproval: {
    noun: 'Pre-Approval',
    nounLower: 'pre-approval',
    verb: 'income and credit pre-approved',
    basis: (name, pr, credit, two) =>
      `${name}'s pre-approval is supported by ${pr.poss} ${credit.adjective}credit history${credit.scoreClause}. In addition, ${name} ${two ? 'have' : 'has'} provided all necessary documents to verify ${pr.poss} income and assets needed for this transaction.`,
    readiness: (name, _pr, waived) =>
      waived
        ? `Based on this, ${name} can close in a timely manner pending final underwriter review, including a fully executed sales contract and an acceptable title insurance commitment.`
        : `Based on this, ${name} can close in a timely manner pending final underwriter review including a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
    validityTail: (waived) =>
      waived
        ? 'subject to clear title and final underwriting approval.'
        : 'subject to a satisfactory appraisal, clear title, and final underwriting approval.',
  },
  // Pre-underwritten: the file HAS been reviewed and verified by a mortgage underwriter;
  // what remains is a final underwriter review plus the property-side items.
  preunderwritten: {
    noun: 'Pre-Underwritten Approval',
    nounLower: 'pre-underwritten pre-approval',
    verb: 'fully pre-underwritten and pre-approved',
    basis: (name, pr, credit, two) =>
      `${name}'s pre-underwritten pre-approval is supported by ${pr.poss} ${credit.adjective}credit history${credit.scoreClause}. In addition, ${name} ${two ? 'have' : 'has'} provided all necessary documents to verify ${pr.poss} income and assets needed for this transaction, which have been reviewed and verified by a mortgage underwriter.`,
    readiness: (name, pr, waived) =>
      waived
        ? `Because ${name}'s file has been pre-underwritten, ${pr.subj} can close in a very timely manner pending a final underwriter review of ${pr.poss} file, including a fully executed sales contract and an acceptable title insurance commitment.`
        : `Because ${name}'s file has been pre-underwritten, ${pr.subj} can close in a very timely manner pending a final underwriter review of ${pr.poss} file including a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
    validityTail: (waived) =>
      waived
        ? 'subject to clear title and satisfaction of the remaining underwriting conditions.'
        : 'subject to a satisfactory appraisal, clear title, and satisfaction of the remaining underwriting conditions.',
  },
  // Pre-qualified: based on a credit review plus income/asset figures the borrower stated
  // but that have NOT been verified with documentation.
  prequalified: {
    noun: 'Pre-Qualification',
    nounLower: 'credit pre-qualification',
    verb: 'credit pre-qualified',
    basis: (name, pr, credit, two) =>
      `${name}'s credit pre-qualification is based on a review of ${pr.poss} ${credit.adjective}credit history${credit.scoreClause} and income and asset figures provided by the ${two ? 'buyers' : 'buyer'}.`,
    readiness: (name, _pr, waived) =>
      waived
        ? `Based on the information provided, ${name} can close in a timely manner pending receipt and review of income and asset documentation to verify all income and assets needed for the purchase, as well as a fully executed sales contract and an acceptable title insurance commitment.`
        : `Based on the information provided, ${name} can close in a timely manner pending receipt and review of income and asset documentation to verify all income and assets needed for the purchase, as well as a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`,
    validityTail: (waived) =>
      waived
        ? "subject to verification of the borrower's income, assets, and credit, clear title, and full underwriting approval."
        : "subject to verification of the borrower's income, assets, and credit, a satisfactory appraisal, clear title, and full underwriting approval.",
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
  /** Borrower credit score — drives the descriptor woven into the credit sentence. */
  creditScore?: string | number;
  /** When true (and a score is present), the FICO number is printed in the letter too. */
  showCreditScore?: boolean;
  /** The transaction has an appraisal waiver — the letter notes it up front and drops
   *  the appraisal from the remaining conditions. */
  appraisalWaiver?: boolean;
}

/** Build the credit adjective + optional inline score clause from the body options. The
 *  adjective token carries its own trailing space so it can be dropped in front of
 *  "credit history". With a score it's the band word (acceptable/good/excellent/
 *  exceptional); without one it falls back to "strong" for a pre-approval, none for the
 *  underwritten and pre-qualified letters. The score number is woven in only when the
 *  "show score" toggle is on AND the score is above the "acceptable" band (≤680 scores
 *  are described but never printed). */
function creditClauseFrom(opts: BodyOpts, two: boolean): CreditClause {
  const raw = opts.creditScore == null ? '' : String(opts.creditScore).trim();
  const kind = opts.kind || 'preapproval';
  const n = parseInt(raw, 10);
  const hasScore = raw !== '' && Number.isFinite(n) && n > 0;
  const word = hasScore ? creditAdjective(n) : kind === 'preapproval' ? 'strong' : '';
  const adjective = word ? `${word} ` : '';
  // Scores of 680 or below (the "acceptable" band) are described but never printed.
  const acceptable = hasScore && n <= 680;
  const showNumber = hasScore && !!opts.showCreditScore && !acceptable;
  const noun = two ? 'credit scores' : 'credit score';
  const scoreClause = showNumber ? ` and ${noun} of ${n}` : '';
  return { adjective, scoreClause };
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
  const w = KIND_WORDING[opts.kind || 'preapproval'] || KIND_WORDING.preapproval;
  const credit = creditClauseFrom(opts, two);

  // Mid-sentence the financing type reads as a common noun ("conventional financing"),
  // so lowercase the first letter — but leave acronyms (FHA, VA, USDA) fully uppercase.
  const fin = financingLabel === financingLabel.toUpperCase() ? financingLabel : financingLabel.charAt(0).toLowerCase() + financingLabel.slice(1);

  const waived = !!opts.appraisalWaiver;
  // When an appraisal waiver applies, note it in the opening paragraph.
  const waiverSentence = waived ? ` This loan has an appraisal waiver, so no appraisal is required.` : '';
  const p1 = isRefi
    ? `${name} ${isAre} ${w.verb} to refinance the property located at ${property} with a loan amount of ${loan} using ${fin} financing${tail}.${waiverSentence}`
    : `${name} ${isAre} ${w.verb} for the purchase of the home located at ${property} at a purchase price of ${price} using ${fin} financing${tail}.${waiverSentence}`;
  const p2 = w.basis(name, pr, credit, two);
  const p3 = w.readiness(name, pr, waived);
  const p4 = `Please contact me with any questions regarding ${name}'s income and credit pre-approval.`;
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
  /** Professional acknowledgment of the real-estate agent, rendered near the top. */
  agentAck: string;
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
  /** Borrower credit score. Drives the credit descriptor (good/great/fantastic); the
   *  number itself is only printed when `showCreditScore` is true. */
  creditScore?: string | number;
  /** Print the FICO number in the letter body (default off — the adjective still adapts). */
  showCreditScore?: boolean;
  /** The transaction has an appraisal waiver. Notes it in the first paragraph and drops
   *  the appraisal from the remaining conditions / validity sentence. */
  appraisalWaiver?: boolean;
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
    creditScore: opts.creditScore,
    showCreditScore: opts.showCreditScore,
    appraisalWaiver: opts.appraisalWaiver,
  });
  const paragraphs = opts.paragraphs && opts.paragraphs.length ? opts.paragraphs : def.paragraphs;

  const w = KIND_WORDING[opts.kind || 'preapproval'] || KIND_WORDING.preapproval;
  const now = opts.now || new Date();
  const name = (opts.borrowerName || '').trim() || '—';
  const showSubjectAddress = opts.showSubjectAddress !== false;

  const expDays = opts.expDays || 90;
  const exp = new Date(now.getTime() + expDays * 86_400_000);
  const validity = `This ${w.nounLower} is valid through ${longDate(exp)} and is ${w.validityTail(!!opts.appraisalWaiver)}`;

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
  // A professional acknowledgment of the borrower's real-estate agent (shown near the
  // top of the letter), rather than a co-branded "partnership" line at the foot.
  const agentAck =
    includeAgent && agent && agent.name
      ? andify(
          [agent.name, agent.brokerage].filter((v) => v && v.trim()).join(', ') +
            (agent.phone && agent.phone.trim() ? ` · ${agent.phone.trim()}` : ''),
        )
      : '';

  return {
    date: (opts.dateText || '').trim() || longDateWeekday(now),
    title: andify((opts.title || '').trim()),
    reLine: andify((opts.reLine || '').trim() || `${w.noun} for ${name}`),
    subjectAddress: showSubjectAddress ? andify((opts.propertyAddress || '').trim()) : '',
    salutation: andify((opts.salutation || '').trim() || 'To Whom It May Concern:'),
    paragraphs: paragraphs.map(andify),
    terms: opts.showTerms ? buildTerms(scenario) : null,
    validity: andify(opts.showValidity ? validity : ''),
    closing: andify((opts.closing || '').trim() || 'Best regards,'),
    officerName: andify(settings.name || 'Your Loan Officer'),
    officerTitle: andify(settings.officerTitle || 'Mortgage Specialist'),
    agentAck,
    agent,
  };
}

export type { LoanType };
