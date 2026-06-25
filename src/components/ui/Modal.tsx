import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** max width in px */
  width?: number;
}

/** Centered modal with scrim — used by the Tools calculators. */
export function Modal({ open, onClose, title, subtitle, children, width = 640 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-[rgba(4,9,15,0.6)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full animate-lp-fade rounded-2xl border border-border bg-card shadow-letter"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="font-display text-[19px] font-semibold tracking-[-0.4px] text-text-heading">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] flex-shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-none bg-[rgba(140,165,195,0.08)] text-[20px] text-text-soft transition-colors hover:bg-[rgba(248,113,113,0.12)] hover:text-danger"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
