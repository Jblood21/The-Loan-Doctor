import type { ReactNode } from 'react';

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** teal = loan type (md), blue = program (sm) */
  variant?: 'teal' | 'blue';
}

export function Pill({ active, onClick, children, variant = 'teal' }: PillProps) {
  if (variant === 'blue') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`cursor-pointer rounded-lg border px-[13px] py-[7px] text-[12.5px] font-semibold transition-all ${
          active
            ? 'border-transparent bg-[rgba(47,128,237,0.14)] text-brand-blue-light'
            : 'border-border-seg bg-transparent text-[#7d96ae] hover:border-brand-blue'
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-[9px] border px-[15px] py-2 text-[13px] font-semibold transition-all ${
        active
          ? 'border-transparent bg-[rgba(45,212,191,0.14)] text-brand-teal'
          : 'border-border-input bg-input text-text-muted hover:border-brand-teal'
      }`}
    >
      {children}
    </button>
  );
}

/** A row of pills bound to a value. */
export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  variant = 'teal',
  className = '',
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'teal' | 'blue';
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-[7px] ${className}`}>
      {options.map((o) => (
        <Pill key={o.value} active={o.value === value} onClick={() => onChange(o.value)} variant={variant}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}
