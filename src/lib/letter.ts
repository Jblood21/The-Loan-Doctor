// Builds the pre-approval letter content. Supports selectable templates (per loan
// program) and editable intro/highlights, while keeping the structured parts (terms,
// validity, signature, dual branding) auto-generated from the scenario + settings.
// Kept pure (pass `now`) so it is easy to test.

import type { LoanType, Scenario, Settings } from '@/types';
import { computeScenario, loanTypeLabel } from './finance';
import { fmt, longDate } from './format';

const TYPE_ADJECTIVE: Record<string, string> = {
  conventional: 'conventional',
  fha: 'FHA-insured',
  va: 'VA-guaranteed',
  usda: 'USDA-guaranteed',
  arm: 'adjustable-rate (ARM)',
};

const TYPE_HIGHLIGHTS: Record<string, string[]> = {
  conventional: ['Competitive conventional financing', 'Flexible 10–30 year terms', 'PMI automatically cancels at 78% LTV'],
  fha: ['Down payment as low as 3.5%', 'Flexible credit guidelines', 'Gift funds allowed toward the down payment'],
  va: ['$0 down payment for eligible borrowers', 'No monthly mortgage insurance', 'Competitive VA interest rates'],
  usda: ['Up to 100% financing — no down payment', 'For eligible rural & suburban areas', 'Reduced mortgage-insurance costs'],
  arm: ['Lower introductory fixed rate', 'Well suited to shorter-term ownership', 'Rate caps limit future adjustments'],
};

const PROGRAM_PHRASE: Record<string, string> = {
  standard: '',
  homeready: ' under the Fannie Mae HomeReady® program',
  homepossible: ' under the Freddie Mac Home Possible® program',
  firsttime: ' with first-time homebuyer benefits',
};

export interface LetterTemplateMeta {
  id: string;
  label: string;
}

/** Templates offered in the picker. */
export const LETTER_TEMPLATES: LetterTemplateMeta[] = [
  { id: 'auto', label: 'Auto — match loan type' },
  { id: 'conventional', label: 'Conventional' },
  { id: 'fha', label: 'FHA — Low Down Payment' },
  { id: 'va', label: 'VA — No Down Payment' },
  { id: 'usda', label: 'USDA — Rural 100%' },
  { id: 'jumbo', label: 'Jumbo' },
  { id: 'firsttime', label: 'First-Time Buyer' },
];

interface Phrases {
  isRefi: boolean;
  two: boolean;
  purpose: string;
  coBorrowers: string;
  youHave: string;
  assets: string;
  where: string;
  amount: string;
  program: string;
}

function phrasesFor(scenario: Scenario, propertyAddress?: string): Phrases {
  const calc = computeScenario(scenario);
  const isRefi = scenario.transaction === 'refinance';
  const two = scenario.borrowers === '2';
  return {
    isRefi,
    two,
    purpose: isRefi ? 'to refinance your existing mortgage' : 'for the purchase of a home',
    coBorrowers: two ? ' as co-borrowers' : '',
    youHave: two ? 'you have both been' : 'you have been',
    assets: two ? 'your combined credit, income, and assets' : 'your credit, income, and assets',
    where: propertyAddress ? ` located at ${propertyAddress}` : '',
    amount: fmt(calc.baseLoan),
    program: PROGRAM_PHRASE[scenario.program] || '',
  };
}

export interface ResolvedTemplate {
  intro: string;
  highlights: string[];
}

