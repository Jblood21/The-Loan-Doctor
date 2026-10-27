import type { CSSProperties } from 'react';

/** Inline style that carries custom properties (--d, --delay, …) for the CSS animations. */
export const vars = (v: Record<string, string | number>): CSSProperties => v as unknown as CSSProperties;

/** A small repeatable pseudo-random generator, so the scattered pieces are the same on
 *  every visit and every render rather than jumping around. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
