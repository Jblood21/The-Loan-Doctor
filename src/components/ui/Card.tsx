import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** result hero gradient card vs. standard panel */
  variant?: 'panel' | 'result';
}

export function Card({ variant = 'panel', className = '', ...props }: CardProps) {
  const base =
    variant === 'result'
      ? 'bg-result-card border border-[rgba(45,212,191,0.22)]'
      : 'bg-card border border-border';
  return <div className={`rounded-2xl ${base} ${className}`} {...props} />;
}

/** Uppercase section label used inside cards. */
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`section-label ${className}`}>{children}</div>;
}

/** Thin divider matching the design's hairline rules. */
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-border ${className}`} />;
}
