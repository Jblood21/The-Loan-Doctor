import { Sparkles } from 'lucide-react';
import { HOLIDAYS } from '@/lib/holidays';
import { setHolidayPreference } from '@/lib/holidayTheme';
import { useHolidaySwitch } from '@/lib/useHoliday';

/**
 * A sidebar switch for the seasonal look. It only appears while a holiday is in season,
 * and the choice is remembered on this device.
 */
export function HolidayToggle() {
  const { season, enabled } = useHolidaySwitch();
  if (!season) return null;
  const { name, short } = HOLIDAYS[season];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${name} theme`}
      onClick={() => setHolidayPreference(enabled ? 'off' : 'auto')}
      className="flex items-center justify-between gap-3 rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[14px] font-medium text-text-soft transition-colors hover:bg-[var(--surface-tint)]"
    >
      <span className="flex items-center gap-2.5 whitespace-nowrap">
        <Sparkles size={18} />
        {short} theme
      </span>
      <span
        aria-hidden
        className={`relative h-[18px] w-[30px] flex-shrink-0 rounded-full transition-colors ${enabled ? 'bg-brand' : 'bg-[var(--border-control)]'}`}
      >
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${enabled ? 'left-[14px]' : 'left-[2px]'}`} />
      </span>
    </button>
  );
}
