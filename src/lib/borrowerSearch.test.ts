import { describe, it, expect } from 'vitest';
import { rankBorrowers, isSubsequence } from './borrowerSearch';

const people = [
  { name: 'John Smith', meta: 'Loan #LN-20471 · $425,000', address: '48 Birchwood Ln, Madison, WI' },
  { name: 'Sarah Johnson', meta: 'Loan #LN-20493 · $310,000', address: '210 Cedar St, Austin, TX' },
  { name: 'Robert Alvarez', meta: 'Loan #LN-20510 · $560,000', address: '12 Lakeshore Dr, Tampa, FL' },
  { name: 'Michael Johnston', meta: 'Loan #LN-20544 · $290,000', address: '9 Oak Ave, Reno, NV' },
];

describe('rankBorrowers', () => {
  it('returns the whole list when the query is empty', () => {
    expect(rankBorrowers(people, '')).toHaveLength(4);
    expect(rankBorrowers(people, '   ')).toHaveLength(4);
  });

  it('shows every partial match as you type, not just one', () => {
    const r = rankBorrowers(people, 'john');
    // "John Smith", "Sarah Johnson", "Michael Johnston" all contain "john"
    expect(r.map((b) => b.name)).toEqual(
      expect.arrayContaining(['John Smith', 'Sarah Johnson', 'Michael Johnston']),
    );
    expect(r.length).toBe(3);
  });

  it('ranks the closest match first (name prefix beats mid-word)', () => {
    const r = rankBorrowers(people, 'john');
    expect(r[0].name).toBe('John Smith'); // name starts with "john"
  });

  it('is word-order independent (last name first still finds the person)', () => {
    const r = rankBorrowers(people, 'smith john');
    expect(r[0].name).toBe('John Smith');
  });

  it('finds by loan number ignoring dashes/spaces', () => {
    expect(rankBorrowers(people, 'LN20471')[0].name).toBe('John Smith');
    expect(rankBorrowers(people, '20510')[0].name).toBe('Robert Alvarez');
  });

  it('tolerates a small typo via subsequence fallback', () => {
    // "jhnson" is a subsequence of "johnson"
    const names = rankBorrowers(people, 'jhnson').map((b) => b.name);
    expect(names).toContain('Sarah Johnson');
  });

  it('excludes non-matches', () => {
    expect(rankBorrowers(people, 'zzzzz')).toHaveLength(0);
  });
});

describe('isSubsequence', () => {
  it('matches in-order character runs', () => {
    expect(isSubsequence('johnson', 'jhnsn')).toBe(true);
    expect(isSubsequence('johnson', 'jsn')).toBe(true);
    expect(isSubsequence('johnson', 'xyz')).toBe(false);
  });
});
