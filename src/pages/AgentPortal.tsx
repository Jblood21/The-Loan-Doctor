import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { agentApi, getAgentToken, setAgentToken } from '@/lib/agentApi';
import { ApiError } from '@/lib/api';
import { fmt } from '@/lib/format';
import { ReportProvider } from '@/context/ReportContext';
import { ToolsWorkspace } from '@/components/ToolsWorkspace';
import type { AgentUser, Assignment } from '@/types';

/**
 * Real-estate agent portal — a standalone, public page (outside the loan-officer app
 * shell). Agents sign up / log in here and edit the pre-approvals assigned to them.
 */
export default function AgentPortal() {
  const [agent, setAgent] = useState<AgentUser | null>(null);
  const [booting, setBooting] = useState(true);

  // Restore an existing agent session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAgentToken()) {
        setBooting(false);
        return;
      }
      try {
        const { agent: a } = await agentApi.me();
        if (!cancelled) setAgent(a);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setAgentToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = () => {
    setAgentToken(null);
    setAgent(null);
  };

  if (booting) {
    return <div className="flex min-h-screen items-center justify-center bg-app text-text-muted">Loading…</div>;
  }
  if (!agent) return <AgentAuth onAuthed={setAgent} />;
  return <AgentDashboard agent={agent} onSignOut={signOut} />;
}

