// A loan officer's agents: who they invited, who has joined, who they have sent work to.

import {
  addAgentInvite,
  findAgentByEmail,
  getAgentInvitesByEmail,
  getAgentInvitesByOwner,
  getAssignmentsByAgentEmail,
  getAssignmentsByOwner,
  normalizeEmail,
  updateAgentInvite,
} from '../store.js';
import { FINISHED } from './status.js';
import { sendMail } from '../email.js';
import { agentInviteEmail } from '../integrations/notifications.js';
import { emitAgent } from '../integrations/events.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 24 * 60 * 60 * 1000;
const MAX_INVITES_PER_DAY = 20;

/** Rows for the Agents page / API: one per agent email this loan officer has dealt with. */
export function buildRoster(ownerId) {
  const rows = new Map();
  const row = (email) => {
    if (!rows.has(email)) {
      rows.set(email, {
        email, name: '', brokerage: '', phone: '', status: 'no_account',
        invitedAt: null, inviteId: null, joinedAt: null, lastLoginAt: null,
        assignments: 0, open: 0, lastActivityAt: null,
      });
    }
    return rows.get(email);
  };
  const later = (a, b) => (!a || (b && b > a) ? b : a);

  for (const inv of getAgentInvitesByOwner(ownerId)) {
    const r = row(inv.email);
    r.name = r.name || inv.name;
    r.invitedAt = later(r.invitedAt, inv.createdAt);
    if (!inv.acceptedAt) r.inviteId = inv.id;
    r.lastActivityAt = later(r.lastActivityAt, inv.createdAt);
  }
  for (const a of getAssignmentsByOwner(ownerId)) {
    const r = row(a.agentEmail);
    r.assignments += 1;
    if (!FINISHED.has(a.status || 'preapproved')) r.open += 1;
    r.lastActivityAt = later(r.lastActivityAt, a.updatedAt);
  }
  for (const r of rows.values()) {
    const agent = findAgentByEmail(r.email);
    if (agent) {
      r.status = 'active';
      r.name = agent.name || r.name;
      r.brokerage = agent.brokerage || '';
      r.phone = agent.phone || '';
      r.joinedAt = agent.createdAt;
      r.lastLoginAt = agent.lastLoginAt || null;
      r.lastActivityAt = later(r.lastActivityAt, agent.lastLoginAt || null);
    } else if (r.inviteId) {
      r.status = 'invited';
    }
  }
  return [...rows.values()].sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
}

/** Create (or re-send) an invitation and email it. Returns { ok, invite, link, emailed } or { ok:false, status, error }. */
export async function inviteAgent(lo, { email, name = '' }, base) {
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e || '')) return { ok: false, status: 400, error: 'Enter a valid email address.' };
  const mine = getAgentInvitesByOwner(lo.id);
  if (mine.filter((i) => Date.now() - Date.parse(i.createdAt) < DAY).length >= MAX_INVITES_PER_DAY) {
    return { ok: false, status: 429, error: 'You have sent a lot of invitations today. Try again tomorrow.' };
  }
  const existing = findAgentByEmail(e);
  if (existing) {
    return { ok: false, status: 409, error: `${existing.name || e} already has an agent account — just assign them a pre-approval.` };
  }
  // Re-inviting the same address re-sends the same link instead of piling up invitations.
  let invite = mine.find((i) => i.email === e && !i.acceptedAt);
  if (invite) invite = updateAgentInvite(invite.id, { name: String(name || invite.name).slice(0, 120), createdAt: new Date().toISOString() });
  else invite = addAgentInvite({ ownerId: lo.id, ownerName: lo.name, email: e, name });
  const root = (base || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const link = `${root}/agent?invite=${encodeURIComponent(invite.token)}`;
  const mail = agentInviteEmail({ loName: lo.name, company: lo.company, agentName: invite.name, link });
  const sent = await sendMail({ to: e, ...mail });
  emitAgent('agent.invited', { loId: lo.id, agent: { email: e, name: invite.name }, ctx: { base: root } });
  return { ok: true, invite, link, emailed: !!sent.sent };
}

/** An agent just signed up or signed in: close any invitations to their address and tell the
 *  loan officers who were waiting for them. `firstTime` also tells those who assigned them work. */
export function agentArrived(agent, { firstTime = false, base } = {}) {
  const owners = new Set();
  for (const inv of getAgentInvitesByEmail(agent.email)) {
    if (inv.acceptedAt) continue;
    updateAgentInvite(inv.id, { acceptedAt: new Date().toISOString(), agentId: agent.id });
    owners.add(inv.ownerId);
  }
  if (firstTime) for (const a of getAssignmentsByAgentEmail(agent.email)) owners.add(a.ownerId);
  for (const loId of owners) emitAgent('agent.joined', { loId, agent, ctx: { base } });
}
