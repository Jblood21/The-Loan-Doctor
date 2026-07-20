// Ranked, typo-tolerant search for the LOS borrower picker.
//
// Goals (from real use): when the box is empty, show EVERY borrower; as you type,
// progressively narrow to the names closest to what you typed — ranked by closeness,
// order-independent across words ("smith john" finds "John Smith"), and forgiving of
// dashes/spaces in loan numbers and small typos (subsequence fallback).

export interface SearchableBorrower {
  name: string;
  meta?: string;
  address?: string;
}

const norm = (s: string | undefined) => (s || '').toLowerCase();
const stripSep = (s: string) => s.replace(/[-\s]/g, '');

/** True if every char of `needle` appears in `hay` in order (fuzzy match). */
export function isSubsequence(hay: string, needle: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Score one query token against a borrower. Higher is a closer match; -1 = no match. */
function tokenScore(name: string, words: string[], hay: string, hayNoSep: string, token: string): number {
  const tNoSep = stripSep(token);
  if (name.startsWith(token)) return 100; // name begins with what you typed
  if (words.some((w) => w.startsWith(token))) return 60; // a name word begins with it (last name, etc.)
  if (name.includes(token)) return 45; // appears somewhere in the name
  if (hay.includes(token)) return 25; // appears in loan #/address
  if (tNoSep && hayNoSep.includes(tNoSep)) return 20; // loan number, ignoring dashes/spaces
  if (tNoSep && isSubsequence(hayNoSep, tNoSep)) return 5; // fuzzy / minor typo
  return -1;
}

/**
 * Rank + filter borrowers by a search string. Empty query returns the full list
 * unchanged (so the dropdown shows everyone). A borrower is kept only if EVERY
 * query word matches something; results are sorted by total score (closest first),
 * ties broken by original order.
 */
export function rankBorrowers<T extends SearchableBorrower>(list: T[], query: string): T[] {
  const q = norm(query).trim();
  if (!q) return list;
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { b: T; score: number; idx: number }[] = [];
  list.forEach((b, idx) => {
    const name = norm(b.name);
    const words = name.split(/\s+/).filter(Boolean);
    const hay = `${name} ${norm(b.meta)} ${norm(b.address)}`;
    const hayNoSep = stripSep(hay);

    let total = 0;
    for (const tok of tokens) {
      const s = tokenScore(name, words, hay, hayNoSep, tok);
      if (s < 0) return; // this word matched nothing → not a candidate
      total += s;
    }
    if (name.startsWith(q)) total += 50; // whole query prefixes the name → strong boost
    scored.push({ b, score: total, idx });
  });

  scored.sort((a, z) => z.score - a.score || a.idx - z.idx);
  return scored.map((s) => s.b);
}
