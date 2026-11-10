import { PIPELINE, STATUS_LABEL } from '@/lib/loanStatus';
import type { LoanStatus } from '@/types';

/** A row of stages showing how far along a loan is. Cancelled loans show a single red tag. */
export function StatusTracker({ status, updatedAt }: { status: LoanStatus; updatedAt?: string | null }) {
  if (status === 'cancelled') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="rounded-full bg-danger-tint px-2.5 py-1 font-semibold text-danger">Cancelled</span>
        {updatedAt && <span className="text-text-dim">{new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
      </div>
    );
  }
  const at = Math.max(0, PIPELINE.indexOf(status));
  return (
    <div aria-label={`Loan stage: ${STATUS_LABEL[status]}`}>
      <ol className="m-0 flex list-none items-start p-0">
        {PIPELINE.map((s, i) => {
          const done = i < at;
          const current = i === at;
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
              <div className="flex w-full items-center">
                <span className={`h-[2px] flex-1 ${i === 0 ? 'bg-transparent' : i <= at ? 'bg-brand' : 'bg-border-input'}`} />
                <span
                  className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    done || current ? 'border-brand bg-brand text-on-brand' : 'border-border-input bg-card text-transparent'
                  } ${current ? 'ring-4 ring-[var(--surface-tint-strong)]' : ''}`}
                >
                  {done ? '✓' : ''}
                </span>
                <span className={`h-[2px] flex-1 ${i === PIPELINE.length - 1 ? 'bg-transparent' : i < at ? 'bg-brand' : 'bg-border-input'}`} />
              </div>
              <span className={`mt-1.5 px-0.5 text-[11px] leading-[1.25] ${current ? 'font-semibold text-text-heading' : 'text-text-dim'}`}>{STATUS_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>
      {updatedAt && <div className="mt-1.5 text-center text-[11px] text-text-dim">Updated {new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
    </div>
  );
}
