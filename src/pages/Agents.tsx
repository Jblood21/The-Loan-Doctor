import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import type { Assignment } from '@/types';

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

export default function Agents() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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

  const patch = async (id: string, body: Partial<Pick<Assignment, 'allowPriceChange' | 'approvedPrice'>>) => {
    const { assignment } = await api.updateAssignment(id, body);
    setAssignments((list) => list.map((x) => (x.id === id ? assignment : x)));
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
