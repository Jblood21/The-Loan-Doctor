import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { permanentBuydown, temporaryBuydown, TEMP_BUYDOWN_STRUCTURES } from '@/lib/finance';
import { fmt, fmt2, pct } from '@/lib/format';
import { CalcField, CalcSelect, TERM_OPTIONS, type CalcProps } from './_shared';
import { useReport } from '@/context/ReportContext';

const STRUCTURE_OPTIONS = Object.entries(TEMP_BUYDOWN_STRUCTURES).map(([value, s]) => ({
  value,
  label: `${s.label}  (${s.reductions.length} yr${s.reductions.length > 1 ? 's' : ''})`,
}));

export default function Buydown({ open, onClose }: CalcProps) {
  const [loan, setLoan] = useState(320000);
  const [noteRate, setNoteRate] = useState(6.5);
  const [term, setTerm] = useState('30');
  const [holdYears, setHoldYears] = useState(7);
  const [boughtRate, setBoughtRate] = useState(6.0);
  const [points, setPoints] = useState(2);
  const [structure, setStructure] = useState('2-1');
  const [whoPays, setWhoPays] = useState('seller');

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);
  const years = parseInt(term, 10) || 30;
  const reductions = TEMP_BUYDOWN_STRUCTURES[structure].reductions;

  const temp = temporaryBuydown(loan, noteRate, years, reductions);
  const perm = permanentBuydown(loan, noteRate, boughtRate, years, points, holdYears);
  const breakEvenYears = perm.breakEvenMonths / 12;

  // ---- recommendation ----
  const rec = (() => {
    const seller = whoPays === 'seller';
    const struct = TEMP_BUYDOWN_STRUCTURES[structure].label;
    if (perm.monthlySavings <= 0) {
      return {
        pick: 'Temporary',
        tone: 'teal' as const,
        reason: `The “rate after points” isn’t below the note rate, so a permanent buydown saves nothing here. A ${struct} temporary buydown still lowers the first ${reductions.length}-year payment by up to ${fmt(temp.firstYearSavings)}/mo.`,
      };
    }
    if (Number.isFinite(breakEvenYears) && holdYears >= breakEvenYears) {
      return seller
        ? {
            pick: 'Permanent (points)',
            tone: 'good' as const,
            reason: `With a seller/lender credit funding the points, a permanent buydown locks the lower rate in for the whole loan and saves about ${fmt(perm.lifetimeInterestSaved)} in interest. The borrower plans to keep it ~${holdYears} yrs — past the ~${breakEvenYears.toFixed(1)}-yr break-even — so permanent wins. (Use the credit on a temporary buydown instead only if they expect to refinance within ${reductions.length}–3 years.)`,
          }
        : {
            pick: 'Permanent (points)',
            tone: 'good' as const,
            reason: `Paying ${fmt(perm.cost)} in points pays for itself in about ${breakEvenYears.toFixed(1)} yrs, and the borrower plans to keep the loan ~${holdYears} yrs — netting roughly ${fmt(perm.netOverHold)} and ${fmt(perm.lifetimeInterestSaved)} less interest over the loan.`,
          };
    }
    return seller
      ? {
          pick: 'Temporary',
          tone: 'teal' as const,
          reason: `The borrower plans to keep the loan only ~${holdYears} yrs — less than the ~${breakEvenYears.toFixed(1)} yrs it takes points to pay off. A seller-funded ${struct} temporary buydown gives the biggest early relief (about ${fmt(temp.subsidyCost)} over ${reductions.length} yr${reductions.length > 1 ? 's' : ''}) and isn’t wasted if they sell or refinance.`,
        }
      : {
          pick: 'No buydown — or seller-funded temporary',
          tone: 'warn' as const,
          reason: `If the borrower self-funds, neither pays off: they plan to keep the loan only ~${holdYears} yrs, under the ~${breakEvenYears.toFixed(1)}-yr break-even, and self-funding a temporary buydown just pre-pays their own early payments. Consider no buydown, or ask the seller/lender to fund a ${struct} temporary buydown.`,
        };
  })();

  const recTone = {
    good: 'border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.08)] text-good',
    teal: 'border-[rgba(45,212,191,0.3)] bg-[rgba(45,212,191,0.08)] text-brand-teal',
    warn: 'border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] text-warn',
  }[rec.tone];

  const cols = [
    { key: 'none', label: 'No Buydown' },
    { key: 'temp', label: `Temporary ${TEMP_BUYDOWN_STRUCTURES[structure].label}` },
    { key: 'perm', label: 'Permanent' },
  ];
  const dash = '—';
  const rows: { label: string; none: string; temp: string; perm: string }[] = [
    { label: 'Year-1 rate', none: pct(noteRate), temp: pct(temp.schedule[0].rate), perm: pct(boughtRate) },
    { label: 'Year-1 P&I', none: fmt2(temp.noteMonthly), temp: fmt2(temp.firstYearMonthly), perm: fmt2(perm.buydownMonthly) },
    { label: 'Payment after buydown', none: fmt2(temp.noteMonthly), temp: fmt2(temp.noteMonthly), perm: fmt2(perm.buydownMonthly) },
    { label: 'Upfront cost', none: fmt(0), temp: fmt(temp.subsidyCost), perm: fmt(perm.cost) },
    { label: 'Year-1 savings / mo', none: dash, temp: fmt(temp.firstYearSavings), perm: fmt(perm.monthlySavings) },
    { label: 'Break-even', none: dash, temp: 'front-loaded', perm: Number.isFinite(breakEvenYears) ? `${breakEvenYears.toFixed(1)} yrs` : dash },
    { label: 'Lifetime interest saved', none: fmt(0), temp: fmt(0), perm: fmt(perm.lifetimeInterestSaved) },
  ];

  const { has, add, remove, sync } = useReport();
  const inReport = has('buydown');
  const report = {
    key: 'buydown',
    title: 'Rate Buydown',
    subtitle: `Recommendation: ${rec.pick}`,
    headline: { label: 'Recommendation', value: rec.pick },
    inputs: [
      { label: 'Loan Amount', value: fmt(loan) },
      { label: 'Note Rate', value: pct(noteRate) },
      { label: 'Rate After Points', value: pct(boughtRate) },
      { label: 'Points', value: `${points} pts` },
      { label: 'Temporary Structure', value: TEMP_BUYDOWN_STRUCTURES[structure].label },
      { label: "Years You'll Keep the Loan", value: String(holdYears) },
    ],
    rows: [
      { label: 'Year-1 P&I (None / Temp / Perm)', value: `${rows[1].none} / ${rows[1].temp} / ${rows[1].perm}` },
      { label: 'Upfront cost (Temp / Perm)', value: `${rows[3].temp} / ${rows[3].perm}` },
      { label: 'Permanent break-even', value: Number.isFinite(breakEvenYears) ? `${breakEvenYears.toFixed(1)} yrs` : '—' },
      { label: 'Lifetime interest saved (Permanent)', value: fmt(perm.lifetimeInterestSaved) },
    ],
  };
  // Keep the stored snapshot current while this tool stays in the report.
  useEffect(() => {
    sync(report);
  });

  return (
    <Modal open={open} onClose={onClose} title="Rate Buydown" subtitle="Compare a permanent (points) vs. a temporary buydown — and see which is worth it." width={900}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[0.85fr_1.4fr]">
        {/* inputs */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 md:grid-cols-1">
          <CalcField label="Loan Amount" prefix="$" value={loan} onChange={set(setLoan)} />
          <CalcField label="Note Rate" suffix="%" value={noteRate} onChange={set(setNoteRate)} />
          <CalcSelect label="Loan Term" value={term} onChange={setTerm} options={TERM_OPTIONS} />
          <CalcField label="Years You'll Keep the Loan" value={holdYears} onChange={set(setHoldYears)} />
          <div className="col-span-2 my-1 h-px bg-border md:col-span-1" />
          <CalcField label="Permanent: Rate After Points" suffix="%" value={boughtRate} onChange={set(setBoughtRate)} />
          <CalcField label="Permanent: Points Cost" suffix="pts" value={points} onChange={set(setPoints)} />
          <CalcSelect label="Temporary: Structure" value={structure} onChange={setStructure} options={STRUCTURE_OPTIONS} />
          <CalcSelect
            label="Who Pays?"
            value={whoPays}
            onChange={setWhoPays}
            options={[
              { value: 'seller', label: 'Seller / Lender credit' },
              { value: 'buyer', label: 'Buyer (out of pocket)' },
            ]}
          />
        </div>

        {/* results */}
        <div className="flex flex-col gap-4">
          {/* comparison table */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] bg-elevated px-4 py-2.5 text-[11.5px] font-bold tracking-[0.4px] text-text-dim">
              <span></span>
              {cols.map((c) => (
                <span key={c.key} className="text-right">{c.label}</span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] border-b border-[rgba(140,165,195,0.06)] px-4 py-2 text-[13px] last:border-0">
                <span className="text-text-soft">{r.label}</span>
                <span className="num text-right text-text-muted">{r.none}</span>
                <span className="num text-right text-brand-teal">{r.temp}</span>
                <span className="num text-right text-brand-blue-light">{r.perm}</span>
              </div>
            ))}
          </div>

          {/* temporary year-by-year */}
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.5px] text-text-dim">
              Temporary {TEMP_BUYDOWN_STRUCTURES[structure].label} — payment by year
            </div>
            <div className="flex flex-wrap gap-2">
              {temp.schedule.map((y) => (
                <div key={y.year} className="rounded-lg border border-border-input bg-input px-3 py-2 text-[12.5px]">
                  <div className="text-text-muted">Year {y.year} · {pct(y.rate)}</div>
                  <div className="num font-semibold text-text-primary">{fmt2(y.monthly)}/mo</div>
                  <div className="num text-good">save {fmt(y.monthlySaved)}/mo</div>
                </div>
              ))}
              <div className="rounded-lg border border-border-input bg-input px-3 py-2 text-[12.5px]">
                <div className="text-text-muted">Year {temp.schedule.length + 1}+ · {pct(noteRate)}</div>
                <div className="num font-semibold text-text-primary">{fmt2(temp.noteMonthly)}/mo</div>
                <div className="text-text-dim">full payment</div>
              </div>
            </div>
          </div>

          {/* recommendation */}
          <div className={`rounded-xl border p-4 ${recTone}`}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="text-[12px] font-bold uppercase tracking-[0.5px] opacity-80">Recommendation</div>
              <button
                type="button"
                onClick={() => (inReport ? remove('buydown') : add(report))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                  inReport
                    ? 'border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.12)] text-good'
                    : 'border-border-seg bg-transparent text-text-soft hover:border-brand-teal hover:text-brand-teal'
                }`}
              >
                {inReport ? '✓ Added to report' : '+ Add to report'}
              </button>
            </div>
            <div className="text-[16px] font-bold">{rec.pick}</div>
            <div className="mt-1.5 text-[13px] leading-[1.55] text-text-soft">{rec.reason}</div>
          </div>

          <div className="text-[11.5px] leading-[1.5] text-text-dim">
            Guideline note: temporary-buydown funds are typically paid by the seller or lender within
            interested-party-contribution limits, and agencies cap the structure (up to 3-2-1). Permanent points must be
            bona fide discount points. Confirm program rules and IPC limits per loan.
          </div>
        </div>
      </div>
    </Modal>
  );
}
