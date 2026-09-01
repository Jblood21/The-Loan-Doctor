import { describe, it, expect } from 'vitest';
import { groupByBorrower, diffRecords } from './preApprovalHistory';
import type { PreApprovalRecord } from '@/types';

const base: Omit<PreApprovalRecord, 'id' | 'issuedAt'> = {
  borrowerName: 'John Smith',
  propertyAddress: '123 Main St',
  loanType: 'FHA',
  transaction: 'purchase',
  price: 450000,
  loanAmount: 400000,
  downPayment: 50000,
  rate: 6.5,
  term: '30',
  monthlyPayment: 3200,
  apr: 7.44,
  reLine: 'Pre-Approval',
  validityDays: 90,
};
const rec = (id: string, issuedAt: string, over: Partial<PreApprovalRecord> = {}): PreApprovalRecord => ({
  ...base,
  id,
  issuedAt,
  ...over,
});

describe('groupByBorrower', () => {
  it('groups case/space-insensitively and sorts newest first', () => {
    const records = [
      rec('a', '2026-01-01T00:00:00Z'),
      rec('b', '2026-03-01T00:00:00Z', { borrowerName: '  john   smith ' }), // same borrower, different spacing
      rec('c', '2026-02-01T00:00:00Z', { borrowerName: 'Jane Doe' }),
    ];
    const groups = groupByBorrower(records);
    expect(groups).toHaveLength(2);
    const smith = groups.find((g) => g.key === 'john smith')!;
    expect(smith.count).toBe(2);
    expect(smith.records[0].id).toBe('b'); // newest first
    expect(smith.latest.id).toBe('b');
  });

  it('orders groups by most-recent activity', () => {
    const groups = groupByBorrower([
      rec('a', '2026-01-01T00:00:00Z', { borrowerName: 'Old Borrower' }),
      rec('b', '2026-05-01T00:00:00Z', { borrowerName: 'Recent Borrower' }),
    ]);
    expect(groups[0].borrowerName).toBe('Recent Borrower');
  });
});

describe('diffRecords', () => {
  it('returns [] for the first issuance (no prior)', () => {
    expect(diffRecords(rec('a', '2026-01-01T00:00:00Z'), undefined)).toEqual([]);
  });

  it('reports the fields that changed between two issuances', () => {
    const older = rec('a', '2026-01-01T00:00:00Z', { rate: 6.5, loanAmount: 400000 });
    const newer = rec('b', '2026-02-01T00:00:00Z', { rate: 6.25, loanAmount: 410000 });
    const changes = diffRecords(newer, older);
    const byLabel = Object.fromEntries(changes.map((c) => [c.label, `${c.from} → ${c.to}`]));
    expect(byLabel['Rate']).toBe('6.5% → 6.25%');
    expect(byLabel['Loan amount']).toBe('$400,000 → $410,000');
    expect(changes).toHaveLength(2);
  });

  it('ignores negligible floating-point differences', () => {
    const older = rec('a', '2026-01-01T00:00:00Z', { monthlyPayment: 3200 });
    const newer = rec('b', '2026-02-01T00:00:00Z', { monthlyPayment: 3200.0001 });
    expect(diffRecords(newer, older)).toEqual([]);
  });

  it('detects a purchase → refinance change', () => {
    const older = rec('a', '2026-01-01T00:00:00Z', { transaction: 'purchase' });
    const newer = rec('b', '2026-02-01T00:00:00Z', { transaction: 'refinance' });
    const changes = diffRecords(newer, older);
    expect(changes.some((c) => c.label === 'Purpose' && c.to === 'refinance')).toBe(true);
  });
});
