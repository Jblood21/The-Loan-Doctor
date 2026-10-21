// Access codes: an owner-issued code that gives a person free access (or a longer trial)
// without a card. Free access is recorded on the account itself, so it works before
// Stripe is connected and never depends on a Stripe coupon.

import { randomBytes } from 'node:crypto';
import {
  addAccessCode,
  findAccessCodeByKey,
  updateAccessCode,
  updateUserBilling,
  normalizeEmail,
} from '../store.js';
import { trialEndMs } from './entitlement.js';
import { DAY_MS } from './config.js';

export const CODE_KINDS = ['free_forever', 'free_months', 'free_until', 'trial_days'];

// No 0/O/1/I/L so a code read aloud or off a screenshot can't be mistyped.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GENERIC_ERROR = "That code isn't valid. Check it and try again, or ask whoever gave it to you.";

/** Letters and digits only, upper-cased — so "alan-vip", "ALAN VIP" and "ALANVIP" all match. */
export const normalizeCodeKey = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function generateCodeText(groups = 2, groupLen = 4) {
  const out = [];
  for (let g = 0; g < groups; g++) {
    let part = '';
    while (part.length < groupLen) {
      // Rejection sampling keeps every letter equally likely.
      for (const byte of randomBytes(16)) {
        if (byte < 248 && part.length < groupLen) part += ALPHABET[byte % ALPHABET.length];
      }
    }
    out.push(part);
  }
  return out.join('-');
}

