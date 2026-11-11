import { useEffect, useState } from 'react';

export interface LetterStep {
  id: string;
  label: string;
}

/** A long form with a "you are here" line. Each step is an anchor on the page; the bar stays at
 *  the top while you scroll, marks the steps you have passed, and jumps to any step you tap. */
export function LetterSteps({ steps }: { steps: LetterStep[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // The app scrolls inside <main>, not the window.
    const scroller: HTMLElement | Window = document.querySelector('main') ?? window;
    let frame = 0;
    const compute = () => {
      frame = 0;
      const el = scroller instanceof Window ? document.documentElement : scroller;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      let at = 0;
      steps.forEach((s, i) => {
        const node = document.getElementById(s.id);
        if (node && node.getBoundingClientRect().top <= 200) at = i;
      });
      setCurrent(atEnd && el.scrollTop > 0 ? steps.length - 1 : at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    compute();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [steps]);

  const go = (id: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <nav
      aria-label="Letter steps"
      className="sticky top-[70px] z-20 mb-4 rounded-xl border border-border bg-card/95 px-2 py-1.5 backdrop-blur lg:top-3"
    >
      <ol className="m-0 flex list-none items-center gap-1 p-0">
        {steps.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li key={s.id} className={`flex min-w-0 items-center ${here ? 'flex-[3] sm:flex-1' : 'flex-1'}`}>
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={here ? 'step' : undefined}
                aria-label={`Step ${i + 1} of ${steps.length}: ${s.label}${done ? ' (passed)' : ''}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-transparent px-1.5 py-1 text-[13px] transition-colors hover:bg-[var(--surface-tint)] sm:justify-start"
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-[11.5px] font-bold ${
                    done || here ? 'border-brand bg-brand text-on-brand' : 'border-border-input bg-card text-text-muted'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={`truncate ${here ? 'font-semibold text-text-heading' : 'hidden text-text-muted sm:inline'}`}>{s.label}</span>
              </button>
              {i < steps.length - 1 && <span aria-hidden className={`h-[2px] w-3 flex-shrink-0 sm:w-6 ${done ? 'bg-brand' : 'bg-border-input'}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
