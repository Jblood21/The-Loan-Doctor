import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { agentApi, getAgentToken, setAgentToken } from '@/lib/agentApi';
import { ApiError } from '@/lib/api';
import { fmt } from '@/lib/format';
import { monthlyPayment } from '@/lib/finance';
import { affordability } from '@/lib/affordability';
import { ReportProvider } from '@/context/ReportContext';
import { ToolsWorkspace } from '@/components/ToolsWorkspace';
import { Modal } from '@/components/ui/Modal';
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
  return <AgentDashboard agent={agent} onSignOut={signOut} onAgentUpdate={setAgent} />;
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

type AgentTab = 'preapprovals' | 'tools' | 'marketing';

/** The signed-in agent shell: switches between Pre-Approvals, Tools, and Marketing. */
function AgentDashboard({ agent, onSignOut, onAgentUpdate }: { agent: AgentUser; onSignOut: () => void; onAgentUpdate: (a: AgentUser) => void }) {
  const [tab, setTab] = useState<AgentTab>('preapprovals');
  const [profileOpen, setProfileOpen] = useState(false);
  const navBtn = (key: AgentTab, label: string) => (
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
            {navBtn('marketing', 'Marketing')}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setProfileOpen(true)}
            className="hidden rounded-[9px] px-2.5 py-1.5 text-[13px] font-medium text-text-soft transition-colors hover:text-text-primary sm:inline"
          >
            {agent.name || agent.email}
          </button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      <div className={`mx-auto px-5 py-8 ${tab === 'preapprovals' ? 'max-w-[760px]' : 'max-w-[1080px]'}`}>
        {tab === 'preapprovals' && <PreApprovalsView agent={agent} />}
        {tab === 'tools' && <ToolsView />}
        {tab === 'marketing' && <MarketingView />}
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} agent={agent} onSaved={onAgentUpdate} />
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
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
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

  const share = async () => {
    setSharing(true);
    setMsg(null);
    try {
      if (dirty && addressValid) await save();
      const { token } = await agentApi.shareAssignment(assignment.id);
      const url = `${window.location.origin}/s/${token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        /* clipboard blocked — the link is shown for manual copy */
      }
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not create a share link.' });
    } finally {
      setSharing(false);
    }
  };

  const emailShare = () => {
    const subject = encodeURIComponent(`Pre-approval letter${assignment.borrowerName ? ' — ' + assignment.borrowerName : ''}`);
    const body = encodeURIComponent(`Here is the pre-approval letter:\n\n${shareUrl}\n`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const lo = assignment.loanOfficer;

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
        <Button variant="secondary" size="sm" onClick={share} disabled={sharing}>
          {sharing ? 'Creating…' : 'Share'}
        </Button>
        {assignment.editedByAgentAt && (
          <span className="text-[11.5px] text-text-dim">Last edited {new Date(assignment.editedByAgentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        )}
      </div>

      {shareUrl && (
        <div className="mt-3 rounded-[10px] border border-border-input bg-input/60 p-3">
          <div className="text-[12px] text-text-muted">Shareable link — send this to your buyer or the listing agent (no login needed):</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border-input bg-input px-2.5 py-1.5 text-[12.5px] text-text-soft">{shareUrl}</code>
            <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" onClick={emailShare}>Email</Button>
          </div>
        </div>
      )}

      {lo && (lo.name || lo.email || lo.phone) && (
        <div className="mt-4 rounded-[10px] border border-border bg-[rgba(140,165,195,0.04)] p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim">Your loan officer</div>
          <div className="mt-1 text-[13.5px] font-semibold text-text-soft">{lo.name}{lo.company ? <span className="font-normal text-text-muted"> · {lo.company}</span> : null}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {lo.phone && <a href={`tel:${lo.phone.replace(/[^0-9+]/g, '')}`} className="text-brand-blue-light hover:underline">{lo.phone}</a>}
            {lo.email && <a href={`mailto:${lo.email}`} className="text-brand-blue-light hover:underline">{lo.email}</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Compact labelled input for the marketing forms. */
function MiniField({ label, value, onChange, prefix, suffix, type = 'number', placeholder }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-text-dim">{prefix}</span>}
        <TextField type={type} inputMode={type === 'number' ? 'decimal' : undefined} className={prefix ? '!pl-7' : suffix ? '!pr-8' : ''} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-dim">{suffix}</span>}
      </div>
    </div>
  );
}

/** Edit the agent's co-branding profile (name, phone, brokerage, license, photo). */
function ProfileModal({ open, onClose, agent, onSaved }: { open: boolean; onClose: () => void; agent: AgentUser; onSaved: (a: AgentUser) => void }) {
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone);
  const [brokerage, setBrokerage] = useState(agent.brokerage || '');
  const [license, setLicense] = useState(agent.license || '');
  const [photo, setPhoto] = useState(agent.photo || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (open) {
      setName(agent.name);
      setPhone(agent.phone);
      setBrokerage(agent.brokerage || '');
      setLicense(agent.license || '');
      setPhoto(agent.photo || '');
      setMsg('');
    }
  }, [open, agent]);

  const onPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg('Please choose an image file.');
    if (file.size > 1.4 * 1024 * 1024) return setMsg('Image must be under ~1.4 MB.');
    const rd = new FileReader();
    rd.onload = () => setPhoto(String(rd.result || ''));
    rd.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const { agent: a } = await agentApi.updateProfile({ name: name.trim(), phone: phone.trim(), brokerage: brokerage.trim(), license: license.trim(), photo });
      onSaved(a);
      onClose();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Your profile" subtitle="Co-brands your reports, flyers, and shared links." width={520}>
      <div className="mb-4 flex items-center gap-4">
        <div className="h-[64px] w-[64px] flex-shrink-0 overflow-hidden rounded-full border border-border-input bg-input">
          {photo ? <img src={photo} alt="Headshot" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[11px] text-text-dim">No photo</div>}
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-[9px] border border-border-input bg-input px-3 py-2 text-[13px] font-medium text-text-soft hover:border-brand-teal">
            Upload headshot
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {photo && <Button variant="ghost" size="sm" onClick={() => setPhoto('')}>Remove</Button>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Name</Label><TextField value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Phone</Label><TextField value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" /></div>
        <div><Label>License #</Label><TextField value={license} onChange={(e) => setLicense(e.target.value)} placeholder="DRE / license #" /></div>
        <div className="sm:col-span-2"><Label>Brokerage</Label><TextField value={brokerage} onChange={(e) => setBrokerage(e.target.value)} placeholder="ABC Realty" /></div>
      </div>
      {msg && <div className="mt-3 text-[12.5px] text-danger">{msg}</div>}
      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
      </div>
    </Modal>
  );
}

/** Marketing tab — buyer-facing materials the agent can hand out. */
function MarketingView() {
  return (
    <>
      <div className="mb-5">
        <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px] text-text-heading">Marketing</h1>
        <p className="mt-1 text-[13.5px] text-text-muted">Create buyer-facing materials, co-branded with your profile.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <OpenHouseFlyer />
        <BuyerAffordability />
      </div>
    </>
  );
}

/** Open-house payment flyer — the agent enters a listing and gets a branded one-pager
 *  of monthly-payment scenarios at several down-payment levels. */
function OpenHouseFlyer() {
  const [address, setAddress] = useState('');
  const [priceStr, setPriceStr] = useState('500000');
  const [rateStr, setRateStr] = useState('6.5');
  const [term, setTerm] = useState('30');
  const [taxStr, setTaxStr] = useState('1.25');
  const [insStr, setInsStr] = useState('0.35');
  const [downStr, setDownStr] = useState('3.5, 5, 10, 20');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const n = (v: string) => parseFloat(v) || 0;

  const download = async () => {
    const price = n(priceStr);
    if (price <= 0) return setErr('Enter a listing price.');
    setBusy(true);
    setErr('');
    try {
      const rate = n(rateStr);
      const termN = parseInt(term, 10) || 30;
      const escRate = (n(taxStr) + n(insStr)) / 100 / 12;
      const downs = downStr.split(',').map((s) => parseFloat(s.trim())).filter((x) => Number.isFinite(x) && x >= 0 && x < 100);
      const scenarios = (downs.length ? downs : [3.5, 5, 10, 20]).map((dp) => {
        const downAmt = (price * dp) / 100;
        const loan = Math.max(0, price - downAmt);
        const pi = monthlyPayment(loan, rate, termN);
        const ti = price * escRate;
        return { down: `${dp}%  (${fmt(downAmt)})`, loan: fmt(loan), pi: fmt(pi), taxesIns: fmt(ti), total: fmt(pi + ti) };
      });
      const blob = await agentApi.flyerPdf({
        listing: { address: address.trim(), price: fmt(price) },
        terms: `${rate}% · ${termN}-yr fixed`,
        scenarios,
      });
      downloadBlob(blob, 'payment-flyer.pdf');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not generate the flyer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-[15px] font-semibold text-text-heading">Open-house payment flyer</div>
      <p className="mt-1 text-[12.5px] text-text-muted">A printable one-pager of monthly payments at several down-payment levels — great for an open house.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Listing address (optional)</Label><TextField value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST" /></div>
        <MiniField label="List price" prefix="$" value={priceStr} onChange={setPriceStr} />
        <MiniField label="Interest rate" suffix="%" value={rateStr} onChange={setRateStr} />
        <MiniField label="Term (years)" value={term} onChange={setTerm} />
        <MiniField label="Property tax /yr" suffix="%" value={taxStr} onChange={setTaxStr} />
        <MiniField label="Insurance /yr" suffix="%" value={insStr} onChange={setInsStr} />
        <div><Label>Down payments</Label><TextField value={downStr} onChange={(e) => setDownStr(e.target.value)} placeholder="3.5, 5, 10, 20" /></div>
      </div>
      {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}
      <div className="mt-4">
        <Button variant="primary" size="sm" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download flyer (PDF)'}</Button>
      </div>
    </div>
  );
}

/** Buyer affordability — the agent computes a buyer's range and publishes a clean,
 *  buyer-facing page at a public link. */
function BuyerAffordability() {
  const [buyerName, setBuyerName] = useState('');
  const [income, setIncome] = useState('120000');
  const [debts, setDebts] = useState('600');
  const [down, setDown] = useState('40000');
  const [rate, setRate] = useState('6.5');
  const [term, setTerm] = useState('30');
  const [dti, setDti] = useState('43');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const n = (v: string) => parseFloat(v) || 0;
  const res = affordability({ income: n(income), debts: n(debts), down: n(down), rate: n(rate), term, dti: n(dti), taxRate: 1.25, insRate: 0.35, hoa: 0 });

  const createLink = async () => {
    setBusy(true);
    setErr('');
    setLink('');
    try {
      const rows = [
        { label: 'Estimated max home price', value: fmt(res.maxPrice) },
        { label: 'Estimated loan amount', value: fmt(res.maxLoan) },
        { label: 'Estimated principal & interest', value: `${fmt(res.pi)}/mo` },
        { label: 'Estimated taxes + insurance', value: `${fmt(res.escrow)}/mo` },
        { label: 'Estimated total payment', value: `${fmt(res.totalPayment)}/mo` },
        { label: 'Down payment', value: fmt(n(down)) },
        { label: 'Assumed rate / term', value: `${n(rate)}% · ${parseInt(term, 10) || 30} yr` },
      ];
      const { token } = await agentApi.shareAfford({ buyerName: buyerName.trim(), maxPrice: fmt(res.maxPrice), headline: 'Estimated home-buying power', rows });
      const url = `${window.location.origin}/s/${token}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        /* clipboard blocked */
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  };

  const emailLink = () => {
    const subject = encodeURIComponent('Your estimated home-buying power');
    const body = encodeURIComponent(`Here's an estimate of what you can afford:\n\n${link}\n`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-[15px] font-semibold text-text-heading">Buyer "what you can afford"</div>
      <p className="mt-1 text-[12.5px] text-text-muted">Estimate a buyer's range and share a clean, buyer-facing page (no login) they can open on their phone.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Buyer name (optional)</Label><TextField value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="The Johnsons" /></div>
        <MiniField label="Annual income" prefix="$" value={income} onChange={setIncome} />
        <MiniField label="Monthly debts" prefix="$" value={debts} onChange={setDebts} />
        <MiniField label="Down payment" prefix="$" value={down} onChange={setDown} />
        <MiniField label="Interest rate" suffix="%" value={rate} onChange={setRate} />
        <MiniField label="Term (years)" value={term} onChange={setTerm} />
        <MiniField label="Max DTI" suffix="%" value={dti} onChange={setDti} />
      </div>
      <div className="mt-3 rounded-[10px] border border-[rgba(45,212,191,0.22)] bg-result-card px-4 py-3">
        <div className="text-[11.5px] font-semibold text-[#8fb8c9]">Estimated max home price</div>
        <div className="num text-[26px] font-semibold text-text-heading">{fmt(res.maxPrice)}</div>
        <div className="text-[12px] text-text-muted">≈ {fmt(res.totalPayment)}/mo total payment</div>
      </div>
      {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}
      <div className="mt-4">
        <Button variant="primary" size="sm" onClick={createLink} disabled={busy}>{busy ? 'Creating…' : 'Create shareable link'}</Button>
      </div>
      {link && (
        <div className="mt-3 rounded-[10px] border border-border-input bg-input/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border-input bg-input px-2.5 py-1.5 text-[12.5px] text-text-soft">{link}</code>
            <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>{copied ? 'Copied!' : 'Copy'}</Button>
            <Button variant="ghost" size="sm" onClick={emailLink}>Email</Button>
          </div>
        </div>
      )}
    </div>
  );
}
