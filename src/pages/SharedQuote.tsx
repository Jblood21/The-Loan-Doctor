import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type SharedQuote as SharedQuoteData } from '@/lib/api';
import { Logo } from '@/components/Logo';

export default function SharedQuote() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<SharedQuoteData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getShare(id)
      .then(({ share }) => !cancelled && setQuote(share))
      .catch(() => !cancelled && setError('This quote link is no longer available.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-app text-text-muted">Loading your quote…</div>;
  }
  if (error || !quote) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-app px-6 text-center">
        <Logo size={40} wordmark={22} glow />
        <p className="text-[15px] text-text-muted">{error || 'Quote not found.'}</p>
      </div>
    );
  }

  const cols = quote.names.length;
  const contact = [quote.lender?.name, quote.lender?.phone, quote.lender?.email, quote.lender?.nmls ? `NMLS# ${quote.lender.nmls}` : '']
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="min-h-screen bg-app px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-[880px]">
        {/* Brand header */}
        <div className="mb-6 flex items-center justify-between">
          <Logo size={34} wordmark={20} />
          <span className="text-[12.5px] text-text-dim">Prepared {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-letter">
          <div className="border-b border-border px-6 py-5">
            <h1 className="m-0 font-display text-[24px] font-semibold tracking-[-0.5px] text-text-heading">{quote.title || 'Loan Comparison'}</h1>
            {quote.borrowerName && <p className="mt-1 text-[14px] text-text-muted">Prepared for {quote.borrowerName}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-elevated px-5 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.5px] text-text-dim">Scenario</th>
                  {quote.names.map((n, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-right text-[13px] font-semibold ${i === quote.bestIndex ? 'bg-[rgba(45,212,191,0.1)] text-brand-teal' : 'text-text-primary'}`}
                    >
                      {n}
                      {i === quote.bestIndex && <span className="ml-1.5 rounded-full bg-[rgba(45,212,191,0.16)] px-1.5 py-0.5 text-[10px] font-bold">Lowest</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.metrics.map((m, ri) => (
                  <tr key={ri} className={ri % 2 ? '' : 'bg-[rgba(140,165,195,0.03)]'}>
                    <td className="sticky left-0 z-[1] bg-card px-5 py-2.5 text-text-soft">{m.label}</td>
                    {m.values.slice(0, cols).map((v, ci) => (
                      <td
                        key={ci}
                        className={`num px-4 py-2.5 text-right ${ci === quote.bestIndex ? 'font-semibold text-brand-teal' : 'text-text-softer'}`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border px-6 py-4 text-center">
            {contact && <div className="text-[12.5px] font-semibold text-text-soft">{contact}</div>}
            <p className="mx-auto mt-1.5 max-w-[560px] text-[11px] leading-[1.5] text-text-dim">
              Estimates only — not a commitment to lend. Rates, payments, and costs are subject to change and final underwriting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
