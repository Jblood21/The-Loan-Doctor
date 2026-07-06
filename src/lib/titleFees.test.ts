import { describe, it, expect } from 'vitest';
import { titlePremium, titleBasisAmount, buildTitleScheduleFees, applyTitleSchedule, TITLE_PREMIUMS } from './titleFees';

let idc = 0;
const newId = () => `t${++idc}`;

describe('titlePremium — matches the uploaded schedule', () => {
  it('has 105 tiers of 5 columns', () => {
    expect(TITLE_PREMIUMS.length).toBe(105);
    expect(TITLE_PREMIUMS.every((r) => r.length === 5)).toBe(true);
  });
  it('$300k sheet values', () => {
    expect(titlePremium(300000, 0)).toBe(1453); // Standard Owner's
    expect(titlePremium(300000, 1)).toBe(1018); // ALTA Loan
    expect(titlePremium(300000, 2)).toBe(1599); // ALTA Homeowner's
    expect(titlePremium(300000, 3)).toBe(894); // Refinance
    expect(titlePremium(300000, 4)).toBe(945); // Builder 65%
  });
  it('rounds up to the tier ("up to and including")', () => {
    expect(titlePremium(295000, 0)).toBe(1453); // -> 300k tier
    expect(titlePremium(300001, 0)).toBe(1490); // -> 310k tier
  });
  it('clamps low amounts to the first tier and 0 for non-positive', () => {
    expect(titlePremium(5000, 0)).toBe(200);
    expect(titlePremium(0, 0)).toBe(0);
  });
  it('extrapolates above the top tier', () => {
    expect(titlePremium(1100000, 0)).toBeGreaterThan(titlePremium(1050000, 0));
  });
});

describe('titleBasisAmount — price vs loan sourcing', () => {
  it("owner's policies read purchase price; lender's read loan amount", () => {
    expect(titleBasisAmount('title-owners', 270000, 300000)).toBe(1453); // by price 300k
    expect(titleBasisAmount('title-loan', 270000, 300000)).toBe(titlePremium(270000, 1)); // by loan 270k
    expect(titleBasisAmount('title-refi', 270000, 300000)).toBe(titlePremium(270000, 3));
  });
  it('returns null for non-title bases', () => {
    expect(titleBasisAmount('flat', 1, 1)).toBeNull();
  });
});

describe('buildTitleScheduleFees / applyTitleSchedule', () => {
  it('purchase full quote = owner + lender + 6 flat fees', () => {
    const fees = buildTitleScheduleFees({ transaction: 'purchase', mode: 'full', newId });
    expect(fees.length).toBe(8);
    expect(fees[0].basis).toBe('title-owners');
    expect(fees[1].basis).toBe('title-loan');
  });
  it('refinance drops the owner policy and uses the refi loan column', () => {
    const fees = buildTitleScheduleFees({ transaction: 'refinance', mode: 'full', newId });
    expect(fees.some((f) => f.basis === 'title-owners')).toBe(false);
    expect(fees.some((f) => f.basis === 'title-refi')).toBe(true);
  });
  it('premiums-only omits the flat fees', () => {
    expect(buildTitleScheduleFees({ transaction: 'purchase', mode: 'premiums', newId }).length).toBe(2);
  });
  it('apply preserves non-title fees and swaps the title block', () => {
    const start = [
      { id: 'a', label: 'Origination Fee', basis: 'loan' as const, value: 1 },
      { id: 'b', label: "Owner's Title Policy", basis: 'title-owners' as const, value: 0 },
      { id: 'c', label: 'Recording', basis: 'flat' as const, value: 52 },
      { id: 'd', label: 'My Custom Fee', basis: 'flat' as const, value: 99 },
    ];
    const out = applyTitleSchedule(start, { transaction: 'refinance', mode: 'full', newId });
    expect(out.some((f) => f.label === 'Origination Fee')).toBe(true);
    expect(out.some((f) => f.label === 'My Custom Fee')).toBe(true);
    expect(out.filter((f) => f.basis === 'title-owners').length).toBe(0);
    expect(out.some((f) => f.basis === 'title-refi')).toBe(true);
    expect(out.filter((f) => f.label === 'Recording').length).toBe(1); // deduped
  });
});
