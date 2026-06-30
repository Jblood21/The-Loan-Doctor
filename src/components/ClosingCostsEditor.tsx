import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { closingCostAmount, totalClosingCosts } from '@/lib/finance';
import { TITLE_BASES, applyTitleSchedule, isTitleBasis } from '@/lib/titleFees';
import { fmt, toNum } from '@/lib/format';
import type { ClosingCostItem, FeeBasis, TransactionType } from '@/types';

const FEE_BASES: { value: FeeBasis; label: string }[] = [
  { value: 'flat', label: 'Flat $' },
  { value: 'loan', label: '% of Loan' },
  { value: 'price', label: '% of Price' },
  ...(Object.entries(TITLE_BASES) as [FeeBasis, { short: string }][]).map(([value, t]) => ({ value, label: t.short })),
];

export function newFeeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now()}${Math.round(Math.random() * 1e6)}`;
}

/** Clone a fee list with fresh ids (so copies don't share ids across scenarios). */
export function cloneFees(items: ClosingCostItem[]): ClosingCostItem[] {
  return items.map((f) => ({ ...f, id: newFeeId() }));
}

interface Props {
  items: ClosingCostItem[];
  onChange: (items: ClosingCostItem[]) => void;
  /** When provided, a computed $ amount + total column is shown. */
  loan?: number;
  price?: number;
  showAmounts?: boolean;
  /** "Reset to standard / my defaults" handler. */
  onReset?: () => void;
  resetLabel?: string;
  emptyHint?: string;
  /** Show the one-click "apply title rate schedule" control. */
  enableTitleSchedule?: boolean;
  /** Transaction type so the schedule picks owner's+lender's (purchase) vs refi loan policy. */
  transaction?: TransactionType;
}

export function ClosingCostsEditor({
  items,
  onChange,
  loan,
  price,
  showAmounts,
  onReset,
  resetLabel = 'Reset to standard',
  emptyHint,
  enableTitleSchedule,
  transaction = 'purchase',
}: Props) {
  const withAmounts = showAmounts ?? loan !== undefined;
  const ln = loan || 0;
  const pr = price || 0;

  const update = (id: string, patch: Partial<ClosingCostItem>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const add = () => onChange([...items, { id: newFeeId(), label: 'Custom Fee', basis: 'flat', value: 0 }]);
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const applySchedule = (mode: 'full' | 'premiums') => onChange(applyTitleSchedule(items, { transaction, mode, newId: newFeeId }));

  const cols = withAmounts ? 'grid-cols-[1fr_104px_96px_84px_24px]' : 'grid-cols-[1fr_104px_104px_24px]';

  const titleControl = enableTitleSchedule && (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[9px] border border-dashed border-border-input bg-input/60 px-3 py-2">
      <span className="text-[12px] font-semibold text-text-soft">Title rate schedule:</span>
      <Button variant="secondary" size="sm" onClick={() => applySchedule('full')}>
        Apply full quote
      </Button>
      <Button variant="ghost" size="sm" onClick={() => applySchedule('premiums')}>
        Premiums only
      </Button>
      <span className="text-[11.5px] text-text-dim">
        {transaction === 'refinance' ? 'Refi loan policy, by loan amount' : "Owner's + lender's, auto-priced from price/loan"}
      </span>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="mt-3 rounded-[10px] border border-dashed border-border-input bg-input px-4 py-4 text-center">
        {emptyHint && <div className="mb-2.5 text-[13px] text-text-muted">{emptyHint}</div>}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onReset && (
            <Button variant="secondary" size="sm" onClick={onReset}>
              Add standard fees
            </Button>
          )}
          {enableTitleSchedule && (
            <Button variant="secondary" size="sm" onClick={() => applySchedule('full')}>
              Build from title schedule
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`mt-3 hidden ${cols} gap-2 px-1 text-[11px] font-bold tracking-[0.4px] text-text-dim sm:grid`}>
        <span>FEE</span>
        <span>BASIS</span>
        <span>AMOUNT</span>
        {withAmounts && <span className="text-right">TOTAL</span>}
        <span />
      </div>
      <div className="mt-1.5 flex flex-col gap-2">
        {items.map((it) => {
          const auto = isTitleBasis(it.basis);
          return (
            <div key={it.id} className={`grid ${cols} items-center gap-2`}>
              <TextField value={it.label} onChange={(e) => update(it.id, { label: e.target.value })} className="!h-[38px] !rounded-[8px] !text-[13px]" aria-label="Fee name" />
              <Select value={it.basis} onChange={(e) => update(it.id, { basis: e.target.value as FeeBasis })} options={FEE_BASES} className="!h-[38px] !rounded-[8px] !px-2.5 !text-[12.5px]" />
              {auto ? (
                <div className="flex h-[38px] items-center justify-center rounded-[8px] border border-border-input bg-input/50 text-[12px] font-medium text-text-dim" title="Amount comes from the title rate schedule">
                  {withAmounts ? fmt(closingCostAmount(it, ln, pr)) : 'Auto'}
                </div>
              ) : (
                <NumberField
                  size="sm"
                  prefix={it.basis === 'flat' ? '$' : undefined}
                  suffix={it.basis === 'flat' ? undefined : '%'}
                  value={it.value}
                  onChange={(v) => update(it.id, { value: toNum(v) })}
                  className="!h-[38px] !rounded-[8px]"
                  ariaLabel={`${it.label} amount`}
                />
              )}
              {withAmounts && <span className="num text-right text-[13px] text-text-softer">{fmt(closingCostAmount(it, ln, pr))}</span>}
              <button onClick={() => remove(it.id)} title="Remove fee" className="flex h-6 w-6 items-center justify-center rounded text-[16px] leading-none text-text-dim transition-colors hover:text-danger">
                ×
              </button>
            </div>
          );
        })}
      </div>
      {titleControl}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={add}>
            + Add fee
          </Button>
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
          )}
        </div>
        {withAmounts && (
          <div className="text-[12.5px] text-text-muted">
            Total <span className="num font-semibold text-text-softer">{fmt(totalClosingCosts(items, ln, pr))}</span>
          </div>
        )}
      </div>
    </>
  );
}
