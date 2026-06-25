import type { ReactNode } from 'react';

type Tone = 'teal' | 'blue' | 'warn' | 'neutral' | 'good';

const tones: Record<Tone, string> = {
  teal: 'bg-[rgba(45,212,191,0.1)] border-[rgba(45,212,191,0.22)] text-brand-teal',
  blue: 'bg-[rgba(47,128,237,0.12)] border-[rgba(47,128,237,0.25)] text-brand-blue-light',
  warn: 'bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.22)] text-warn',
  neutral: 'bg-[rgba(140,165,195,0.08)] border-transparent text-text-dim2',
  good: 'bg-[rgba(52,211,153,0.16)] border-transparent text-good',
};

export function Badge({ tone = 'teal', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[20px] border px-3 py-[5px] text-[12px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Amber "stubbed math / wire this up" note used across screens. */
export function StubNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.08)] px-[13px] py-[11px] text-[11.5px] leading-[1.5] text-warn-text">
      {children}
    </div>
  );
}