const endOfDayUtc = (d) => {
  const s = String(d || '').trim();
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T23:59:59Z`) : Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

const addMonthsUtc = (fromMs, months) => {
  const d = new Date(fromMs);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
};

const wholeInt = (v) => (Number.isInteger(Number(v)) && String(v).trim() !== '' ? Number(v) : NaN);

/** Validate admin input and store a new code. Returns { code } or { error }. */
export function createAccessCode(input, createdBy, now = Date.now()) {
  const kind = input?.kind;
  if (!CODE_KINDS.includes(kind)) return { error: 'Choose what the code gives (forever, months, until a date, or extra trial days).' };

  const code = { kind };
  if (kind === 'free_months') {
    const months = wholeInt(input.months);
    if (!(months >= 1 && months <= 60)) return { error: 'Months must be a whole number from 1 to 60.' };
    code.months = months;
  }
  if (kind === 'free_until') {
    const until = endOfDayUtc(input.until);
    if (until === null || until <= now) return { error: 'Pick an end date in the future.' };
    code.until = new Date(until).toISOString();
  }
  if (kind === 'trial_days') {
    const days = wholeInt(input.trialDays);
    if (!(days >= 1 && days <= 365)) return { error: 'Extra trial days must be a whole number from 1 to 365.' };
    code.trialDays = days;
  }

  let maxUses = null;
  if (input.maxUses !== undefined && input.maxUses !== null && String(input.maxUses).trim() !== '') {
    maxUses = wholeInt(input.maxUses);
    if (!(maxUses >= 1 && maxUses <= 100000)) return { error: 'Maximum uses must be a whole number of 1 or more (leave blank for unlimited).' };
  }

  let redeemBy = null;
  if (input.redeemBy) {
    redeemBy = endOfDayUtc(input.redeemBy);
    if (redeemBy === null || redeemBy <= now) return { error: 'The "use by" date must be in the future.' };
  }

  let lockedEmail = null;
  if (input.lockedEmail && String(input.lockedEmail).trim()) {
    lockedEmail = normalizeEmail(input.lockedEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lockedEmail)) return { error: 'That email address doesn\'t look right.' };
  }

  let text = String(input.code || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (text) {
    if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(text) || normalizeCodeKey(text).length < 4) {
      return { error: 'A custom code can use letters, numbers and dashes, 4 to 24 characters.' };
    }
  } else {
    do text = generateCodeText();
    while (findAccessCodeByKey(normalizeCodeKey(text)));
  }
  const key = normalizeCodeKey(text);
  if (findAccessCodeByKey(key)) return { error: 'A code with that name already exists.' };

  const stored = addAccessCode({
    id: randomBytes(8).toString('hex'),
    code: text,
    key,
    label: String(input.label || '').trim().slice(0, 120),
    ...code,
    maxUses,
    uses: 0,
    redeemBy: redeemBy === null ? null : new Date(redeemBy).toISOString(),
    lockedEmail,
    revoked: false,
    createdAt: new Date(now).toISOString(),
    createdBy: createdBy || null,
    redemptions: [],
  });
  return { code: stored };
}

export function revokeAccessCode(id, revoked = true) {
  return updateAccessCode(id, { revoked: !!revoked });
}

/** One plain sentence about what a code gives — shown to the person redeeming it. */
export function describeCode(c) {
  if (c.kind === 'free_forever') return 'Free access, no card needed.';
  if (c.kind === 'free_months') return `Free access for ${c.months} month${c.months === 1 ? '' : 's'}.`;
  if (c.kind === 'free_until') {
    return `Free access until ${new Date(c.until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.`;
  }
  return `${c.trialDays} extra trial day${c.trialDays === 1 ? '' : 's'}.`;
}

/** Is this code usable by this person right now? Returns null when fine, else a reason. */
function unusableReason(c, user, now) {
  if (!c || c.revoked) return 'invalid';
  if (c.redeemBy && now > Date.parse(c.redeemBy)) return 'invalid';
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'invalid';
  if (c.lockedEmail && c.lockedEmail !== normalizeEmail(user.email)) return 'invalid';
  return null;
}

/** Check a code without using it (signup validates before it creates the account). */
export function checkAccessCode(rawCode, email, now = Date.now()) {
  const c = findAccessCodeByKey(normalizeCodeKey(rawCode));
  if (unusableReason(c, { email }, now)) return { ok: false, error: GENERIC_ERROR };
  return { ok: true, code: c };
}

/**
 * Redeem a code for a signed-in user. `ctx` is { now, enabledAt, cfg } (see entitlement.js).
 * Same person + same code twice is harmless: no second use is counted.
 */
export function redeemAccessCode(user, rawCode, ctx) {
  const { now } = ctx;
  const c = findAccessCodeByKey(normalizeCodeKey(rawCode));
  if (c && c.redemptions.some((r) => r.userId === user.id)) {
    return { ok: true, already: true, message: describeCode(c) };
  }
  if (unusableReason(c, user, now)) return { ok: false, error: GENERIC_ERROR };

  const comp = user.billing?.comp || null;
  if (comp?.forever) {
    return { ok: true, already: true, message: 'You already have free access with no end date.' };
  }
  const compUntil = Date.parse(comp?.until || '') || 0;
  const stamp = { codeId: c.id, label: c.label, grantedAt: new Date(now).toISOString() };

  if (c.kind === 'free_forever') {
    updateUserBilling(user.id, { comp: { ...stamp, forever: true } });
  } else if (c.kind === 'free_months') {
    const until = addMonthsUtc(Math.max(now, compUntil), c.months);
    updateUserBilling(user.id, { comp: { ...stamp, until: new Date(until).toISOString() } });
  } else if (c.kind === 'free_until') {
    const until = Math.max(Date.parse(c.until), compUntil);
    updateUserBilling(user.id, { comp: { ...stamp, until: new Date(until).toISOString() } });
  } else {
    const base = Math.max(now, trialEndMs(user, ctx));
    updateUserBilling(user.id, { trialEndsAt: new Date(base + c.trialDays * DAY_MS).toISOString() });
  }

  updateAccessCode(c.id, {
    uses: c.uses + 1,
    redemptions: [...c.redemptions, { userId: user.id, email: user.email, at: new Date(now).toISOString() }],
  });
  return { ok: true, message: describeCode(c) };
}
