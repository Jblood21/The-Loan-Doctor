import { describe, it, expect } from 'vitest';
import { buildComparisonModel } from './comparisonModel';
import type { LoanType, Scenario } from '@/types';

function sc(loanType: LoanType, over: Partial<Scenario> = {}): Scenario {
  return {
    name: loanType.toUpperCase(),
    transaction: 'purchase',
    borrowers: '1',
    loanType,
    program: 'standard',
    homePrice: 400000,
    downPayment: 40000, // 10% → conventional PMI applies
    downPct: 10,
    rate: 6.5,
    term: '30',
    credit: '700',
    lenderCredit: 0,
    sellerCredit: 0,
    otherCredits: 0,
    ...over,
  };
}

const keys = (s: Scenario[]) => buildComparisonModel(s).rows.map((r) => r.key);

describe('buildComparisonModel — dynamic rows', () => {
  it('Conventional vs Conventional (PMI applies): PMI row, no government rows', () => {
    const k = keys([sc('conventional'), sc('conventional')]);
    expect(k).toContain('pmi');
    expect(k).not.toContain('fhaUfmip');
    expect(k).not.toContain('vaFundingFee');
    expect(k).not.toContain('usdaUpfront');
    expect(buildComparisonModel([sc('conventional'), sc('conventional')]).mixed).toBe(false);
  });

  it('Conventional 20% down (no PMI): no PMI row', () => {
    const k = keys([sc('conventional', { downPayment: 80000, downPct: 20 })]);
    expect(k).not.toContain('pmi');
  });

  it('Conventional vs FHA: adds FHA rows, keeps PMI, mixed', () => {
    const m = buildComparisonModel([sc('conventional'), sc('fha', { downPayment: 14000, downPct: 3.5 })]);
    const k = m.rows.map((r) => r.key);
    expect(k).toContain('fhaUfmip');
    expect(k).toContain('fhaMip');
    expect(k).toContain('pmi');
    expect(k).not.toContain('vaFundingFee');
    expect(m.mixed).toBe(true);
  });

  it('Conventional vs VA: adds VA funding-fee row', () => {
    const k = keys([sc('conventional'), sc('va', { downPayment: 0, downPct: 0 })]);
    expect(k).toContain('vaFundingFee');
    expect(k).not.toContain('fhaUfmip');
  });

  it('FHA vs VA: FHA + VA rows, no PMI, no USDA', () => {
    const k = keys([sc('fha', { downPayment: 14000, downPct: 3.5 }), sc('va', { downPayment: 0, downPct: 0 })]);
    expect(k).toContain('fhaUfmip');
    expect(k).toContain('vaFundingFee');
    expect(k).not.toContain('pmi');
    expect(k).not.toContain('usdaUpfront');
  });

  it('Conventional vs FHA vs VA: all program rows present', () => {
    const k = keys([sc('conventional'), sc('fha', { downPayment: 14000, downPct: 3.5 }), sc('va', { downPayment: 0, downPct: 0 })]);
    expect(k).toEqual(expect.arrayContaining(['fhaUfmip', 'fhaMip', 'vaFundingFee', 'pmi', 'totalMonthly', 'cashToClose']));
  });

  it('USDA: adds USDA fee rows', () => {
    const k = keys([sc('usda', { downPayment: 0, downPct: 0 })]);
    expect(k).toContain('usdaUpfront');
    expect(k).toContain('usdaAnnual');
  });

  it('HOA row hidden when all scenarios have no HOA, shown when one does', () => {
    expect(keys([sc('conventional'), sc('conventional')])).not.toContain('hoa');
    expect(keys([sc('conventional'), sc('conventional', { hoaMonthly: 150 })])).toContain('hoa');
  });
});

describe('buildComparisonModel — dynamic notes', () => {
  it('only includes notes for programs present', () => {
    const m = buildComparisonModel([sc('conventional'), sc('fha', { downPayment: 14000, downPct: 3.5 })]);
    const joined = m.notes.join(' ');
    expect(joined).toMatch(/FHA/);
    expect(joined).not.toMatch(/VA funding fee/i);
    expect(joined).not.toMatch(/USDA/);
  });

  it('VA note only when VA present; PMI note only when conventional carries PMI', () => {
    const va = buildComparisonModel([sc('va', { downPayment: 0, downPct: 0 })]);
    expect(va.notes.join(' ')).toMatch(/VA funding fee/i);
    expect(va.notes.join(' ')).not.toMatch(/PMI/);

    const conv20 = buildComparisonModel([sc('conventional', { downPayment: 80000, downPct: 20 })]);
    expect(conv20.notes.join(' ')).not.toMatch(/PMI/); // no PMI at 20% down → no note
  });
});

describe('buildComparisonModel — cell values', () => {
  it('program-specific cells show a dash for other programs', () => {
    const m = buildComparisonModel([sc('conventional'), sc('fha', { downPayment: 14000, downPct: 3.5 })]);
    const conv = m.columns[0];
    const fha = m.columns[1];
    expect(conv.cells.fhaUfmip).toBe('—'); // conventional has no FHA UFMIP
    expect(fha.cells.fhaUfmip).not.toBe('—'); // FHA does
    expect(fha.cells.pmi).toBe('—'); // FHA has no conventional PMI
  });
});
