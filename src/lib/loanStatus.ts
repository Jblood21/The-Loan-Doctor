import type { LoanStatus } from '@/types';

export const LOAN_STATUSES: { value: LoanStatus; label: string }[] = [
  { value: 'preapproved', label: 'Pre-approved' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'clear_to_close', label: 'Clear to close' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const STATUS_LABEL: Record<LoanStatus, string> = Object.fromEntries(LOAN_STATUSES.map((s) => [s.value, s.label])) as Record<LoanStatus, string>;

/** The stages a loan moves through, in order (cancelled sits outside the line). */
export const PIPELINE: LoanStatus[] = ['preapproved', 'under_contract', 'appraisal', 'clear_to_close', 'closed'];

export type ExpiryState = { kind: 'none' | 'ok' | 'soon' | 'expired'; days: number; label: string };

const DAY = 86400000;

/** How close a letter is to lapsing: "Expires in 12 days", "Expires tomorrow", "Expired 3 days ago". */
export function expiryState(expiresAt: string | null | undefined, now: number = Date.now()): ExpiryState {
  if (!expiresAt) return { kind: 'none', days: 0, label: '' };
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return { kind: 'none', days: 0, label: '' };
  const days = Math.ceil((end - now) / DAY);
  if (end <= now) {
    const ago = Math.max(1, Math.floor((now - end) / DAY));
    return { kind: 'expired', days: -ago, label: ago === 1 ? 'Expired yesterday' : `Expired ${ago} days ago` };
  }
  if (days <= 1) return { kind: 'soon', days, label: 'Expires today or tomorrow' };
  if (days <= 7) return { kind: 'soon', days, label: `Expires in ${days} days` };
  return { kind: 'ok', days, label: `Expires in ${days} days` };
}
