// The words that go out: activity emails and the JSON sent to GoHighLevel.

import { STATUS_LABELS } from '../lib/status.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const APP = 'Loan Base Camp';

export function nameParts(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

/** The pre-approval facts an agent and a loan officer can both already see. */
export function preapprovalSummary(a) {
  return {
    id: a.id,
    status: a.status || 'preapproved',
    statusLabel: STATUS_LABELS[a.status || 'preapproved'] || 'Pre-approved',
    borrowerName: a.borrowerName || '',
    propertyAddress: a.propertyAddress || '',
    price: a.price || 0,
    approvedPrice: a.approvedPrice || 0,
    expiresAt: a.expiresAt || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

/** One sentence describing what happened, used in the email and in the JSON `message`. */
export function describeEvent(type, c) {
  const who = c.agent?.name || c.agent?.email || 'The agent';
  const lo = c.lo?.name || 'Your loan officer';
  const borrower = c.assignment?.borrowerName || 'the buyer';
  const addr = c.assignment?.propertyAddress ? ` for ${c.assignment.propertyAddress}` : '';
  switch (type) {
    case 'preapproval.assigned':
      return `${lo} assigned a pre-approval to you for ${borrower}${addr}.`;
    case 'preapproval.status_changed':
      return `${borrower}'s loan${addr} is now: ${STATUS_LABELS[c.assignment?.status] || 'updated'}.`;
    case 'preapproval.updated_by_agent':
      return `${who} updated the pre-approval for ${borrower}${addr}.`;
    case 'preapproval.shared':
      return `${who} shared the pre-approval letter for ${borrower} with a link.`;
    case 'preapproval.refresh_requested':
      return `${who} asked for a refreshed pre-approval letter for ${borrower}${addr}.`;
    case 'preapproval.expiring':
      return `The pre-approval for ${borrower}${addr} expires on ${fmtDate(c.assignment?.expiresAt)}.`;
    case 'agent.invited':
      return `You invited ${c.agent?.name || c.agent?.email} to join as an agent.`;
    case 'agent.joined':
      return `${who} created their agent account.`;
    case 'test':
      return 'This is a test from Loan Base Camp. If you can read this in GoHighLevel, the connection works.';
    default:
      return 'Something changed in Loan Base Camp.';
  }
}

/** JSON for GoHighLevel. The other person is also copied to flat fields (first_name,
 *  email, phone…) so a workflow can create or update a contact without any mapping. */
export function webhookPayload(type, audience, c) {
  const contact = audience === 'lo' ? c.agent : c.lo;
  const { first, last } = nameParts(contact?.name);
  const flat = {
    first_name: first,
    last_name: last,
    full_name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    company: contact?.company || '',
  };
  return {
    event: type,
    occurredAt: new Date().toISOString(),
    source: c.source || 'app',
    account: { type: audience === 'lo' ? 'loan_officer' : 'agent' },
    message: describeEvent(type, c),
    ...flat,
    contact: { type: audience === 'lo' ? 'agent' : 'loan_officer', ...flat },
    preapproval: c.assignment ? preapprovalSummary(c.assignment) : undefined,
    link: c.link || undefined,
  };
}

function shell({ heading, lines, button, footer }) {
  const body = lines.map((l) => `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${l}</p>`).join('');
  const btn = button
    ? `<p style="margin:6px 0 20px"><a href="${esc(button.link)}" style="display:inline-block;background:#2f649c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">${esc(button.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ea;font-family:Arial,Helvetica,sans-serif;color:#1b2431">
  <div style="max-width:480px;margin:0 auto;padding:28px">
    <div style="background:#ffffff;border:1px solid #e2e0d6;border-radius:14px;padding:26px">
      <div style="font-size:18px;font-weight:700;color:#2f649c;margin-bottom:12px">${APP}</div>
      <p style="font-size:16px;font-weight:700;margin:0 0 12px">${esc(heading)}</p>
      ${body}${btn}
      <p style="font-size:12px;line-height:1.6;color:#4a5666;margin:0">${footer}</p>
    </div>
  </div></body></html>`;
  return html;
}

const FOOTER = 'You can turn these emails off any time under Integrations.';

/** { subject, html, text } for one activity email, or null when the event has none. */
export function activityEmail(type, audience, c) {
  const sentence = describeEvent(type, c);
  const borrower = c.assignment?.borrowerName || 'a buyer';
  const link = audience === 'agent' ? (c.base ? `${c.base}/agent` : '') : c.base ? `${c.base}/agents` : '';
  const button = link ? { label: audience === 'agent' ? 'Open your pre-approvals' : 'Open Agents', link } : null;
  const subjects = {
    'preapproval.assigned': `New pre-approval for ${borrower}`,
    'preapproval.status_changed': `${borrower}: ${STATUS_LABELS[c.assignment?.status] || 'status update'}`,
    'preapproval.updated_by_agent': `An agent updated the pre-approval for ${borrower}`,
    'preapproval.shared': `A pre-approval letter was shared (${borrower})`,
    'preapproval.refresh_requested': `Refresh requested: ${borrower}`,
    'preapproval.expiring': `Pre-approval expiring soon: ${borrower}`,
    'agent.joined': `${c.agent?.name || c.agent?.email || 'An agent'} joined Loan Base Camp`,
  };
  const subject = subjects[type];
  if (!subject) return null;
  const extra = [];
  if (type === 'preapproval.assigned' && audience === 'agent') {
    extra.push('Sign in to confirm the property address and download the letter. If you do not have an account yet, create a free one with this email address.');
  }
  if (type === 'preapproval.refresh_requested') extra.push('Re-issue the letter from Pre-Approval and assign it again.');
  const html = shell({ heading: subject, lines: [esc(sentence), ...extra.map(esc)], button, footer: FOOTER });
  const text = [sentence, ...extra, link && `${link}`, '', FOOTER].filter((x) => x !== '' && x !== false).join('\n\n');
  return { subject, html, text };
}

/** The invitation a loan officer sends to an agent. */
export function agentInviteEmail({ loName, company, agentName, link }) {
  const from = loName ? `${loName}${company ? ` at ${company}` : ''}` : 'Your loan officer';
  const hi = agentName ? `Hi ${agentName},` : 'Hi,';
  const subject = `${loName || 'Your loan officer'} invited you to Loan Base Camp`;
  const html = shell({
    heading: subject,
    lines: [
      esc(hi),
      `${esc(from)} invited you to the free agent portal. You will see the pre-approvals they send you, can update the property address, download and share the letter, track where each loan stands, and make co-branded flyers.`,
    ],
    button: { label: 'Create your free agent account', link },
    footer: 'Real estate agents never pay. If you were not expecting this, you can ignore the email.',
  });
  const text = `${hi}\n\n${from} invited you to the free Loan Base Camp agent portal. Create your account here:\n${link}\n\nReal estate agents never pay.`;
  return { subject, html, text };
}
