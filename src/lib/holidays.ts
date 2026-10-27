// Which holiday theme (if any) is showing today.
//
// A theme turns on when its holiday is a week away and stays on through the day
// after the holiday, then the normal look comes back. Dates are the visitor's own
// calendar day (their device clock and time zone), so the change happens at their
// local midnight.

export type HolidayId = 'halloween' | 'christmas' | 'easter' | 'july4';

export const HOLIDAYS: Record<HolidayId, { name: string; short: string }> = {
  halloween: { name: 'Halloween', short: 'Halloween' },
  christmas: { name: 'Christmas', short: 'Christmas' },
  easter: { name: 'Easter', short: 'Easter' },
  july4: { name: 'Fourth of July', short: 'July 4th' },
};

export const HOLIDAY_IDS = Object.keys(HOLIDAYS) as HolidayId[];

/** How long a theme runs around its holiday, in whole days. */
export const WINDOW = { daysBefore: 7, daysAfter: 1 } as const;

/** Western (Gregorian) Easter Sunday for a year — the Meeus/Jones/Butcher method. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Month (1-12) and day of a holiday in a given year. */
export function holidayOn(id: HolidayId, year: number): { month: number; day: number } {
  switch (id) {
    case 'halloween':
      return { month: 10, day: 31 };
    case 'christmas':
      return { month: 12, day: 25 };
    case 'july4':
      return { month: 7, day: 4 };
    case 'easter':
      return easterSunday(year);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to the holiday (negative once it has passed). */
function daysUntil(from: Date, month: number, day: number): number {
  // Compare calendar days in UTC so a daylight-saving change can't shift the count.
  const today = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const target = Date.UTC(from.getFullYear(), month - 1, day);
  return Math.round((target - today) / DAY_MS);
}

/** The holiday whose theme should be showing on this day, or null for the normal look. */
export function activeHoliday(now: Date = new Date()): HolidayId | null {
  for (const id of HOLIDAY_IDS) {
    const { month, day } = holidayOn(id, now.getFullYear());
    const left = daysUntil(now, month, day);
    if (left <= WINDOW.daysBefore && left >= -WINDOW.daysAfter) return id;
  }
  return null;
}

/** Is this a holiday id we know (used to validate the ?holiday= preview link)? */
export function isHolidayId(value: unknown): value is HolidayId {
  return typeof value === 'string' && (HOLIDAY_IDS as string[]).includes(value);
}
