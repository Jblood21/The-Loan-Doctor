import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-[9px]',
  md: 'h-10 px-4 text-[13.5px] rounded-[10px]',
  lg: 'h-[46px] px-5 text-[14px] rounded-[11px]',
};

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand font-semibold hover:bg-brand-hover active:bg-brand-pressed border-none',
  secondary: 'bg-surface text-brand font-semibold border border-brand hover:bg-surface-tint',
  ghost: 'bg-transparent text-ink-muted font-medium hover:bg-[var(--surface-tint)] border-none',
  danger: 'bg-surface text-danger font-semibold border border-danger hover:bg-danger-tint',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
