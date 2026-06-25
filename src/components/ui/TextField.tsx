import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'md' | 'lg';
}

/** Standard text input matching the design's 46px (md) / 48px (lg) fields. */
export function TextField({ size = 'md', className = '', ...props }: TextFieldProps) {
  const dims = size === 'lg' ? 'h-12 rounded-[11px] text-[15px]' : 'h-[46px] rounded-[10px] text-[15px]';
  return (
    <input
      className={`w-full border border-border-input bg-input px-[14px] text-text-primary outline-none transition-shadow placeholder:text-text-dim focus:border-brand-blue focus:shadow-focus ${dims} ${className}`}
      {...props}
    />
  );
}

export function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`label ${className}`}>{children}</label>;
}
