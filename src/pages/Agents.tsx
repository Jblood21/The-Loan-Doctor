import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusTracker } from '@/components/StatusTracker';
import { TextField, Label } from '@/components/ui/TextField';
import { ApiError, api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { LOAN_STATUSES, expiryState } from '@/lib/loanStatus';
import type { Assignment, LoanStatus, RosterAgent } from '@/types';

/** Small toggle switch (matches the Pre-Approval page styling). */
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-brand-blue' : 'bg-border-input'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/** A refresh request stays flagged for two weeks, long enough to re-issue the letter. */
const recentlyRequested = (a: Assignment) =>
  !!a.refreshRequestedAt && Date.now() - Date.parse(a.refreshRequestedAt) < 14 * 86400000 && !['closed', 'cancelled'].includes(a.status);

function ExpiryBadge({ a }: { a: Assignment }) {
  if (['closed', 'cancelled'].includes(a.status)) return null;
  const e = expiryState(a.expiresAt);
  if (e.kind === 'none') return null;
  const tone = e.kind === 'expired' ? 'bg-danger-tint text-danger' : e.kind === 'soon' ? 'bg-warning-tint text-warn-text' : 'bg-surface-tint text-text-muted';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{e.label}</span>;
}

export default function Agents() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [roster, setRoster] = useState<RosterAgent[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ tone: 'ok' | 'error'; text: string; link?: string } | null>(null);

  const portalUrl = `${window.location.origin}/agent`;

  const load = () => {
    setLoading(true);
    setError('');
    api
      .listAssignments()
      .then(({ assignments: a }) => setAssignments(a))
      .catch(() => setError('Could not load assignments. The server may be waking up — try Refresh.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    api.listRoster().then((r) => setRoster(r.agents)).catch(() => {});
  }, []);

  const patch = async (id: string, body: Partial<Pick<Assignment, 'allowPriceChange' | 'approvedPrice'>> & { status?: LoanStatus }) => {
    try {
      const { assignment } = await api.updateAssignment(id, body);
      setAssignments((list) => list.map((x) => (x.id === id ? assignment : x)));
      if (body.status) api.listRoster().then((r) => setRoster(r.agents)).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that change.');
    }
  };

  const invite = async () => {
    setInviting(true);
    setInviteMsg(null);
    try {
      const r = await api.inviteAgent({ email: inviteEmail.trim(), name: inviteName.trim() });
      setRoster(r.agents);
      setInviteMsg(
        r.emailed
          ? { tone: 'ok', text: `Invitation emailed to ${inviteEmail.trim()}.` }
          : { tone: 'ok', text: 'Invitation saved. Email is not set up on this site yet, so send them this link yourself:', link: r.link },
      );
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      setInviteMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not send the invitation.' });
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (id: string) => {
    try {
      setRoster((await api.cancelAgentInvite(id)).agents);
    } catch {
      /* the list refreshes next time */
    }
  };

  const remove = async (a: Assignment) => {
    if (!window.confirm(`Remove the pre-approval assigned to ${a.agentEmail}? The agent will no longer see it.`)) return;
    await api.deleteAssignment(a.id);
    setAssignments((list) => list.filter((x) => x.id !== a.id));
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL is shown for manual copy */
    }
  };

  return (
    <div className="animate-lp-fade">
      <PageHeader
        title="Agents"
        subtitle="Assign pre-approvals to real-estate agents and control what they can change."
        actions={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      {/* Share the agent portal link */}
      <Card className="mb-6 p-5">
        <div className="text-[13px] font-semibold text-text-label">Agent sign-up link</div>
        <div className="mt-1 text-[12.5px] text-text-muted">
          Share this with your agents. They create their own account, and any pre-approval you assign to their email shows up in their portal.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[9px] border border-border-input bg-input px-3 py-2 text-[13px] text-text-soft">{portalUrl}</code>
          <Button variant="secondary" size="sm" onClick={copyUrl}>{copied ? 'Copied!' : 'Copy'}</Button>
          <Button variant="ghost" size="sm" onClick={() => window.open(portalUrl, '_blank', 'noopener')}>Open</Button>
        </div>
      </Card>

      {/* Invite an agent and see everyone you work with */}
      <Card className="mb-6 p-5">
        <div className="text-[13px] font-semibold text-text-label">Invite an agent</div>
        <div className="mt-1 text-[12.5px] text-text-muted">We email them a link that sets up a free account already connected to you.</div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (inviteEmail.trim()) invite();
          }}
        >
          <div className="min-w-[160px] flex-1">
            <Label>Name (optional)</Label>
            <TextField value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" aria-label="Agent name" />
          </div>
          <div className="min-w-[220px] flex-[2]">
            <Label>Email</Label>
            <TextField type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="agent@brokerage.com" aria-label="Agent email" />
          </div>
          <Button variant="primary" type="submit" disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
        {inviteMsg && (
          <div className={`mt-2.5 text-[12.5px] ${inviteMsg.tone === 'error' ? 'text-danger' : 'text-good'}`}>
            {inviteMsg.text}
            {inviteMsg.link && <code className="mt-1.5 block break-all rounded-[8px] border border-border-input bg-input px-2.5 py-1.5 text-text-soft">{inviteMsg.link}</code>}
          </div>
        )}

        {roster.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-[0.04em] text-text-dim">
                  <th className="py-1.5 pr-3 font-semibold">Agent</th>
                  <th className="py-1.5 pr-3 font-semibold">Status</th>
                  <th className="py-1.5 pr-3 font-semibold">Pre-approvals</th>
                  <th className="py-1.5 font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.email} className="border-t border-border align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-text-soft">{r.name || r.email}</div>
                      <div className="text-[12px] text-text-dim">
                        {r.name ? `${r.email}` : ''}
                        {r.brokerage ? `${r.name ? ' · ' : ''}${r.brokerage}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.status === 'active' && <span className="rounded-full bg-success-tint px-2 py-0.5 text-[11.5px] font-semibold text-good">Joined</span>}
                      {r.status === 'invited' && (
                        <span className="inline-flex items-center gap-2">
                          <span className="rounded-full bg-surface-tint px-2 py-0.5 text-[11.5px] font-semibold text-text-muted">Invited</span>
                          {r.inviteId && (
                            <button onClick={() => cancelInvite(r.inviteId as string)} className="cursor-pointer border-none bg-transparent text-[11.5px] font-semibold text-text-dim hover:text-danger">
                              Cancel
                            </button>
                          )}
                        </span>
                      )}
                      {r.status === 'no_account' && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11.5px] font-semibold text-warn-text">No account yet</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-text-soft">{r.assignments ? `${r.assignments} (${r.open} open)` : '—'}</td>
                    <td className="py-2.5 text-text-dim">
                      {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {error && <div className="mb-4 rounded-[11px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-[15px] py-3 text-[13px] text-danger">{error}</div>}

      {!loading && !assignments.length && !error ? (
        <Card className="px-6 py-12 text-center">
          <div className="text-[15px] font-semibold text-text-heading">No assignments yet</div>
          <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] text-text-muted">
            Build a letter on the <span className="font-semibold text-text-soft">Pre-Approval</span> page, then use <span className="font-semibold text-text-soft">Assign to agent</span> to hand it to an agent for property-address (and optional price) edits.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {assignments.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-text-heading">{a.borrowerName || 'Borrower'}</span>
                    <span className="rounded-full bg-[rgba(47,128,237,0.14)] px-2 py-0.5 text-[11px] font-semibold text-brand-blue-light">{a.agentEmail}</span>
                    {a.agentActive === false && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-semibold text-warn-text">No account yet</span>}
                    <ExpiryBadge a={a} />
                    {recentlyRequested(a) && (
                      <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-semibold text-warn-text">Refresh requested</span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-[12.5px] text-text-muted">{a.propertyAddress}</div>
                  <div className="num mt-1 text-[12.5px] text-text-soft">
                    {fmt(a.price)} <span className="text-text-dim">· approved up to {fmt(a.approvedPrice)}</span>
                    {a.editedByAgentAt && <span className="text-text-dim"> · agent edited {new Date(a.editedByAgentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </div>
                </div>
                <button onClick={() => remove(a)} className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-text-dim transition-colors hover:text-danger">
                  Remove
                </button>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[13px] font-medium text-text-label">
                    <span>Loan stage</span>
                    <select
                      value={a.status}
                      onChange={(e) => patch(a.id, { status: e.target.value as LoanStatus })}
                      className="h-9 rounded-[9px] border border-border-input bg-input px-2.5 text-[13px] text-text-primary outline-none focus:border-brand-blue"
                      aria-label={`Loan stage for ${a.borrowerName || 'borrower'}`}
                    >
                      {LOAN_STATUSES.map((st) => (
                        <option key={st.value} value={st.value}>{st.label}</option>
                      ))}
                    </select>
                  </label>
                  <span className="text-[12px] text-text-dim">Your agent sees the stage, never the numbers.</span>
                </div>
                <div className="mt-3 max-w-[560px]">
                  <StatusTracker status={a.status} updatedAt={a.statusUpdatedAt} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
                <label className="flex items-center gap-2.5">
                  <Switch checked={a.allowPriceChange} onChange={(v) => patch(a.id, { allowPriceChange: v })} />
                  <span className="text-[13px] font-medium text-text-label">Allow price change</span>
                </label>
                <label className="flex items-center gap-2 text-[13px] text-text-label">
                  <span>Approved up to</span>
                  <span className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-text-dim">$</span>
                    <input
                      type="number"
                      defaultValue={a.approvedPrice || 0}
                      onBlur={(e) => {
                        const v = Math.max(0, parseFloat(e.target.value) || 0);
                        if (v !== a.approvedPrice) patch(a.id, { approvedPrice: v });
                      }}
                      className="h-9 w-[130px] rounded-[9px] border border-border-input bg-input pl-6 pr-2 text-[13px] text-text-primary outline-none focus:border-brand-blue"
                    />
                  </span>
                </label>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
