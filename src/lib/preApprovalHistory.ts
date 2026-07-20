// Grouping + change-tracking for issued pre-approvals.
//
// The "Issued" tab groups every pre-approval by borrower and, within a borrower,
// shows what changed each time a new letter was issued (rate moved, loan amount
// changed, purchase → refi, etc.) so the loan officer can see the loan's history.

import type { PreApprovalRecord } from '@/types';

export interface BorrowerGroup {
  /** Normalized key used to group (case/space-insensitive borrower name). */
  key: string;
  borrowerName: string;
  /** Records newest-first. */
  records: PreApprovalRecord[];
  latest: PreApprovalRecord;
  count: number;
}

const normName = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Group records by borrower, each group's records sorted newest-first. */
export function groupByBorrower(records: PreApprovalRecord[]): BorrowerGroup[] {
  const map = new Map<string, PreApprovalRecord[]>();
  for (const r of records) {
    const key = normName(r.borrowerName) || '(no name)';
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  }
  const groups: BorrowerGroup[] = [];
  for (const [key, recs] of map) {
    recs.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)); // newest first
    groups.push({ key, borrowerName: recs[0].borrowerName || '(no name)', records: recs, latest: recs[0], count: recs.length });
  }
  // Most recently active borrower first.
  groups.sort((a, b) => (a.latest.issuedAt < b.latest.issuedAt ? 1 : -1));
  return groups;
}

export interface FieldChange {
  label: string;
  from: string;
  to: string;
}

type Fmt = (v: number | string) => string;
const money: Fmt = (v) => `$${Math.round(Number(v)).toLocaleString('en-US')}`;
const pctFmt: Fmt = (v) => `${Number(v).toFixed(3)}%`;
const rateFmt: Fmt = (v) => `${Number(v)}%`;
const plain: Fmt = (v) => String(v || '—');

// Fields compared between two consecutive issuances, in display order.
const FIELDS: { key: keyof PreApprovalRecord; label: string; fmt: Fmt }[] = [
  { key: 'loanType', label: 'Loan type', fmt: plain },
  { key: 'transaction', label: 'Purpose', fmt: plain },
  { key: 'price', label: 'Price / value', fmt: money },
  { key: 'loanAmount', label: 'Loan amount', fmt: money },
  { key: 'downPayment', label: 'Down payment', fmt: money },
  { key: 'rate', label: 'Rate', fmt: rateFmt },
  { key: 'term', label: 'Term', fmt: (v) => `${v} yr` },
  { key: 'monthlyPayment', label: 'Monthly payment', fmt: money },
  { key: 'apr', label: 'APR', fmt: pctFmt },
  { key: 'propertyAddress', label: 'Property', fmt: plain },
];

const sameNumber = (a: unknown, b: unknown) => Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * What changed going FROM the older record TO the newer one. Returns [] for the
 * first-ever issuance (no prior) or when nothing material changed.
 */
export function diffRecords(newer: PreApprovalRecord, older: PreApprovalRecord | undefined): FieldChange[] {
  if (!older) return [];
  const changes: FieldChange[] = [];
  for (const f of FIELDS) {
    const a = older[f.key];
    const b = newer[f.key];
    const numeric = typeof b === 'number' || f.fmt === money || f.fmt === pctFmt || f.fmt === rateFmt;
    const unchanged = numeric ? sameNumber(a, b) : String(a ?? '') === String(b ?? '');
    if (!unchanged) changes.push({ label: f.label, from: f.fmt(a as number | string), to: f.fmt(b as number | string) });
  }
  return changes;
}
