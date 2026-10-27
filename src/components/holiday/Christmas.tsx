import { seeded, vars } from './util';

const BULBS = ['#ef4444', '#22c55e', '#fbbf24', '#60a5fa', '#f8fafc'];

/** One droop of the light string with three bulbs hanging from it. */
function Droop({ index }: { index: number }) {
  // Points on the curve M0 6 Q60 52 120 6 at t = .25, .5, .75
  const spots: [number, number][] = [
    [30, 23],
    [60, 29],
    [90, 23],
  ];
  return (
    <svg className="hd-droop" viewBox="0 0 120 64" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <path d="M0 6Q60 52 120 6" fill="none" stroke="var(--hd-wire)" strokeWidth="2.2" strokeLinecap="round" />
      {spots.map(([x, y], i) => {
        const color = BULBS[(index * 3 + i) % BULBS.length];
        return (
          <g key={i} className="hd-bulb" style={vars({ '--c': color, '--delay': `${((index * 3 + i) * 0.41) % 2.6}s` })}>
            <rect x={x - 2.5} y={y - 1} width="5" height="5" rx="1" fill="#3d3d3d" />
            <path d={`M${x - 5} ${y + 4}Q${x - 5.5} ${y + 15} ${x} ${y + 17}Q${x + 5.5} ${y + 15} ${x + 5} ${y + 4}Z`} fill={color} />
            <ellipse cx={x - 1.8} cy={y + 8} rx="1.2" ry="2.4" fill="#fff" opacity=".55" />
          </g>
        );
      })}
    </svg>
  );
}

const rand = seeded(7);
const FLAKES = Array.from({ length: 30 }, (_, i) => ({
  left: ((i * 100) / 30 + rand() * 3).toFixed(1),
  size: (3.5 + rand() * 5.5).toFixed(1),
  dur: (11 + rand() * 12).toFixed(1),
  delay: (-rand() * 22).toFixed(1),
  sway: Math.round(-40 + rand() * 80),
}));

function Tree({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 132" aria-hidden="true">
      <rect x="42" y="112" width="16" height="16" rx="2" fill="#7a4a24" />
      <polygon points="50,40 12,112 88,112" fill="#1b6b3d" />
      <polygon points="50,24 18,84 82,84" fill="#208a4e" />
      <polygon points="50,8 26,56 74,56" fill="#27a05d" />
      <path d="M26 56L74 56L68 48L50 56L32 48ZM18 84L82 84L74 76L50 84L26 76ZM12 112L88 112L78 103L50 112L22 103Z" fill="#fff" opacity=".95" />
      <polygon points="50,0 52.6,6.4 59.5,6.8 54.2,11.3 55.9,18 50,14.3 44.1,18 45.8,11.3 40.5,6.8 47.4,6.4" fill="#fbbf24" />
      <circle cx="38" cy="66" r="4" fill="#ef4444" />
      <circle cx="58" cy="44" r="3.4" fill="#fbbf24" />
      <circle cx="62" cy="76" r="4" fill="#60a5fa" />
      <circle cx="34" cy="96" r="4.4" fill="#fbbf24" />
      <circle cx="56" cy="100" r="4" fill="#ef4444" />
      <circle cx="74" cy="100" r="3.4" fill="#f8fafc" />
    </svg>
  );
}

function Gifts({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 130 84" aria-hidden="true">
      <rect x="8" y="34" width="56" height="44" rx="3" fill="#d62828" />
      <rect x="31" y="34" width="10" height="44" fill="#fbbf24" />
      <rect x="8" y="50" width="56" height="9" fill="#fbbf24" />
      <path d="M36 34Q20 14 22 26Q24 34 36 34ZM36 34Q52 14 50 26Q48 34 36 34Z" fill="#fbbf24" stroke="#d99a05" strokeWidth="1.2" />
      <circle cx="36" cy="33" r="4" fill="#d99a05" />
      <rect x="70" y="48" width="52" height="30" rx="3" fill="#1b6b3d" />
      <rect x="92" y="48" width="8" height="30" fill="#f8fafc" />
      <rect x="70" y="58" width="52" height="7" fill="#f8fafc" />
      <path d="M96 48Q84 34 86 44Q88 50 96 48ZM96 48Q108 34 106 44Q104 50 96 48Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.1" />
    </svg>
  );
}

function Holly({ className }: { className: string }) {
  const leaf = 'M0 0C10-13 30-13 46 0C30 13 10 13 0 0Z';
  return (
    <svg className={className} viewBox="0 0 120 70" aria-hidden="true">
      <g transform="translate(58 38)">
        <path d={leaf} fill="#1f7a46" transform="rotate(-155)" />
        <path d={leaf} fill="#27a05d" transform="rotate(-25)" />
        <path d={leaf} fill="#1b6b3d" transform="rotate(-100)" />
        <path d={leaf} fill="#27a05d" transform="rotate(-80)" />
        <circle cx="-7" cy="3" r="6.5" fill="#d62828" />
        <circle cx="6" cy="1" r="6.5" fill="#e0372f" />
        <circle cx="-1" cy="-8" r="6.5" fill="#c91f1f" />
        <circle cx="-8.8" cy="1.2" r="1.7" fill="#fff" opacity=".7" />
        <circle cx="4" cy="-1" r="1.7" fill="#fff" opacity=".7" />
        <circle cx="-3" cy="-10" r="1.7" fill="#fff" opacity=".7" />
      </g>
    </svg>
  );
}

export function ChristmasBack() {
  return null;
}

export function ChristmasFront() {
  return (
    <>
      <div className="hd-lights">
        {Array.from({ length: 16 }, (_, i) => (
          <Droop key={i} index={i} />
        ))}
      </div>
      {FLAKES.map((f, i) => (
        <i
          key={i}
          className="hd-flake"
          style={vars({ left: `${f.left}%`, '--s': `${f.size}px`, '--dur': `${f.dur}s`, '--delay': `${f.delay}s`, '--sway': `${f.sway}px` })}
        />
      ))}
      <svg className="hd-drift" viewBox="0 0 1280 56" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 56V34Q80 8 170 28T340 26T510 30T680 24T850 30T1020 26T1280 24V56Z"
          fill="#fff"
          stroke="rgba(120,150,200,.45)"
          strokeWidth="1.5"
        />
      </svg>
      <Gifts className="hd-gifts" />
      <Holly className="hd-holly hd-holly-l" />
      <Tree className="hd-tree" />
      <Holly className="hd-holly hd-holly-r" />
    </>
  );
}
