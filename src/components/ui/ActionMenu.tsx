import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Shown in red, for actions that throw work away. */
  danger?: boolean;
  /** Extra classes, e.g. 'sm:hidden' for an item that only belongs in the phone menu. */
  className?: string;
}

/** A small "More" button that opens a list of actions. Closes on outside click, Escape and
 *  after a choice; arrow keys move between items. */
export function ActionMenu({ label = 'More', items, className = '' }: { label?: string; items: ActionMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    // Land on the first enabled item so the keyboard works straight away.
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    e.preventDefault();
    const all = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(at + dir + all.length) % all.length]?.focus();
  };

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-brand bg-surface px-4 text-[13.5px] font-semibold text-brand transition-all hover:bg-surface-tint"
      >
        {label}
        <ChevronDown size={15} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') move(e, 1);
            else if (e.key === 'ArrowUp') move(e, -1);
          }}
          className="absolute right-0 z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-[12px] border border-border bg-card py-1 shadow-[0_12px_32px_rgba(20,30,45,0.18)]"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`flex min-h-[44px] w-full cursor-pointer items-center border-none bg-transparent px-4 text-left text-[14px] font-medium transition-colors hover:bg-[var(--surface-tint)] focus:bg-[var(--surface-tint)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
                it.danger ? 'text-danger' : 'text-text-primary'
              } ${it.className ?? ''}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
