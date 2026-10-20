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

describe('buildComparisonModel — DSCR', () => {
  const dscr = (over: Partial<Scenario> = {}) =>
    sc('dscr', { downPayment: 100000, downPct: 25, rate: 7.5, rentMonthly: 3000, ...over });

  it('adds the rent / DSCR / cash-flow / prepayment rows only when a DSCR scenario is present', () => {
    const k = keys([sc('conventional'), dscr()]);
    for (const row of ['dscrRent', 'dscrRatio', 'dscrCashFlow', 'dscrPrepay']) expect(k).toContain(row);
    const none = keys([sc('conventional'), sc('fha')]);
    for (const row of ['dscrRent', 'dscrRatio', 'dscrCashFlow', 'dscrPrepay', 'dscrAfterIo']) expect(none).not.toContain(row);
  });

  it('DSCR carries no insurance rows (no PMI/FHA/VA/USDA) even at high LTV', () => {
    const k = keys([dscr({ downPayment: 40000, downPct: 10 })]);
    for (const row of ['pmi', 'fhaUfmip', 'fhaMip', 'vaFundingFee', 'usdaUpfront', 'usdaAnnual']) expect(k).not.toContain(row);
  });

  it('the DSCR cell spells out the band, and non-DSCR scenarios show a dash', () => {
    const m = buildComparisonModel([sc('conventional'), dscr()]);
    const [conv, d] = m.columns;
    expect(conv.cells.dscrRatio).toBe('—');
    expect(conv.cells.dscrRent).toBe('—');
    expect(conv.cells.dscrCashFlow).toBe('—');
    expect(d.cells.dscrRent).toBe('$3,000.00');
    expect(d.cells.dscrRatio).toMatch(/^1\.\d\d \((Meets 1\.0|Strong)\)$/); // no nested parentheses
    expect(d.cells.dscrPrepay).toBe('None');
  });

  it('a negative cash flow reads with a real minus sign', () => {
    const [d] = buildComparisonModel([dscr({ rentMonthly: 2000 })]).columns;
    expect(d.cells.dscrCashFlow).toMatch(/^–\$[\d,]+\.\d\d$/);
    expect(d.cells.dscrRatio).toMatch(/\(Below 1\.0\)$/);
  });

  it('no rent yet reads as a prompt, not a zero ratio', () => {
    const [d] = buildComparisonModel([dscr({ rentMonthly: 0 })]).columns;
    expect(d.cells.dscrRatio).toBe('Enter rent');
    expect(d.cells.dscrRent).toBe('Not entered');
    expect(d.cells.dscrCashFlow).toBe('—');
  });

  it('the after-interest-only row appears only when a scenario is interest-only', () => {
    expect(keys([dscr()])).not.toContain('dscrAfterIo');
    const m = buildComparisonModel([dscr({ interestOnly: true }), sc('conventional')]);
    expect(m.rows.map((r) => r.key)).toContain('dscrAfterIo');
    // The interest-only scenario shows the higher post-reset payment; the other keeps its own.
    expect(m.columns[1].cells.dscrAfterIo).toBe('—');
    const start = Number(m.columns[0].cells.totalMonthly.replace(/[$,]/g, ''));
    const after = Number(m.columns[0].cells.dscrAfterIo.replace(/[$,]/g, ''));
    expect(after).toBeGreaterThan(start);
  });

  it('prints the DSCR notes, plus interest-only / prepayment notes only when used', () => {
    const base = buildComparisonModel([dscr()]).notes.join(' ');
    expect(base).toMatch(/qualify on the property.s rental income/);
    expect(base).toMatch(/no mortgage insurance/i);
    expect(base).not.toMatch(/Interest-only:/);
    expect(base).not.toMatch(/prepayment penalty is a fee/);
    const full = buildComparisonModel([dscr({ interestOnly: true, dscrPrepay: '3-2-1' })]).notes.join(' ');
    expect(full).toMatch(/Interest-only:/);
    expect(full).toMatch(/prepayment penalty is a fee/);
    // No DSCR notes when no DSCR scenario is compared.
    expect(buildComparisonModel([sc('conventional')]).notes.join(' ')).not.toMatch(/DSCR/);
  });

  it('labels the program in the model', () => {
    const m = buildComparisonModel([sc('conventional'), dscr()]);
    expect(m.programLabels).toEqual(['Conventional', 'DSCR']);
    expect(m.mixed).toBe(true);
  });
});
