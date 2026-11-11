import { useSettings } from '@/context/SettingsContext';
import { useUI } from '@/context/UIContext';
import { setupStatus } from '@/lib/setup';
import { Button } from '@/components/ui/Button';

/** First-run checklist: a letter or PDF carries the sender's name, NMLS number and company,
 *  so until those are filled in this stays at the top of every screen. Name is usually done
 *  already (it comes from sign-up), so the bar never starts at zero. */
export function SetupBanner() {
  const { settings, loaded } = useSettings();
  const { openSettings } = useUI();
  if (!loaded) return null;
  const s = setupStatus(settings);
  if (s.complete) return null;
  const required = s.items.filter((i) => i.required);

  return (
    <section aria-label="Finish setting up" className="mb-5 rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="m-0 text-[14.5px] font-semibold text-text-heading">Finish your letterhead to create letters</h2>
            <span className="text-[12.5px] font-semibold text-text-muted">
              {s.requiredDone} of {s.requiredTotal} done
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={s.requiredTotal}
            aria-valuenow={s.requiredDone}
            className="mt-2 h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-border-input"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(s.requiredDone / s.requiredTotal) * 100}%` }} />
          </div>
          <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px]">
            {required.map((i) => (
              <li key={i.key} className={i.done ? 'text-good' : 'text-text-muted'}>
                <span aria-hidden>{i.done ? '✓ ' : '○ '}</span>
                {i.label}
                {i.done && <span className="sr-only"> (done)</span>}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="secondary" onClick={openSettings}>
          Add my details
        </Button>
      </div>
    </section>
  );
}
