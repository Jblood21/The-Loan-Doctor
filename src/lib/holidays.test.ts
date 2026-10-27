import { describe, expect, it } from 'vitest';
import { WINDOW, activeHoliday, easterSunday, holidayOn, HOLIDAY_IDS } from './holidays';
import type { HolidayId } from './holidays';

// Local-time dates, the way a visitor's device would report them.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('easterSunday', () => {
  // Published dates of Western Easter.
  const known: [number, number, number][] = [
    [2023, 4, 9],
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2028, 4, 16],
    [2029, 4, 1],
    [2030, 4, 21],
    [2031, 4, 13],
    [2032, 3, 28],
  ];
  it.each(known)('%i is %i/%i', (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day });
  });

  it('always lands on a Sunday between March 22 and April 25', () => {
    for (let y = 1990; y <= 2100; y++) {
      const { month, day } = easterSunday(y);
      expect(new Date(y, month - 1, day).getDay()).toBe(0);
      const t = new Date(y, month - 1, day).getTime();
      expect(t).toBeGreaterThanOrEqual(new Date(y, 2, 22).getTime());
      expect(t).toBeLessThanOrEqual(new Date(y, 3, 25).getTime());
    }
  });
});

describe('the window around each holiday', () => {
  const shift = (y: number, id: HolidayId, deltaDays: number, h = 12) => {
    const { month, day } = holidayOn(id, y);
    return new Date(y, month - 1, day + deltaDays, h);
  };

  for (const year of [2026, 2027, 2028, 2031]) {
    for (const id of HOLIDAY_IDS) {
      it(`${id} ${year}: on 7 days before through 1 day after, off outside`, () => {
        expect(activeHoliday(shift(year, id, -WINDOW.daysBefore - 1))).toBeNull();
        expect(activeHoliday(shift(year, id, -WINDOW.daysBefore))).toBe(id);
        expect(activeHoliday(shift(year, id, -1))).toBe(id);
        expect(activeHoliday(shift(year, id, 0))).toBe(id);
        expect(activeHoliday(shift(year, id, WINDOW.daysAfter))).toBe(id);
        expect(activeHoliday(shift(year, id, WINDOW.daysAfter + 1))).toBeNull();
      });
    }
  }

  it('matches the dates people will look for', () => {
    expect(activeHoliday(at(2026, 10, 23))).toBeNull();
    expect(activeHoliday(at(2026, 10, 24))).toBe('halloween');
    expect(activeHoliday(at(2026, 11, 1))).toBe('halloween');
    expect(activeHoliday(at(2026, 11, 2))).toBeNull();
    expect(activeHoliday(at(2026, 12, 18))).toBe('christmas');
    expect(activeHoliday(at(2026, 12, 26))).toBe('christmas');
    expect(activeHoliday(at(2026, 12, 27))).toBeNull();
    expect(activeHoliday(at(2026, 6, 27))).toBe('july4');
    expect(activeHoliday(at(2026, 7, 5))).toBe('july4');
    expect(activeHoliday(at(2026, 7, 6))).toBeNull();
    // Easter 2026 is April 5, so the theme runs March 29 to April 6.
    expect(activeHoliday(at(2026, 3, 28))).toBeNull();
    expect(activeHoliday(at(2026, 3, 29))).toBe('easter');
    expect(activeHoliday(at(2026, 4, 6))).toBe('easter');
    expect(activeHoliday(at(2026, 4, 7))).toBeNull();
  });

  it('flips at local midnight, not at some other hour', () => {
    expect(activeHoliday(at(2026, 10, 23, 23, 59))).toBeNull();
    expect(activeHoliday(at(2026, 10, 24, 0, 0))).toBe('halloween');
    expect(activeHoliday(at(2026, 11, 1, 23, 59))).toBe('halloween');
    expect(activeHoliday(at(2026, 11, 2, 0, 0))).toBeNull();
  });

  it('moves with Easter from year to year', () => {
    expect(activeHoliday(at(2027, 3, 21))).toBe('easter'); // Easter is March 28
    expect(activeHoliday(at(2027, 4, 5))).toBeNull();
    expect(activeHoliday(at(2028, 4, 9))).toBe('easter'); // Easter is April 16
    expect(activeHoliday(at(2028, 3, 21))).toBeNull();
  });

  it('never has two themes at once, and is off most of the year', () => {
    let on = 0;
    for (let d = new Date(2027, 0, 1); d.getFullYear() === 2027; d.setDate(d.getDate() + 1)) {
      const hits = HOLIDAY_IDS.filter((id) => {
        const { month, day } = holidayOn(id, 2027);
        const diff = Math.round((Date.UTC(2027, month - 1, day) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
        return diff <= WINDOW.daysBefore && diff >= -WINDOW.daysAfter;
      });
      expect(hits.length).toBeLessThanOrEqual(1);
      if (hits.length) on++;
    }
    expect(on).toBe(4 * (WINDOW.daysBefore + WINDOW.daysAfter + 1));
  });

  it('is off on an ordinary day', () => {
    expect(activeHoliday(at(2026, 2, 10))).toBeNull();
    expect(activeHoliday(at(2026, 9, 15))).toBeNull();
  });
});