/** Resolve a template's default intro + highlights for the given scenario. */
export function resolveTemplate(id: string, scenario: Scenario, propertyAddress?: string): ResolvedTemplate {
  const p = phrasesFor(scenario, propertyAddress);
  switch (id) {
    case 'conventional':
      return {
        intro: `Congratulations! Based on a review of ${p.assets}, ${p.youHave} pre-approved${p.coBorrowers} for a conventional mortgage loan ${p.purpose}${p.where} under the following terms:`,
        highlights: TYPE_HIGHLIGHTS.conventional,
      };
    case 'fha':
      return {
        intro: `Congratulations! Based on a review of ${p.assets}, ${p.youHave} pre-approved${p.coBorrowers} for an FHA-insured mortgage loan ${p.purpose}${p.where}, designed for a low down payment and flexible credit. Your pre-approval is under the following terms:`,
        highlights: TYPE_HIGHLIGHTS.fha,
      };
    case 'va':
      return {
        intro: `Congratulations! As an eligible Veteran or service member, ${p.youHave} pre-approved${p.coBorrowers} for a VA-guaranteed mortgage loan ${p.purpose}${p.where} — typically with no down payment and no monthly mortgage insurance. Your pre-approval is under the following terms:`,
        highlights: TYPE_HIGHLIGHTS.va,
      };
    case 'usda':
      return {
        intro: `Congratulations! Based on a review of ${p.assets}, ${p.youHave} pre-approved${p.coBorrowers} for a USDA-guaranteed mortgage loan ${p.purpose}${p.where}, offering up to 100% financing for eligible rural and suburban homes. Your pre-approval is under the following terms:`,
        highlights: TYPE_HIGHLIGHTS.usda,
      };
    case 'jumbo':
      return {
        intro: `Congratulations! Based on a thorough review of ${p.assets}, ${p.youHave} pre-approved${p.coBorrowers} for a jumbo mortgage loan ${p.purpose}${p.where}, financing above standard conforming limits. Your pre-approval is under the following terms:`,
        highlights: ['Financing above conforming loan limits', 'Competitive jumbo pricing', 'Underwriting tailored to higher loan amounts'],
      };
    case 'firsttime':
      return {
        intro: `Congratulations! ${capitalize(p.youHave)} pre-approved${p.coBorrowers} for a mortgage loan ${p.purpose}${p.where} under our first-time homebuyer program. We are excited to help you purchase your first home. Your pre-approval is under the following terms:`,
        highlights: ['Low down payment options', 'Down payment assistance may be available', 'Homebuyer education and support'],
      };
    case 'auto':
    default: {
      const adjective = TYPE_ADJECTIVE[scenario.loanType] || 'conventional';
      return {
        intro: `Congratulations! Based on a review of ${p.assets}, ${p.youHave} pre-approved${p.coBorrowers} for a ${adjective} mortgage loan ${p.purpose}${p.program}${p.where} under the following terms:`,
        highlights: TYPE_HIGHLIGHTS[scenario.loanType] || TYPE_HIGHLIGHTS.conventional,
      };
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface LetterAgent {
  name: string;
  brokerage: string;
  phone: string;
}

export interface PreApprovalLetter {
  heading: string;
  salutation: string;
  intro: string;
  highlights: string[];
  terms: { label: string; value: string }[];
  validity: string;
  expDate: string;
  signatureName: string;
  signatureLine: string;
  partnerLine: string;
  agent: LetterAgent | null;
}

export interface LetterOptions {
  borrowerName: string;
  propertyAddress?: string;
  expDays: number;
  includeAgent: boolean;
  now?: Date;
  /** Template id used for the default intro/highlights (defaults to 'auto'). */
  templateId?: string;
  /** Edited intro override; falls back to the resolved template. */
  intro?: string;
  /** Edited highlights override; falls back to the resolved template. */
  highlights?: string[];
}

export function buildPreApprovalLetter(scenario: Scenario, settings: Settings, opts: LetterOptions): PreApprovalLetter {
  const def = resolveTemplate(opts.templateId || 'auto', scenario, opts.propertyAddress);
  const intro = opts.intro ?? def.intro;
  const highlights = opts.highlights ?? def.highlights;

  const isRefi = scenario.transaction === 'refinance';
  const twoBorrowers = scenario.borrowers === '2';

  const now = opts.now || new Date();
  const exp = new Date(now.getTime() + (opts.expDays || 90) * 86_400_000);
  const expDate = longDate(exp);
  const validity = `This pre-approval is valid through ${expDate} and is subject to property appraisal, title review, and final underwriting verification.`;

  const priceLabel = isRefi ? 'Estimated Home Value' : 'Purchase Price';
  const equityLabel = isRefi ? 'Estimated Equity' : 'Down Payment';
  const termLabel = `${scenario.term}-year ${scenario.loanType === 'arm' ? 'ARM' : 'fixed'}`;
  const calc = computeScenario(scenario);

  const terms = [
    { label: 'Loan Type', value: loanTypeLabel(scenario.loanType) },
    { label: 'Borrowers', value: twoBorrowers ? 'Two (co-borrowers)' : 'One' },
    { label: priceLabel, value: fmt(scenario.homePrice || 0) },
    { label: 'Loan Amount', value: fmt(calc.baseLoan) },
    { label: equityLabel, value: fmt(scenario.downPayment || 0) },
    { label: 'Interest Rate', value: `${scenario.rate || 0}%` },
    { label: 'Loan Term', value: termLabel },
  ];

  const hasAgent = !!(settings.agentName && settings.agentName.trim());
  const includeAgent = opts.includeAgent && hasAgent;
  const agent: LetterAgent | null = includeAgent
    ? { name: settings.agentName, brokerage: settings.brokerage, phone: settings.agentPhone }
    : null;
  const partnerLine = includeAgent
    ? `Prepared in partnership with ${settings.agentName}${settings.brokerage ? `, ${settings.brokerage}` : ''}.`
    : '';

  return {
    heading: 'Pre-Approval Letter',
    salutation: `Dear ${opts.borrowerName || '—'},`,
    intro,
    highlights,
    terms,
    validity,
    expDate,
    signatureName: settings.name || 'John Smith',
    signatureLine: `Loan Officer · NMLS #${settings.nmls || '123456'} · ${settings.company || 'ABC Mortgage'}`,
    partnerLine,
    agent,
  };
}

export type { LoanType };
