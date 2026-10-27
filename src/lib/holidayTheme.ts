// Applies the seasonal look. The page gets data-holiday="halloween" (etc.) on <html>,
// which the holiday stylesheet reads, and a decoration layer draws the extras.
//
// Three things can change what shows:
//   - the calendar (see holidays.ts),
//   - the visitor's own switch (stored on this device): a small button in the sidebar
//     turns the seasonal look off, and
//   - a preview link: add ?holiday=halloween (or christmas, easter, july4) to any
//     address to see that look today, or ?holiday=off to hide it. The preview lasts
//     for the browser tab.

import { activeHoliday, isHolidayId } from './holidays';
import type { HolidayId } from './holidays';

const PREF_KEY = 'lbc-holiday';
const PREVIEW_KEY = 'lbc-holiday-preview';
const CHANGE_EVENT = 'lbc-holiday-change';

export type HolidayPreference = 'auto' | 'off';

export function getHolidayPreference(): HolidayPreference {
  try {
    return localStorage.getItem(PREF_KEY) === 'off' ? 'off' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setHolidayPreference(pref: HolidayPreference): void {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* storage blocked — the choice just won't be remembered */
  }
  notifyHolidayChange();
}

/** Read ?holiday= from the address once and remember it for this tab. */
export function readPreviewFromUrl(): void {
  try {
    const value = new URLSearchParams(window.location.search).get('holiday');
    if (value === 'off' || isHolidayId(value)) sessionStorage.setItem(PREVIEW_KEY, value);
  } catch {
    /* ignore */
  }
}

function preview(): HolidayId | 'off' | null {
  try {
    const v = sessionStorage.getItem(PREVIEW_KEY);
    if (v === 'off' || isHolidayId(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** True while a ?holiday= preview is in force, so the UI can say so. */
export function isPreviewing(): boolean {
  return preview() !== null;
}

/** Pages a borrower or buyer opens from a link. They stay in the normal, professional look. */
export function isBorrowerFacingPath(pathname: string): boolean {
  return /^\/(q|s)\//.test(pathname);
}

/** The holiday that is in season (or being previewed), whether or not the visitor has
 *  switched the seasonal look off. The sidebar switch only appears while this is set. */
export function seasonalHoliday(now: Date = new Date()): HolidayId | null {
  const p = preview();
  if (p === 'off') return null;
  return p ?? activeHoliday(now);
}

/** The holiday to show right now (null = the normal look). */
export function currentHoliday(now: Date = new Date()): HolidayId | null {
  // A preview shows even if the visitor switched the theme off.
  if (preview() === null && getHolidayPreference() === 'off') return null;
  return seasonalHoliday(now);
}

/** Put the holiday on <html> (or take it off). */
export function applyHoliday(id: HolidayId | null): void {
  const root = document.documentElement;
  if (id) root.setAttribute('data-holiday', id);
  else root.removeAttribute('data-holiday');
}

/** Tell every part of the page that the holiday (or the switch) changed. */
export function notifyHolidayChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Call `onChange` when the switch is flipped, the tab regains focus, or local midnight
 *  passes (so a tab left open overnight changes on time). Returns an unsubscribe. */
export function subscribeHoliday(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  document.addEventListener('visibilitychange', onChange);

  let timer = 0;
  const armMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    timer = window.setTimeout(() => {
      onChange();
      armMidnight();
    }, nextMidnight.getTime() - now.getTime());
  };
  armMidnight();

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    document.removeEventListener('visibilitychange', onChange);
    window.clearTimeout(timer);
  };
}
