import type { ReactNode } from 'react';
import { NumberField } from '@/components/ui/NumberField';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/TextField';

export interface CalcProps {
  open: boolean;
  onClose: () => void;
}

/** Labelled numeric input row used across calculators. */
export function CalcField({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: number | string;
  onChange: (raw: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <NumberField value={value} onChange={onChange} prefix={prefix} suffix={suffix} ariaLabel={label} />
    </div>
  );
}

export function CalcSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} />
    </div>
  );
}

/** Result panel — gradient card holding the headline outcome + breakdown rows. */
export function ResultPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-[rgba(45,212,191,0.22)] bg-result-card p-5">{children}</div>;
}

export function Headline({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[12.5px] font-semibold text-[#8fb8c9]">{label}</div>
      <div className="num my-1 text-[34px] font-semibold tracking-[-1px] text-text-heading">{value}</div>
      {sub && <div className="text-[13px] text-text-muted">{sub}</div>}
    </div>
  );
}

export function Row({ label, value, color = 'text-text-softer' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[rgba(140,165,195,0.08)] py-2 last:border-0">
      <span className="text-[13.5px] text-text-soft">{label}</span>
      <span className={`num text-[14px] font-medium ${color}`}>{value}</span>
    </div>
  );
}

export const TERM_OPTIONS = [
  { value: 30, label: '30 Years' },
  { value: 20, label: '20 Years' },
  { value: 15, label: '15 Years' },
  { value: 10, label: '10 Years' },
];
