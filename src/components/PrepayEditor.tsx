import { NumberField } from '@/components/ui/NumberField';
import { PillGroup } from '@/components/ui/Pill';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { PrepayResult } from '@/lib/finance';
import { fmt } from '@/lib/format';
import { DSCR } from '@/lib/loanProgramRules';
import type { PrepayPlan } from '@/types';

type Mode = PrepayPlan['mode'];

const MODES: { value: Mode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'percent', label: '% by year' },
  { value: 'interest', label: 'Months of interest' },
];

const BASES: { value: 'balance' | 'original'; label: string }[] = [
  { value: 'balance', label: 'Remaining balance' },
  { value: 'original', label: 'Original loan' },
];

const PRESETS = DSCR.prepay.presets;
const trim = (n: number) => String(Math.round(n * 100) / 100);
const clamp = (raw: string, lo: number, hi: number) => {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
};

const labelCls = 'mb-1 block text-[11.5px] font-semibold text-text-dim';

interface PrepayEditorProps {
  plan: PrepayPlan | undefined;
  onChange: (plan: PrepayPlan) => void;
  /** The penalty worked out year by year (null when there isn't one yet). */
  result: PrepayResult | null;
}

/**
 * Prepayment-penalty editor for DSCR loans. Penalties are lender-specific, so nothing is
 * assumed: type the number of years and the percentage for each year (quick-fill presets
 * are just a shortcut), or switch to "months of interest" with an optional penalty-free
 * amount. The table underneath shows the dollars year by year on the loan's real balance.
 */
export function PrepayEditor({ plan, onChange, result }: PrepayEditorProps) {
  const mode: Mode = plan?.mode ?? 'none';
  const steps = plan?.stepPct?.length ? plan.stepPct : PRESETS[0].steps;
  const basis = plan?.basis ?? 'balance';
  const { maxYears, maxPct, maxMonths, defaults } = DSCR.prepay;

  const set = (patch: Partial<PrepayPlan>) => onChange({ ...(plan ?? { mode: 'none' }), ...patch });

  // Switching structures keeps whatever was already typed for the others.
  const pickMode = (m: Mode) => {
    if (m === 'percent') set({ mode: 'percent', stepPct: [...steps], basis });
    else if (m === 'interest') {
      set({
        mode: 'interest',
        interestMonths: plan?.interestMonths ?? defaults.interestMonths,
        interestYears: plan?.interestYears ?? defaults.interestYears,
        freePct: plan?.freePct ?? defaults.freePct,
      });
    } else set({ mode: 'none' });
  };

  // Changing the length trims the list, or adds years that start at the previous year's value.
  const setYears = (raw: string) => {
    if (raw === '') return; // mid-edit
    const n = Math.round(clamp(raw, 1, maxYears));
    const next = steps.slice(0, n);
    while (next.length < n) next.push(next.length ? next[next.length - 1] : 1);
    set({ stepPct: next });
  };

  const setStep = (i: number, raw: string) => {
    const next = [...steps];
    next[i] = raw === '' ? 0 : clamp(raw, 0, maxPct);
    set({ stepPct: next });
  };

  const activePreset = PRESETS.find((p) => p.steps.length === steps.length && p.steps.every((v, i) => v === steps[i]))?.id ?? '';

  return (
    <div>
      <label className="mb-[7px] block text-[12.5px] font-semibold text-text-soft">Prepayment Penalty</label>
      <SegmentedControl<Mode> size="sm" options={MODES} value={mode} onChange={pickMode} />

      {mode === 'percent' && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <span className={labelCls}>Quick fill</span>
            <PillGroup
              variant="blue"
              options={PRESETS.map((p) => ({ value: p.id, label: p.id }))}
              value={activePreset}
              onChange={(id) => {
                const preset = PRESETS.find((p) => p.id === id);
                if (preset) set({ stepPct: [...preset.steps] });
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[116px]">
              <span className={labelCls}>Penalty period</span>
              <NumberField size="sm" suffix="yrs" value={steps.length} onChange={setYears} ariaLabel="Penalty period in years" />
            </div>
            <div>
              <span className={labelCls}>Charged on</span>
              <SegmentedControl size="sm" options={BASES} value={basis} onChange={(v) => set({ basis: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {steps.map((pct, i) => (
              <div key={i}>
                <span className={labelCls}>Year {i + 1}</span>
                <NumberField size="sm" suffix="%" value={pct} onChange={(v) => setStep(i, v)} ariaLabel={`Year ${i + 1} penalty percent`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'interest' && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div>
              <span className={labelCls}>Months of interest</span>
              <NumberField
                size="sm"
                suffix="mo"
                value={plan?.interestMonths ?? defaults.interestMonths}
                onChange={(v) => set({ interestMonths: v === '' ? 0 : clamp(v, 0, maxMonths) })}
                ariaLabel="Months of interest"
              />
            </div>
            <div>
              <span className={labelCls}>Applies for</span>
              <NumberField
                size="sm"
                suffix="yrs"
                value={plan?.interestYears ?? defaults.interestYears}
                onChange={(v) => set({ interestYears: v === '' ? 0 : Math.round(clamp(v, 0, maxYears)) })}
                ariaLabel="Years the penalty applies"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className={labelCls}>Penalty-free</span>
              <NumberField
                size="sm"
                suffix="%"
                value={plan?.freePct ?? defaults.freePct}
                onChange={(v) => set({ freePct: v === '' ? 0 : clamp(v, 0, 100) })}
                ariaLabel="Penalty-free percent of the original loan"
              />
            </div>
          </div>
          <div className="mt-1.5 text-[11.5px] leading-[1.5] text-text-dim">
            Penalty-free is the part of the original loan that can be paid off without a penalty (often 20%). The penalty is
            the months of interest on the balance above it.
          </div>
        </div>
      )}

      {mode !== 'none' &&
        (result ? (
          <div className="mt-3 overflow-hidden rounded-[10px] border border-[rgba(140,165,195,0.2)]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 bg-[rgba(140,165,195,0.08)] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.4px] text-text-dim">
              <span>If paid off in</span>
              <span className="text-right">{mode === 'percent' ? 'Rate' : '% of balance'}</span>
              <span className="min-w-[88px] text-right">Most it could be</span>
            </div>
            {result.rows.map((row) => (
              <div
                key={row.year}
                className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-t border-[rgba(140,165,195,0.12)] px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-text-soft">Year {row.year}</span>
                <span className="num text-right text-text-muted">{mode === 'percent' ? `${trim(row.pct)}%` : `${row.pct.toFixed(2)}%`}</span>
                <span className="num min-w-[88px] text-right font-medium text-text-primary">{fmt(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] text-text-dim">
            {mode === 'percent' ? 'Enter at least one percentage above 0.' : 'Enter the months of interest and how many years it applies.'}
          </div>
        ))}
      {mode !== 'none' && result && (
        <div className="mt-1.5 text-[11px] leading-[1.5] text-text-dim">
          Worked out on the loan balance at the start of each year, which is the most it can be if the loan is paid off during
          that year.
        </div>
      )}
    </div>
  );
}