/** Login / sign-up card for agents. */
function AgentAuth({ onAuthed }: { onAuthed: (a: AgentUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const cleanEmail = email.trim();
      const res =
        mode === 'login'
          ? await agentApi.login({ email: cleanEmail, password })
          : await agentApi.register({ email: cleanEmail, password, name: name.trim(), phone: phone.trim() });
      setAgentToken(res.token, true);
      onAuthed(res.agent);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Can’t reach the server right now — please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-5 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-[400px] animate-lp-fade">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo size={38} wordmark={22} glow />
          <div>
            <h1 className="m-0 font-display text-[24px] font-semibold tracking-[-0.5px]">Real-Estate Agent Portal</h1>
            <p className="mt-1.5 text-[14px] text-text-muted">
              {mode === 'login' ? 'Sign in to your assigned pre-approvals.' : 'Create your agent account to get started.'}
            </p>
          </div>
        </div>

        {mode === 'register' && (
          <>
            <Label>Your Name</Label>
            <TextField size="lg" className="mb-4" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
            <Label>Phone</Label>
            <TextField size="lg" className="mb-4" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <Label>Email</Label>
        <TextField
          size="lg"
          type="email"
          autoComplete="username"
          className="mb-4"
          placeholder="you@brokerage.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Label>Password</Label>
        <TextField
          size="lg"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="mb-5"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <div className="mb-4 rounded-[11px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-[15px] py-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={submitting} className="!h-[50px] w-full !rounded-xl !text-[15.5px]">
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>

        <div className="mt-5 text-center text-[13.5px] text-text-muted">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => { setMode('register'); setError(''); }} className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light">
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light">
                Sign in
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/** The signed-in agent shell: a Pre-Approvals / Tools switcher over the two views. */
function AgentDashboard({ agent, onSignOut }: { agent: AgentUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<'preapprovals' | 'tools'>('preapprovals');
  const navBtn = (key: 'preapprovals' | 'tools', label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        tab === key ? 'bg-[rgba(47,128,237,0.14)] text-brand-blue-nav' : 'text-text-soft hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-sidebar/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Logo size={28} wordmark={17} />
          <nav className="flex items-center gap-1">
            {navBtn('preapprovals', 'Pre-Approvals')}
            {navBtn('tools', 'Tools')}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-text-muted sm:inline">{agent.name || agent.email}</span>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      <div className={`mx-auto px-5 py-8 ${tab === 'tools' ? 'max-w-[1080px]' : 'max-w-[760px]'}`}>
        {tab === 'preapprovals' ? <PreApprovalsView agent={agent} /> : <ToolsView />}
      </div>
    </div>
  );
}

/** The agent's list of assigned pre-approvals. */
function PreApprovalsView({ agent }: { agent: AgentUser }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    agentApi
      .listAssignments()
      .then(({ assignments: a }) => setAssignments(a))
      .catch(() => setError('Could not load your pre-approvals. Try Refresh in a moment.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px] text-text-heading">Your Pre-Approvals</h1>
          <p className="mt-1 text-[13.5px] text-text-muted">Update the property address (and price, when your loan officer allows it), then download the letter.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
      </div>

      {error && <div className="mb-4 rounded-[11px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-[15px] py-3 text-[13px] text-danger">{error}</div>}

      {!loading && !assignments.length && !error && (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-[14px] text-text-muted">
          No pre-approvals have been assigned to <span className="font-semibold text-text-soft">{agent.email}</span> yet.
          <div className="mt-1 text-[12.5px]">When your loan officer assigns one, it will appear here.</div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {assignments.map((a) => (
          <AssignmentCard key={a.id} assignment={a} onSaved={(next) => setAssignments((list) => list.map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </div>
    </>
  );
}

/** The agent's Tools workspace — the same calculators loan officers have (minus the
 *  auth-gated county-income tool), with a report they can download branded with their
 *  own contact info. */
function ToolsView() {
  return (
    <ReportProvider>
      <div className="mb-5">
        <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px] text-text-heading">Tools</h1>
        <p className="mt-1 text-[13.5px] text-text-muted">Quick calculators for your clients. Add results to a report and download a branded PDF.</p>
      </div>
      <ToolsWorkspace
        exclude={['countyincome']}
        downloadReport={({ preparedFor, sections }) => agentApi.reportPdf({ preparedFor, sections })}
      />
    </ReportProvider>
  );
}

function AssignmentCard({ assignment, onSaved }: { assignment: Assignment; onSaved: (a: Assignment) => void }) {
  const [address, setAddress] = useState(assignment.propertyAddress);
  const [price, setPrice] = useState(String(assignment.price || ''));
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const cap = assignment.approvedPrice || 0;
  const priceNum = Math.min(Math.max(0, parseFloat(price) || 0), cap);
  const dirty = address.trim() !== assignment.propertyAddress || (assignment.allowPriceChange && priceNum !== assignment.price);
  const addressValid = address.trim().length > 0;

  const save = async () => {
    if (!addressValid) {
      setMsg({ tone: 'error', text: 'A property address is required.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const patch: { propertyAddress: string; price?: number } = { propertyAddress: address.trim() };
      if (assignment.allowPriceChange) patch.price = priceNum;
      const { assignment: next } = await agentApi.updateAssignment(assignment.id, patch);
      onSaved(next);
      setAddress(next.propertyAddress);
      setPrice(String(next.price || ''));
      setMsg({ tone: 'ok', text: 'Saved.' });
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setMsg(null);
    try {
      // Save any pending edits first so the letter reflects them.
      if (dirty && addressValid) await save();
      const blob = await agentApi.assignmentPdf(assignment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `preapproval-${(assignment.borrowerName || 'letter').split(' ').pop()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not generate the letter. Try again.' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[15px] font-semibold text-text-heading">{assignment.borrowerName || 'Borrower'}</div>
        <div className="text-[12px] text-text-dim">From {assignment.ownerName || 'your loan officer'}</div>
      </div>

      <Label>Property address</Label>
      <TextField className="mb-4" placeholder="123 Main St, City, ST 00000" value={address} onChange={(e) => setAddress(e.target.value)} />

      <Label>Purchase price</Label>
      {assignment.allowPriceChange ? (
        <>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-text-dim">$</span>
            <TextField
              type="number"
              inputMode="numeric"
              className="!pl-7"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              max={cap}
              min={0}
            />
          </div>
          <div className="mt-1.5 text-[12px] text-text-muted">
            Approved up to <span className="font-semibold text-text-soft">{fmt(cap)}</span>
            {parseFloat(price) > cap && <span className="text-warn-text"> — capped at the approved amount</span>}
          </div>
        </>
      ) : (
        <div className="flex h-[46px] items-center rounded-[10px] border border-border-input bg-input px-3.5 text-[15px] text-text-soft">
          {fmt(assignment.price)} <span className="ml-2 text-[12px] text-text-dim">(fixed by your loan officer)</span>
        </div>
      )}

      {msg && (
        <div className={`mt-3 text-[12.5px] ${msg.tone === 'error' ? 'text-danger' : 'text-good'}`}>{msg.text}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="primary" size="sm" onClick={download} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download letter (PDF)'}
        </Button>
        {assignment.editedByAgentAt && (
          <span className="text-[11.5px] text-text-dim">Last edited {new Date(assignment.editedByAgentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        )}
      </div>
    </div>
  );
}
