// One place that turns "something happened" into emails and GoHighLevel events.
//
// Routes call emitPreapproval / emitAgent without waiting; nothing here can throw into a
// request. Each person gets only what concerns them, on the channels they have on.

import { sendMail } from '../email.js';
import { findAgentByEmail, findUserById, getIntegrations } from '../store.js';
import { activityEmail, webhookPayload } from './notifications.js';
import { logDelivery, postWebhook } from './webhooks.js';

/** What each event is, who hears about it, and how (email and/or GoHighLevel). */
export const EVENTS = {
  'preapproval.assigned': { label: 'Pre-approval assigned', agent: ['email', 'ghl'], lo: ['ghl'], about: 'A loan officer assigns a pre-approval to an agent.' },
  'preapproval.status_changed': { label: 'Loan status changed', agent: ['email', 'ghl'], lo: ['ghl'], about: 'The loan moves to a new stage (under contract, appraisal, clear to close…).' },
  'preapproval.updated_by_agent': { label: 'Agent updated a pre-approval', lo: ['email', 'ghl'], about: 'An agent changes the property address or price.' },
  'preapproval.shared': { label: 'Letter shared', lo: ['email', 'ghl'], about: 'An agent publishes a link to the pre-approval letter.' },
  'preapproval.refresh_requested': { label: 'Refresh requested', lo: ['email', 'ghl'], about: 'An agent asks for a new letter.' },
  'preapproval.expiring': { label: 'Pre-approval expiring', agent: ['email', 'ghl'], lo: ['email', 'ghl'], about: 'A letter is about to expire.' },
  'agent.invited': { label: 'Agent invited', lo: ['ghl'], about: 'You invite an agent to the portal.' },
  'agent.joined': { label: 'Agent joined', lo: ['email', 'ghl'], about: 'An agent you invited or assigned a pre-approval to creates an account.' },
};

/** The events one kind of account can receive (for the Integrations screen). */
export function eventsFor(audience) {
  return Object.entries(EVENTS)
    .filter(([, e]) => e[audience])
    .map(([event, e]) => ({ event, label: e.label, about: e.about, email: e[audience].includes('email'), ghl: e[audience].includes('ghl') }));
}

// Chatty events are emailed at most once per window per person and pre-approval.
const THROTTLED = new Set(['preapproval.updated_by_agent']);
const THROTTLE_MS = 10 * 60 * 1000;
const lastSent = new Map();

async function deliver(audience, account, type, ctx) {
  const channels = EVENTS[type][audience] || [];
  const key = `${audience === 'lo' ? 'user' : 'agent'}:${account.id || account.email}`;
  const prefs = account.id ? getIntegrations(account.id) : {};

  if (channels.includes('email') && account.email) {
    if (prefs.notifyEmail === false) {
      logDelivery(key, { event: type, channel: 'email', ok: false, skipped: 'You turned these emails off.' });
    } else {
      const slot = `${key}:${type}:${ctx.assignment?.id || ''}`;
      const recent = lastSent.get(slot);
      if (THROTTLED.has(type) && recent && Date.now() - recent < THROTTLE_MS) {
        /* sent a moment ago — skip quietly */
      } else {
        lastSent.set(slot, Date.now());
        const mail = activityEmail(type, audience, ctx);
        if (mail) {
          const r = await sendMail({ to: account.email, ...mail });
          logDelivery(key, { event: type, channel: 'email', ok: !!r.sent, skipped: r.reason === 'not-configured' ? 'Email is not set up on this server.' : undefined, error: r.error });
        }
      }
    }
  }

  if (channels.includes('ghl') && prefs.ghlEnabled && prefs.ghlUrl) {
    const r = await postWebhook(prefs.ghlUrl, webhookPayload(type, audience, ctx));
    logDelivery(key, { event: type, channel: 'ghl', ok: r.ok, status: r.status, error: r.error });
  }
}

function safe(promise) {
  return promise.catch((err) => console.error('[events]', err && err.message ? err.message : err));
}

const contactOf = (a, fallback = {}) => ({
  id: a?.id,
  name: a?.name || fallback.name || '',
  email: a?.email || fallback.email || '',
  phone: a?.phone || fallback.phone || '',
  company: a?.brokerage || a?.company || fallback.company || '',
});

/** Something happened to a pre-approval. `ctx`: { base, source, link } */
export function emitPreapproval(type, assignment, ctx = {}) {
  return safe(
    (async () => {
      if (!EVENTS[type]) return;
      const agentAcct = findAgentByEmail(assignment.agentEmail);
      const loAcct = findUserById(assignment.ownerId);
      const letterOfficer = assignment.letter?.officer && typeof assignment.letter.officer === 'object' ? assignment.letter.officer : {};
      const lo = contactOf(loAcct ? { ...loAcct, company: loAcct.company } : null, { name: assignment.ownerName, email: letterOfficer.email, phone: letterOfficer.phone });
      const agent = contactOf(agentAcct, { email: assignment.agentEmail });
      const base = (ctx.base || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
      const full = { ...ctx, base, assignment, lo, agent };
      const jobs = [];
      if (EVENTS[type].lo && loAcct) jobs.push(deliver('lo', { ...loAcct, email: loAcct.email }, type, { ...full, link: base ? `${base}/agents` : '' }));
      if (EVENTS[type].agent) jobs.push(deliver('agent', agentAcct || { email: assignment.agentEmail }, type, { ...full, link: base ? `${base}/agent` : '' }));
      await Promise.all(jobs.map(safe));
    })(),
  );
}

/** An agent was invited or joined. `agentInfo`: { name, email, phone, brokerage } */
export function emitAgent(type, { loId, agent, ctx = {} }) {
  return safe(
    (async () => {
      if (!EVENTS[type] || !EVENTS[type].lo) return;
      const lo = findUserById(loId);
      if (!lo) return;
      const base = (ctx.base || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
      const full = { ...ctx, base, lo: contactOf(lo), agent: contactOf(agent), link: base ? `${base}/agents` : '' };
      await deliver('lo', lo, type, full);
    })(),
  );
}

/** Send one test event to a webhook address and say what happened (used by the "Send test" button). */
export async function sendTestEvent(accountKey, audience, url, who) {
  const ctx = { lo: { name: who.name, email: who.email }, agent: { name: 'Sample Agent', email: 'agent@example.com', phone: '', company: 'Sample Realty' }, source: 'test' };
  if (audience === 'agent') {
    ctx.agent = { name: who.name, email: who.email };
    ctx.lo = { name: 'Sample Loan Officer', email: 'lo@example.com', phone: '', company: 'Sample Lending' };
  }
  const r = await postWebhook(url, { ...webhookPayload('test', audience, ctx), test: true }, { retry: false });
  logDelivery(accountKey, { event: 'test', channel: 'ghl', ok: r.ok, status: r.status, error: r.error });
  return r;
}
