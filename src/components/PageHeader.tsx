import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

/** Consistent page title block used across screens. */
export function PageHeader({ title, subtitle, badge, actions }: PageHeaderProps) {
  return (
    <div className="mb-[26px] flex items-end justify-between gap-4">
      <div>
        {badge && <div className="mb-[14px]">{badge}</div>}
        <h1 className="m-0 font-display text-[27px] font-semibold tracking-[-0.6px] text-text-heading">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 gap-[9px]">{actions}</div>}
    </div>
  );
}
