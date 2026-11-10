import { describe, expect, it } from 'vitest';
import { expiryState, LOAN_STATUSES, PIPELINE, STATUS_LABEL } from './loanStatus';

const NOW = Date.UTC(2026, 10, 10, 12);
const DAY = 86400000;

describe('expiryState', () => {
  it('says nothing when there is no expiry', () => {
    expect(expiryState(null, NOW).kind).toBe('none');
    expect(expiryState('garbage', NOW).kind).toBe('none');
  });
  it('is calm far from the end, warns inside a week, and reports lapsed letters', () => {
    expect(expiryState(new Date(NOW + 30 * DAY).toISOString(), NOW)).toMatchObject({ kind: 'ok', label: 'Expires in 30 days' });
    expect(expiryState(new Date(NOW + 7 * DAY).toISOString(), NOW)).toMatchObject({ kind: 'soon', label: 'Expires in 7 days' });
    expect(expiryState(new Date(NOW + 8 * DAY).toISOString(), NOW).kind).toBe('ok');
    expect(expiryState(new Date(NOW + 0.5 * DAY).toISOString(), NOW)).toMatchObject({ kind: 'soon', label: 'Expires today or tomorrow' });
    expect(expiryState(new Date(NOW - 0.5 * DAY).toISOString(), NOW)).toMatchObject({ kind: 'expired', label: 'Expired yesterday' });
    expect(expiryState(new Date(NOW - 3 * DAY).toISOString(), NOW)).toMatchObject({ kind: 'expired', label: 'Expired 3 days ago' });
  });
});

describe('stages', () => {
  it('has a label for each and a line that ends at closed', () => {
    for (const s of LOAN_STATUSES) expect(STATUS_LABEL[s.value]).toBe(s.label);
    expect(PIPELINE[0]).toBe('preapproved');
    expect(PIPELINE[PIPELINE.length - 1]).toBe('closed');
    expect(PIPELINE).not.toContain('cancelled');
  });
});
