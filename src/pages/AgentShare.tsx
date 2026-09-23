import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { getPublicShare, publicSharePdfUrl } from '@/lib/agentApi';
import type { ShareView } from '@/types';

/** Public, buyer-facing page for an agent's shared link (no login) — a pre-approval
 *  letter or an affordability estimate, co-branded with the agent. */
export default function AgentShare() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<ShareView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getPublicShare(token)
      .then((s) => !cancelled && setShare(s))
      .catch(() => !cancelled && setError('This link is no longer available.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-app text-text-muted">Loading…</div>;
  if (error || !share) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-app px-6 text-center">
        <Logo size={38} wordmark={22} glow />
        <p className="text-[15px] text-text-muted">{error || 'Not found.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-[640px]">
        <div className="mb-6 flex items-center justify-between">
          <Logo size={30} wordmark={18} />
          <span className="text-[12px] text-text-dim">
            {share.createdAt ? new Date(share.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
          </span>
        </div>
        {share.kind === 'letter' ? <LetterShare token={token || ''} share={share} /> : <AffordShare share={share} />}
      </div>
    </div>
  );
}

/** The agent's co-branding header (photo + name + brokerage + contact). */
function AgentHeader({ agent }: { agent: ShareView['agent'] }) {
  if (!agent || !(agent.name || agent.email || agent.phone)) return null;
  const contact = [agent.phone, agent.email].filter(Boolean).join('  ·  ');
  const sub = [agent.brokerage, agent.license ? `License #${agent.license}` : ''].filter(Boolean).join('  ·  ');
  return (
    <div className="flex items-center gap-3 border-t border-border px-6 py-4">
      {agent.photo ? (
        <img src={agent.photo} alt={agent.name} className="h-[46px] w-[46px] flex-shrink-0 rounded-full border border-border object-cover" />
      ) : null}
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-text-soft">{agent.name}</div>
        {sub && <div className="text-[12px] text-text-dim">{sub}</div>}
        {contact && <div className="text-[12px] text-text-muted">{contact}</div>}
      </div>
    </div>
  );
}

function LetterShare({ token, share }: { token: string; share: ShareView }) {
  const lo = share.loanOfficer;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-letter">
      <div className="border-b border-border px-6 py-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-brand-teal">Pre-Approval Letter</div>
        <h1 className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.5px] text-text-heading">{share.borrowerName || 'Borrower'}</h1>
        {share.propertyAddress && <p className="mt-1 text-[13.5px] text-text-muted">{share.propertyAddress}</p>}
      </div>
      <div className="px-6 py-5">
        <a
          href={publicSharePdfUrl(token)}
          target="_blank"
          rel="noopener"
          className="inline-flex h-[46px] items-center justify-center rounded-xl bg-brand-gradient px-6 text-[15px] font-semibold text-app transition-opacity hover:opacity-90"
        >
          Download the letter (PDF)
        </a>
        <p className="mt-3 text-[12px] leading-[1.5] text-text-dim">This pre-approval letter was shared by your real-estate agent. Questions about the financing? Contact the loan officer below.</p>
      </div>
      {lo && (lo.name || lo.email || lo.phone) && (
        <div className="border-t border-border bg-[rgba(140,165,195,0.04)] px-6 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim">Loan Officer</div>
          <div className="mt-1 text-[13.5px] font-semibold text-text-soft">
            {lo.name}
            {lo.company ? <span className="font-normal text-text-muted"> · {lo.company}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {lo.phone && <a href={`tel:${lo.phone.replace(/[^0-9+]/g, '')}`} className="text-brand-blue-light hover:underline">{lo.phone}</a>}
            {lo.email && <a href={`mailto:${lo.email}`} className="text-brand-blue-light hover:underline">{lo.email}</a>}
          </div>
        </div>
      )}
      <AgentHeader agent={share.agent} />
    </div>
  );
}

function AffordShare({ share }: { share: ShareView }) {
  const d = share.data || {};
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-letter">
      <div className="border-b border-border px-6 py-6 text-center">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-brand-teal">{d.headline || 'Estimated home-buying power'}</div>
        {d.buyerName && <div className="mt-1 text-[13.5px] text-text-muted">Prepared for {d.buyerName}</div>}
        <div className="num mt-3 text-[40px] font-semibold leading-none tracking-[-1.5px] text-text-heading">{d.maxPrice}</div>
        <div className="mt-1.5 text-[12.5px] text-text-dim">estimated maximum home price</div>
      </div>
      {Array.isArray(d.rows) && d.rows.length > 0 && (
        <div className="px-6 py-4">
          {d.rows.map((r, i) => (
            <div key={i} className="flex justify-between border-b border-border py-2.5 text-[13.5px] last:border-0">
              <span className="text-text-muted">{r.label}</span>
              <span className="num font-semibold text-text-softer">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="px-6 pb-4 text-[11px] leading-[1.5] text-text-dim">
        Estimates only — not a loan pre-approval, commitment, or offer to lend. Actual amounts depend on full underwriting, credit, program, and property. Contact the agent or a licensed loan officer to get pre-approved.
      </div>
      <AgentHeader agent={share.agent} />
    </div>
  );
}
