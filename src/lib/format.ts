// Formatting helpers shared across screens.

/** Whole-dollar currency, e.g. $1,234. */
export function fmt(n: number): string {
  return '$' + Math.round(n || 0).toLocaleString('en-US');
}

/** Currency with cents, e.g. $1,234.56. */
export function fmt2(n: number): string {
  const v = Math.round((n || 0) * 100) / 100;
  return (
    '$' +
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** Percentage with a configurable number of decimals, e.g. 6.5%. */
export function pct(n: number, dp = 2): string {
  return (Math.round((n || 0) * 10 ** dp) / 10 ** dp).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  }) + '%';
}

/** Plain grouped number, e.g. 1,234. */
export function num(n: number): string {
  return Math.round(n || 0).toLocaleString('en-US');
}

/** Long date, e.g. June 25, 2026. */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Parse a form value to a number, preserving empty string as 0 for math. */
export function toNum(raw: string | number): number {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Initials from a full name, e.g. "John Smith" -> "JS". */
export function initials(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
