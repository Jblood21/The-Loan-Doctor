// Builds the pre-approval letter content, adapting the wording to the loan scenario
// (loan type, purchase vs. refinance, number of borrowers, loan program) and folding in
// real-estate agent dual branding. Kept pure (pass `now`) so it is easy to test.

import type { Scenario, Settings } from '@/types';
import { computeScenario, loanTypeLabel } from './finance';
import { fmt, longDate } from './format';

const TYPE_ADJECTIVE: Record<string, string> = {
  conventional: 'conventional',
  fha: 'FHA-insured',
  va: 'VA-guaranteed',
  usda: 'USDA-guaranteed',
  arm: 'adjustable-rate (ARM)',
};

const TYPE_BLURB: Record<string, string> = {
  conventional: '',
  fha: 'This FHA-insured financing allows a lower down payment and more flexible credit guidelines.',
  va: 'This VA-guaranteed loan is available to eligible Veterans and service members, often with no down payment required.',
  usda: 'This USDA Rural Development loan offers up to 100% financing for eligible rural and suburban properties.',
  arm: 'This adjustable-rate mortgage carries a fixed introductory period before the rate may adjust.',
};

const PROGRAM_PHRASE: Record<string, string> = {
  standard: '',
  homeready: ' under the Fannie Mae HomeReady® program',
  homepossible: ' under the Freddie Mac Home Possible® program',
  firsttime: ' with first-time homebuyer benefits',
};

export interface LetterAgent {
  name: string;
  brokerage: string;
  phone: string;
}

export interface PreApprovalLetter {
  heading: string;
  salutation: string;
  intro: string;
  blurb: string;
  terms: { label: string; value: string }[];
  validity: string;
  expDate: string;
  signatureName: string;
  signatureLine: string;
  partnerLine: string;
  /** Dual-branding block, present when an agent is included. */
  agent: LetterAgent | null;
}

export interface LetterOptions {
  borrowerName: string;
  propertyAddress?: string;
  expDays: number;
  includeAgent: boolean;
  now?: Date;
}

export function buildPreApprovalLetter(scenario: Scenario, settings: Settings, opts: LetterOptions): PreApprovalLetter {
  const calc = computeScenario(scenario);
  const isRefi = scenario.transaction === 'refinance';
  const twoBorrowers = scenario.borrowers === '2';

  const adjective = TYPE_ADJECTIVE[scenario.loanType] || 'conventional';
  const blurb = TYPE_BLURB[scenario.loanType] || '';
  const program = PROGRAM_PHRASE[scenario.program] || '';
  const purpose = isRefi ? 'to refinance your existing mortgage' : 'for the purchase of a home';
  const coBorrowers = twoBorrowers ? ' as co-borrowers' : '';
  const youHave = twoBorrowers ? 'you have both been' : 'you have been';
  const assets = twoBorrowers ? 'your combined credit, income, and assets' : 'your credit, income, and assets';
  const where = opts.propertyAddress ? ` located at ${opts.propertyAddress}` : '';

  const intro = `Congratulations! Based on a review of ${assets}, ${youHave} pre-approved${coBorrowers} for a ${adjective} mortgage loan ${purpose}${program}${where} under the following terms:`;

  const now = opts.now || new Date();
  const exp = new Date(now.getTime() + (opts.expDays || 90) * 86_400_000);
  const expDate = longDate(exp);
  const validity = `This pre-approval is valid through ${expDate} and is subject to property appraisal, title review, and final underwriting verification.`;

  const priceLabel = isRefi ? 'Estimated Home Value' : 'Purchase Price';
  const equityLabel = isRefi ? 'Estimated Equity' : 'Down Payment';
  const termLabel = `${scenario.term}-year ${scenario.loanType === 'arm' ? 'ARM' : 'fixed'}`;

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
    blurb,
    terms,
    validity,
    expDate,
    signatureName: settings.name || 'John Smith',
    signatureLine: `Loan Officer · NMLS #${settings.nmls || '123456'} · ${settings.company || 'ABC Mortgage'}`,
    partnerLine,
    agent,
  };
}
