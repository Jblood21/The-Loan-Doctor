import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string | number; label: string }[];
}

export function Select({ options, className = '', ...props }: SelectProps) {
  return (
    <select
      className={`h-[46px] w-full cursor-pointer rounded-[10px] border border-border-input bg-input px-[14px] text-[15px] text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus ${className}`}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
