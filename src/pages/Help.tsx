import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I add another scenario?',
    a: 'Click the + button next to the scenario tabs on the Compare Loans screen. You can compare up to six scenarios at once.',
  },
  {
    q: 'Can I switch a loan to a refinance?',
    a: 'Yes — use the Purchase / Refinance toggle at the top of the loan form. The relevant fields update automatically (for example, "Purchase Price" becomes "Home Value").',
  },
  {
    q: 'How is mortgage insurance calculated?',
    a: 'LoanDr. estimates PMI/MIP from loan type, LTV, and credit score using standard national rate cards: conventional PMI, FHA upfront + annual MIP, VA funding fee, and USDA guarantee fees. Exact lender factors can be wired into your backend.',
  },
  {
    q: 'Where do I set my branding?',
    a: 'Open Settings from the sidebar to add loan-officer, lender, and dual-branding (real-estate agent) details. These appear on generated pre-approval letters.',
  },
  {
    q: 'Can I generate a pre-approval letter?',
    a: 'Yes — open Pre-Approval, pull a borrower from your LOS or an existing scenario, fill in the borrower details, and download a branded PDF letter.',
  },
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(-1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS.map((f, i) => ({ ...f, i }));
    return FAQS.map((f, i) => ({ ...f, i })).filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="max-w-[760px] animate-lp-fade">
      <PageHeader title="Help Center" subtitle="Guides, FAQs, and support for LoanDr." />

      <TextField
        size="lg"
        className="mb-[26px] !bg-card"
        placeholder="Search help articles…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="flex flex-col gap-2.5">
        {filtered.map((f) => (
          <div key={f.i} className="overflow-hidden rounded-xl border border-border bg-card">
            <button
              onClick={() => setOpen((o) => (o === f.i ? -1 : f.i))}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-[18px] py-4 text-left text-[14.5px] font-semibold text-text-primary"
            >
              {f.q}
              <span className="flex-shrink-0 text-[18px] text-brand-teal">{open === f.i ? '–' : '+'}</span>
            </button>
            {open === f.i && (
              <div className="px-[18px] pb-[18px] text-[13.5px] leading-[1.6] text-text-soft">{f.a}</div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-[18px] py-6 text-[13.5px] text-text-muted">
            No articles match “{query}”.
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-5 rounded-[14px] border border-[rgba(45,212,191,0.2)] bg-result-card p-[22px]">
        <div>
          <div className="text-[16px] font-semibold text-text-heading">Still need help?</div>
          <div className="mt-1 text-[13.5px] text-text-muted">
            Reach our support team — we usually reply within a business day.
          </div>
        </div>
        <Button
          variant="primary"
          className="!h-11 whitespace-nowrap !px-[22px]"
          onClick={() => {
            window.location.href = 'mailto:support@loandr.app?subject=LoanDr%20Support';
          }}
        >
          Contact Support
        </Button>
      </div>
    </div>
  );
}
