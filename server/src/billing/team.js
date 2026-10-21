// Teams: a company (owner) pays for a group of loan officers. Members get full access
// while the team's subscription is active, whatever their own trial says.

import {
  addInvite,
  addOrg,
  findInviteById,
  findInviteByToken,
  findOrg,
  findUserByEmail,
  findUserById,
  normalizeEmail,
  orgMembers,
  removeInvite,
  updateInvite,
  updateUser,
} from '../store.js';
import { DAY_MS } from './config.js';
import { BillingError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INVITE_TTL_DAYS = 14;

export function createTeam(user, rawName) {
  if (user.orgId && findOrg(user.orgId)) throw new BillingError('You are already on a team.', 409);
  const name = String(rawName || '').trim().slice(0, 80) || user.company || `${user.name || 'My'} team`;
  const org = addOrg({ name, ownerId: user.id });
  updateUser(user.id, { orgId: org.id });
  return org;
}

const mustOwn = (user, org) => {
  if (!org || org.ownerId !== user.id) throw new BillingError('Only the team owner can do that.', 403);
};

export function inviteMember(owner, rawEmail, now = Date.now()) {
  const org = findOrg(owner.orgId);
  mustOwn(owner, org);
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) throw new BillingError("That email address doesn't look right.", 400);
  if (email === normalizeEmail(owner.email)) throw new BillingError("You're already on the team.", 400);
  const existing = findUserByEmail(email);
  if (existing && existing.orgId === org.id) throw new BillingError('That person is already on your team.', 409);
  if (existing?.orgId) throw new BillingError('That person is already on another team.', 409);
  return { org, invite: addInvite({ orgId: org.id, email, invitedBy: owner.id, ttlMs: INVITE_TTL_DAYS * DAY_MS }) };
}

export function cancelInvite(owner, inviteId) {
  const org = findOrg(owner.orgId);
  mustOwn(owner, org);
  const invite = findInviteById(inviteId);
  if (!invite || invite.orgId !== org.id) throw new BillingError('Invitation not found.', 404);
  removeInvite(invite.id);
}

/** Is this invite link usable by someone with this email? Returns the invite or throws. */
export function checkInvite(token, email, now = Date.now()) {
  const invite = findInviteByToken(token);
  const org = invite && findOrg(invite.orgId);
  if (!invite || !org || invite.acceptedAt || now > Date.parse(invite.expiresAt)) {
    throw new BillingError('This invitation link is no longer valid. Ask your team owner to send a new one.', 400);
  }
  if (email !== undefined && normalizeEmail(email) !== invite.email) {
    throw new BillingError(`This invitation was sent to ${invite.email}. Sign in with that email address to join.`, 403);
  }
  return { invite, org };
}

export function acceptInvite(user, token, now = Date.now()) {
  // Following the same link again after joining (e.g. signing up from it, then landing
  // on the plan page) is fine: report success rather than "no longer valid".
  const used = findInviteByToken(token);
  if (used?.acceptedAt && used.email === normalizeEmail(user.email) && user.orgId === used.orgId) return findOrg(used.orgId);
  const { invite, org } = checkInvite(token, user.email, now);
  if (user.orgId && user.orgId !== org.id) throw new BillingError('Leave your current team before joining another.', 409);
  updateUser(user.id, { orgId: org.id });
  updateInvite(invite.id, { acceptedAt: new Date(now).toISOString() });
  return org;
}

export function removeMember(owner, memberId) {
  const org = findOrg(owner.orgId);
  mustOwn(owner, org);
  const member = findUserById(memberId);
  if (!member || member.orgId !== org.id) throw new BillingError('That person is not on your team.', 404);
  if (member.id === owner.id) throw new BillingError("You can't remove the team owner.", 400);
  updateUser(member.id, { orgId: null });
  return org;
}

export function leaveTeam(user) {
  const org = findOrg(user.orgId);
  if (!org) throw new BillingError("You're not on a team.", 400);
  if (org.ownerId === user.id) throw new BillingError('The team owner can\'t leave. Remove the other members first, or contact support to close the team.', 400);
  updateUser(user.id, { orgId: null });
  return org;
}

export const teamSize = (orgId) => orgMembers(orgId).length;
