import { useSyncExternalStore } from 'react';
import { currentHoliday, getHolidayPreference, seasonalHoliday, subscribeHoliday } from './holidayTheme';
import type { HolidayId } from './holidays';

/** The holiday theme showing right now, or null for the normal look. */
export function useHoliday(): HolidayId | null {
  return useSyncExternalStore(subscribeHoliday, () => currentHoliday(), () => null);
}

/** For the sidebar switch: which holiday is in season, and whether the visitor has it on. */
export function useHolidaySwitch(): { season: HolidayId | null; enabled: boolean } {
  const season = useSyncExternalStore(subscribeHoliday, () => seasonalHoliday(), () => null);
  const pref = useSyncExternalStore(subscribeHoliday, getHolidayPreference, () => 'auto');
  return { season, enabled: pref !== 'off' };
}
