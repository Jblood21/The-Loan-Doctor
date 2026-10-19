import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, X } from 'lucide-react';
import type { CalcProps } from './_shared';
import { resolvedTheme } from '@/lib/theme';

/**
 * Appraisal Prep — a self-contained guide that helps buyers, sellers and
 * refinancers get ready for the new (UAD 3.6) appraisal report. It's a large
 * standalone experience, so rather than cram it into the small calculator modal
 * it opens as a full-screen panel hosting the tool (public/tools/appraisal-prep.html),
 * reskinned to the Base Camp palette. We pass the host app's resolved theme through
 * so the tool tracks light/dark with the rest of the app.
 */
export default function AppraisalPrep({ open, onClose }: CalcProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolvedTheme());

  useEffect(() => {
    if (!open) return;
    setTheme(resolvedTheme());

    // Keep the embedded tool in sync if the user toggles the app theme while it's open.
    const obs = new MutationObserver(() => setTheme(resolvedTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => setTheme(resolvedTheme());
    mq.addEventListener('change', onMq);

    // Lock background scroll and allow Esc to close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      obs.disconnect();
      mq.removeEventListener('change', onMq);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-app animate-lp-fade">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-sidebar/95 px-4 py-2.5 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: 'rgba(47,100,156,0.14)' }}
          >
            <ClipboardCheck size={17} className="text-brand-blue-light" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold text-text-primary">Appraisal Prep</div>
            <div className="truncate text-[12px] text-text-muted">Get ready for the new appraisal report</div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-[34px] w-[34px] flex-shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-none bg-[rgba(140,165,195,0.08)] text-text-soft transition-colors hover:bg-[rgba(248,113,113,0.12)] hover:text-danger"
        >
          <X size={18} />
        </button>
      </header>
      <iframe
        key={theme}
        title="Appraisal Prep — get ready for the new appraisal report"
        src={`/tools/appraisal-prep.html?theme=${theme}`}
        className="h-full w-full flex-1 border-0 bg-app"
      />
    </div>,
    document.body,
  );
}
