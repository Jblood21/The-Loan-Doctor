import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyHoliday,
  currentHoliday,
  getHolidayPreference,
  isBorrowerFacingPath,
  isPreviewing,
  readPreviewFromUrl,
  seasonalHoliday,
  setHolidayPreference,
} from './holidayTheme';

// A tiny in-memory stand-in for the browser's storage and page.
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
}

const halloweenDay = new Date(2026, 9, 28, 12);
const ordinaryDay = new Date(2026, 8, 10, 12);

let attrs: Map<string, string>;
let events: string[];

beforeEach(() => {
  attrs = new Map();
  events = [];
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('sessionStorage', fakeStorage());
  vi.stubGlobal('Event', class FakeEvent { constructor(public type: string) {} });
  vi.stubGlobal('window', {
    location: { search: '' },
    dispatchEvent: (e: { type: string }) => events.push(e.type),
  });
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const previewLink = (search: string) => {
  (window as unknown as { location: { search: string } }).location.search = search;
  readPreviewFromUrl();
};

describe('what is showing', () => {
  it('follows the calendar by default', () => {
    expect(currentHoliday(halloweenDay)).toBe('halloween');
    expect(currentHoliday(ordinaryDay)).toBeNull();
    expect(isPreviewing()).toBe(false);
  });

  it('can be switched off for this device, and back on, without losing track of the season', () => {
    setHolidayPreference('off');
    expect(getHolidayPreference()).toBe('off');
    expect(currentHoliday(halloweenDay)).toBeNull();
    expect(seasonalHoliday(halloweenDay)).toBe('halloween'); // the sidebar switch still knows it is in season
    expect(events).toContain('lbc-holiday-change');
    setHolidayPreference('auto');
    expect(currentHoliday(halloweenDay)).toBe('halloween');
  });

  it('shows a previewed holiday on any day, even if the visitor switched the look off', () => {
    setHolidayPreference('off');
    previewLink('?holiday=christmas');
    expect(isPreviewing()).toBe(true);
    expect(currentHoliday(ordinaryDay)).toBe('christmas');
    expect(seasonalHoliday(ordinaryDay)).toBe('christmas');
  });

  it('lets ?holiday=off hide an in-season look', () => {
    previewLink('?holiday=off');
    expect(currentHoliday(halloweenDay)).toBeNull();
    expect(seasonalHoliday(halloweenDay)).toBeNull();
  });

  it('ignores a preview name it does not know and keeps an earlier preview', () => {
    previewLink('?holiday=nonsense');
    expect(isPreviewing()).toBe(false);
    expect(currentHoliday(ordinaryDay)).toBeNull();
    previewLink('?holiday=easter');
    previewLink('?holiday=nonsense');
    expect(currentHoliday(ordinaryDay)).toBe('easter');
  });

  it('keeps working when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(getHolidayPreference()).toBe('auto');
    expect(() => setHolidayPreference('off')).not.toThrow();
    expect(currentHoliday(halloweenDay)).toBe('halloween');
  });
});

describe('where the look applies', () => {
  it('leaves the pages a borrower or buyer opens from a link alone', () => {
    for (const p of ['/q/abc123', '/s/sometoken']) expect(isBorrowerFacingPath(p)).toBe(true);
    for (const p of ['/compare', '/login', '/agent', '/quote', '/q', '/billing']) expect(isBorrowerFacingPath(p)).toBe(false);
  });

  it('puts the holiday on the page and takes it off again', () => {
    applyHoliday('easter');
    expect(document.documentElement.getAttribute('data-holiday')).toBe('easter');
    applyHoliday(null);
    expect(document.documentElement.getAttribute('data-holiday')).toBeNull();
  });
});
