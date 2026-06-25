import type { ReactNode } from 'react';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 'md' = label pills, 'sm' = compact 38px squares (e.g. borrower count) */
  size?: 'md' | 'sm';
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex rounded-[11px] border border-border-seg bg-input p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const base =
          size === 'sm'
            ? 'w-[38px] py-2 text-[13.5px] rounded-[7px]'
            : 'px-[18px] py-[9px] text-[13.5px] rounded-lg';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer border-none font-semibold transition-all ${base} ${
              active ? 'bg-brand-gradient text-app' : 'bg-transparent text-text-soft'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
