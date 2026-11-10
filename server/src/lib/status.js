// Where a buyer's loan stands, as the loan officer reports it and the agent sees it.
// Only a stage name — never rates, amounts or anything about the borrower's finances.

export const STATUSES = ['preapproved', 'under_contract', 'appraisal', 'clear_to_close', 'closed', 'cancelled'];

export const STATUS_LABELS = {
  preapproved: 'Pre-approved',
  under_contract: 'Under contract',
  appraisal: 'Appraisal',
  clear_to_close: 'Clear to close',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Stages after which nothing more is expected (no expiry reminders). */
export const FINISHED = new Set(['closed', 'cancelled']);

const ALIASES = {
  preapproval: 'preapproved',
  preapprove: 'preapproved',
  approved: 'preapproved',
  contract: 'under_contract',
  undercontract: 'under_contract',
  pending: 'under_contract',
  inappraisal: 'appraisal',
  appraisalordered: 'appraisal',
  ctc: 'clear_to_close',
  cleartoclose: 'clear_to_close',
  funded: 'closed',
  settled: 'closed',
  canceled: 'cancelled',
  withdrawn: 'cancelled',
  denied: 'cancelled',
  lost: 'cancelled',
};

/** Accept "Under Contract", "under-contract", "CTC", "canceled", … → a known status or null. */
export function normalizeStatus(value) {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  const direct = STATUSES.find((s) => s.replace(/_/g, '') === key);
  return direct || ALIASES[key] || null;
}
