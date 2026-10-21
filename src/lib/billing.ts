// Small pure helpers for showing plans and dates on the billing screens.

import type { BillingStatus } from '@/types';

/** 5900 -> "$59", 4950 -> "$49.50". */
export function dollars(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the yearly plan saves over paying monthly, as a whole percent. */
export function yearlySavingsPct(plans: BillingStatus['plans']): number {
  if (!plans.soloMonthlyCents) return 0;
  return Math.round((1 - plans.soloAnnualMonthlyCents / plans.soloMonthlyCents) * 100);
}

/** Does this person still need to pick a plan (or could they change one)? */
export function needsPlan(status: BillingStatus): boolean {
  const { state, forever } = status.access;
  if (!status.enabled) return false;
  if (state === 'subscribed' || state === 'team' || state === 'exempt') return false;
  if (state === 'comp' && forever) return false;
  return true;
}

export interface BannerMessage {
  tone: 'info' | 'warn' | 'danger';
  text: string;
  cta: string;
}

/** The slim notice shown above every page, or null when there's nothing to say. */
export function bannerFor(status: BillingStatus | null): BannerMessage | null {
  if (!status?.enabled) return null;
  const a = status.access;
  if (a.paymentIssue) {
    return { tone: 'danger', text: "We couldn't take your last payment. Update your card to keep your plan.", cta: 'Fix payment' };
  }
  if (a.state === 'trial') {
    return {
      tone: (a.daysLeft ?? 99) <= 3 ? 'warn' : 'info',
      text: `Free trial: ${plural(a.daysLeft ?? 0, 'day')} left.`,
      cta: 'Choose a plan',
    };
  }
  if ((a.state === 'subscribed' || a.state === 'team') && a.cancelAtPeriodEnd && a.endsAt) {
    return { tone: 'warn', text: `Your plan ends on ${longDate(a.endsAt)}.`, cta: 'Keep it' };
  }
  if (a.state === 'comp' && !a.forever && a.endsAt && (a.daysLeft ?? 99) <= 14) {
    return { tone: 'info', text: `Your free access ends on ${longDate(a.endsAt)}.`, cta: 'See plans' };
  }
  return null;
}
