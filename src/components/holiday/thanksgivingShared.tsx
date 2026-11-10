import { seeded, vars } from './util';

export const LEAF_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#a0522d', '#7a8b2e', '#d35400'];

/** Leaf shapes defined once; each falling leaf just points at one. */
export function LeafDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="tg-maple" viewBox="0 0 40 46">
          <path
            d="M20 2L23.5 11 31 6.5 28.5 16.5 38 16 31.5 23.5 36.5 31 26.5 29.5 26 38 21 36 21 45 19 45 19 36 14 38 13.5 29.5 3.5 31 8.5 23.5 2 16 11.5 16.5 9 6.5 16.5 11Z"
            fill="currentColor"
            stroke="rgba(60,25,5,.28)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path d="M20 40V14M20 28L12 22M20 28L28 22M20 20L15 13M20 20L25 13" stroke="rgba(60,25,5,.3)" strokeWidth="1" fill="none" strokeLinecap="round" />
        </symbol>
        <symbol id="tg-round" viewBox="0 0 40 46">
          <path d="M20 2C33 10 35 28 20 40C5 28 7 10 20 2Z" fill="currentColor" stroke="rgba(60,25,5,.28)" strokeWidth="1" />
          <path d="M20 44V12M20 30L13 24M20 30L27 24M20 21L15 15M20 21L25 15" stroke="rgba(60,25,5,.3)" strokeWidth="1" fill="none" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export function Leaf({ shape, color, className, style }: { shape: 'maple' | 'round'; color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={{ color, ...style }} viewBox="0 0 40 46" aria-hidden="true">
      <use href={`#tg-${shape}`} />
    </svg>
  );
}

const rand = seeded(5);
export function fallingLeaves(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    left: ((i * 100) / count + rand() * 3).toFixed(1),
    size: Math.round(18 + rand() * 14),
    dur: (13 + rand() * 12).toFixed(1),
    delay: (-rand() * 24).toFixed(1),
    sway: Math.round(-60 + rand() * 120),
    shape: (i % 3 === 0 ? 'round' : 'maple') as 'maple' | 'round',
    color: LEAF_COLORS[i % LEAF_COLORS.length],
  }));
}

export function FallingLeaves({ count }: { count: number }) {
  return (
    <>
      {fallingLeaves(count).map((l, i) => (
        <Leaf
          key={i}
          shape={l.shape}
          color={l.color}
          className="hd-tg-leaf"
          style={vars({ left: `${l.left}%`, '--s': `${l.size}px`, '--dur': `${l.dur}s`, '--delay': `${l.delay}s`, '--sway': `${l.sway}px` })}
        />
      ))}
    </>
  );
}
