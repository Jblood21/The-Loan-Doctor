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
  primary:
    'bg-brand-gradient text-app font-bold hover:brightness-105 active:translate-y-px border-none',
  secondary:
    'bg-elevated text-text-softer font-semibold border border-border-input hover:border-brand-blue',
  ghost: 'bg-transparent text-text-soft font-medium hover:bg-[rgba(140,165,195,0.07)] border-none',
  danger:
    'bg-[rgba(248,113,113,0.12)] text-danger font-semibold border border-[rgba(248,113,113,0.3)] hover:bg-[rgba(248,113,113,0.2)]',
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
