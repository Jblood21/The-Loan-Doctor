// Builds the pre-approval letter content in a narrative letterhead format
// (RE line → To Whom It May Concern → pre-approval paragraphs → Best regards).
// Supports selectable templates per loan program and an editable body, while the
// letterhead, signature, and contact footer come from settings. Pure (pass `now`).

import type { LoanType, Scenario, Settings } from '@/types';
import { computeScenario, loanTypeLabel } from './finance';
import { fmt, longDateWeekday } from './format';

export interface LetterTemplateMeta {
  id: string;
  label: string;
}

/** Templates offered in the picker — each sets the financing wording. */
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

interface TemplateSpec {
  /** Financing label, or null to use the scenario's loan type. */
  label: string | null;
  /** Tail clause appended to the first sentence. */
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

/** Resolve a template's default body paragraphs for the scenario. */
export function resolveTemplate(id: string, scenario: Scenario, opts: { borrowerName?: string; propertyAddress?: string } = {}): ResolvedTemplate {
  const spec = TEMPLATE_SPECS[id] || TEMPLATE_SPECS.auto;
  const label = spec.label ?? loanTypeLabel(scenario.loanType);
  return { paragraphs: bodyParagraphs(scenario, opts, label, spec.tail) };
}

function bodyParagraphs(
  scenario: Scenario,
  opts: { borrowerName?: string; propertyAddress?: string },
  financingLabel: string,
  tail: string,
): string[] {
  const calc = computeScenario(scenario);
  const isRefi = scenario.transaction === 'refinance';
  const two = scenario.borrowers === '2';
  const name = (opts.borrowerName || '').trim() || 'The borrower';
  const isAre = two ? 'are' : 'is';
  const property = (opts.propertyAddress || '').trim() || 'the subject property';
  const price = fmt(scenario.homePrice || 0);
  const loan = fmt(calc.baseLoan);

  const p1 = isRefi
    ? `${name} ${isAre} pre-approved to refinance the property located at ${property} with a loan amount of ${loan} using ${financingLabel} financing${tail}.`
    : `${name} ${isAre} pre-approved for the purchase of the home located at ${property} at a purchase price of ${price} using ${financingLabel} financing${tail}.`;

  const p2 = `This pre-approval is supported by ${two ? 'their' : 'a'} strong credit history and credit score${two ? 's' : ''}. The borrower${two ? 's have' : ' has'} provided income and asset documentation verifying sufficient income and assets needed for this transaction.`;

  const p3 = `Based on this, ${name} can close in a timely manner pending underwriter review of the file, including a compliant appraisal, a fully executed sales contract, and an acceptable title insurance commitment.`;

  const p4 = `Please contact me with any questions regarding this financing and credit pre-approval.`;

  return [p1, p2, p3, p4];
}

export interface LetterAgent {
  name: string;
  brokerage: string;
  phone: string;
}

export interface PreApprovalLetter {
  date: string;
  reLine: string;
  subjectAddress: string;
  salutation: string;
  paragraphs: string[];
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
  /** Template id used for the default body (defaults to 'auto'). */
  templateId?: string;
  /** Edited body override (paragraphs); falls back to the resolved template. */
  paragraphs?: string[];
}

export function buildPreApprovalLetter(scenario: Scenario, settings: Settings, opts: LetterOptions): PreApprovalLetter {
  const def = resolveTemplate(opts.templateId || 'auto', scenario, {
    borrowerName: opts.borrowerName,
    propertyAddress: opts.propertyAddress,
  });
  const paragraphs = opts.paragraphs && opts.paragraphs.length ? opts.paragraphs : def.paragraphs;

  const now = opts.now || new Date();
  const name = (opts.borrowerName || '').trim() || '—';

  const hasAgent = !!(settings.agentName && settings.agentName.trim());
  const includeAgent = opts.includeAgent && hasAgent;
  const agent: LetterAgent | null = includeAgent
    ? { name: settings.agentName, brokerage: settings.brokerage, phone: settings.agentPhone }
    : null;
  const partnerLine = includeAgent
    ? `Prepared in partnership with ${settings.agentName}${settings.brokerage ? `, ${settings.brokerage}` : ''}.`
    : '';

  return {
    date: longDateWeekday(now),
    reLine: `Pre-Approval for ${name}`,
    subjectAddress: (opts.propertyAddress || '').trim(),
    salutation: 'To Whom It May Concern:',
    paragraphs,
    closing: 'Best regards,',
    officerName: settings.name || 'Alan Blood',
    officerTitle: settings.officerTitle || 'Mortgage Specialist',
    partnerLine,
    agent,
  };
}

export type { LoanType };
