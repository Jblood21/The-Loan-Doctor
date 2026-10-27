// Light/dark theme manager for Basecamp.
//
// Three choices: 'light', 'dark', or 'system' (follow the OS). The choice is
// stored per-device in localStorage. A tiny inline script in index.html applies
// it before first paint to avoid a flash; this module keeps it in sync at runtime.

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'lbc-theme';

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private mode / blocked storage — fall back to system */
  }
  return 'system';
}

/** Canvas colors, used for the installed app's title bar so it blends with the page. */
const THEME_COLOR = { light: '#f5f3ea', dark: '#0d1824' } as const;

/** Tint the browser/installed-app title bar to match the resolved theme. */
function syncThemeColor(theme: Theme): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[resolvedTheme(theme)]);
}

/** Apply a theme to <html> without persisting it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // The concrete light/dark in force — the seasonal themes key their colors off this.
  root.setAttribute('data-mode', resolvedTheme(theme));
  syncThemeColor(theme);
}

// When following the OS, re-tint the title bar if the OS flips light/dark while open.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') {
      syncThemeColor('system');
      document.documentElement.setAttribute('data-mode', resolvedTheme('system'));
    }
  });
}

/** Persist and apply a theme. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore storage failures — the attribute is still applied below */
  }
  applyTheme(theme);
}

/** The concrete light/dark a theme choice resolves to right now. */
export function resolvedTheme(theme: Theme = getStoredTheme()): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
