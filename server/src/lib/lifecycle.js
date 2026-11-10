// What can happen to a pre-approval after it is assigned: its loan stage moves, the agent
// updates the address, asks for a refresh, or it is about to expire. Both the app screens
// and the /api/v1 endpoints go through these functions so the rules live in one place.

import { updateAssignment } from '../store.js';
import { cappedPrice } from './assignmentLetter.js';
import { FINISHED, STATUSES, normalizeStatus } from './status.js';
import { emitPreapproval } from '../integrations/events.js';

const DAY = 24 * 60 * 60 * 1000;

/** Move a pre-approval to a new loan stage. Returns { ok, assignment, changed } or { ok:false, status, error }. */
export function applyStatus(a, rawStatus, { source = 'app', base } = {}) {
  const status = normalizeStatus(rawStatus);
  if (!status) {
    return { ok: false, status: 400, error: `Unknown status. Use one of: ${STATUSES.join(', ')}.` };
  }
  const current = a.status || 'preapproved';
  if (status === current) return { ok: true, assignment: a, changed: false };
  const now = new Date().toISOString();
  const history = Array.isArray(a.statusHistory) ? a.statusHistory.slice(-29) : [];
  history.push({ status, at: now });
  const next = updateAssignment(a.id, { status, statusUpdatedAt: now, statusHistory: history });
  emitPreapproval('preapproval.status_changed', next, { base, source });
  return { ok: true, assignment: next, changed: true };
}

/** What an agent may change: the address always, the price only when allowed and never above the ceiling. */
export function applyAgentEdit(a, body, { source = 'agent', base } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const patch = { editedByAgentAt: new Date().toISOString() };
  if (b.propertyAddress !== undefined) {
    const addr = String(b.propertyAddress || '').trim();
    if (!addr) return { ok: false, status: 400, error: 'A property address is required' };
    patch.propertyAddress = addr.slice(0, 300);
  }
  if (b.price !== undefined) {
    if (!a.allowPriceChange) return { ok: false, status: 403, error: 'Price changes are not enabled for this pre-approval.' };
    patch.price = cappedPrice(b.price, a.approvedPrice);
  }
  const next = updateAssignment(a.id, patch);
  emitPreapproval('preapproval.updated_by_agent', next, { base, source });
  return { ok: true, assignment: next };
}

/** The agent asks the loan officer for a new letter. At most once a day per pre-approval. */
export function requestRefresh(a, { source = 'agent', base } = {}) {
  const last = a.refreshRequestedAt ? Date.parse(a.refreshRequestedAt) : 0;
  if (last && Date.now() - last < DAY) {
    return { ok: false, status: 429, error: 'You already asked for a refresh today. Your loan officer has been notified.' };
  }
  const next = updateAssignment(a.id, { refreshRequestedAt: new Date().toISOString() });
  emitPreapproval('preapproval.refresh_requested', next, { base, source });
  return { ok: true, assignment: next };
}

/** When to nudge: a week before a letter expires, or a third of the way from the end for short ones. */
export function reminderDueAt(a) {
  if (!a.expiresAt) return null;
  const end = Date.parse(a.expiresAt);
  const start = Date.parse(a.createdAt);
  if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
  return end - Math.min(7 * DAY, (end - start) / 3);
}

/** Pre-approvals that should get their expiry reminder now. Pure, so it is easy to test. */
export function dueForReminder(assignments, nowMs = Date.now()) {
  return assignments.filter((a) => {
    if (a.expiryReminderAt || FINISHED.has(a.status || 'preapproved')) return false;
    const due = reminderDueAt(a);
    return due != null && nowMs >= due && nowMs < Date.parse(a.expiresAt);
  });
}

/** One sweep of the reminder job: email + notify, then remember so it only happens once. */
export function runExpiryReminders(assignments, nowMs = Date.now(), base) {
  const due = dueForReminder(assignments, nowMs);
  for (const a of due) {
    const next = updateAssignment(a.id, { expiryReminderAt: new Date(nowMs).toISOString() });
    emitPreapproval('preapproval.expiring', next, { base, source: 'schedule' });
  }
  return due.length;
}
