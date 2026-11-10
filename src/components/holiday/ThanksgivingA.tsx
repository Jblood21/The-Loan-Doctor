import { seeded } from './util';
import { LEAF_COLORS, LeafDefs, FallingLeaves } from './thanksgivingShared';
import { vars } from './util';

/** One swag of the leaf garland: a cord with three leaves hanging from it. */
function LeafDroop({ index }: { index: number }) {
  const spots: [number, number][] = [
    [24, 17],
    [60, 23],
    [96, 17],
  ];
  return (
    <svg className="hd-droop" viewBox="0 0 120 64" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <path d="M0 6Q60 40 120 6" fill="none" stroke="#8a6a3c" strokeWidth="1.8" strokeLinecap="round" />
      {spots.map(([x, y], i) => {
        const n = index * 3 + i;
        return (
          <g key={i} className="hd-pennant" style={vars({ '--delay': `${(n * 0.41) % 2.6}s` })}>
            <line x1={x} y1={y - 1} x2={x} y2={y + 4} stroke="#8a6a3c" strokeWidth="1.2" />
            <g transform={`translate(${x - 9} ${y + 3}) scale(.45)`} style={{ color: LEAF_COLORS[n % LEAF_COLORS.length] }}>
              <use href={n % 3 === 0 ? '#tg-round' : '#tg-maple'} width="40" height="46" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function Pumpkin({ x, y, s, color, dark }: { x: number; y: number; s: number; color: string; dark: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g stroke={dark} strokeWidth="1.4">
        <ellipse cx="0" cy="0" rx="26" ry="20" fill={color} />
        <ellipse cx="-14" cy="0" rx="14" ry="19" fill={color} />
        <ellipse cx="14" cy="0" rx="14" ry="19" fill={color} />
        <ellipse cx="0" cy="0" rx="10" ry="20" fill={color} opacity=".85" />
      </g>
      <path d="M-2-18Q-1-27 5-29l2 4Q3-24 3-17Z" fill="#6b7f2c" stroke="#44541b" strokeWidth="1" />
    </g>
  );
}

function Patch({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 84" aria-hidden="true">
      <Pumpkin x={44} y={56} s={1.05} color="#f08a1c" dark="#b85c06" />
      <Pumpkin x={92} y={66} s={0.62} color="#f4e7c8" dark="#c9b78a" />
      <g transform="translate(20 70) rotate(-14)">
        <ellipse cx="0" cy="0" rx="8" ry="13" fill="#d6a428" stroke="#a37a12" strokeWidth="1.2" />
        <ellipse cx="0" cy="0" rx="3.5" ry="13" fill="#e6bb44" opacity=".8" />
        <path d="M0-13Q2-19 6-20" stroke="#6b7f2c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g transform="translate(70 76)">
        <ellipse cx="0" cy="0" rx="6" ry="7" fill="#a0693a" stroke="#6f4620" strokeWidth="1" />
        <path d="M-6.5-2Q0-10 6.5-2Z" fill="#7a4a24" stroke="#6f4620" strokeWidth="1" />
        <path d="M0-8V-11" stroke="#6f4620" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Sunflower({ className }: { className: string }) {
  const petals = Array.from({ length: 18 }, (_, i) => (i * 360) / 18);
  return (
    <svg className={className} viewBox="0 0 100 124" aria-hidden="true">
      {/* wheat */}
      <g stroke="#b8902e" strokeWidth="2.2" fill="none" strokeLinecap="round">
        <path d="M18 122Q14 80 22 46" />
        <path d="M30 122Q32 84 40 56" />
      </g>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <g key={k}>
          <ellipse cx={21 - k * 0.9} cy={44 + k * 7} rx="4" ry="2.4" transform={`rotate(-35 ${21 - k} ${44 + k * 7})`} fill="#e0b84a" />
          <ellipse cx={27 + k * 0.4} cy={51 + k * 7} rx="4" ry="2.4" transform={`rotate(35 ${27 + k} ${51 + k * 7})`} fill="#d9ae3c" />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((k) => (
        <ellipse key={`b${k}`} cx={38 + k * 0.6} cy={54 + k * 7} rx="3.6" ry="2.2" transform={`rotate(${k % 2 ? 35 : -35} 38 ${54 + k * 7})`} fill="#e0b84a" />
      ))}
      {/* sunflower */}
      <path d="M68 124V62" stroke="#4f7a2a" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M68 100C52 98 46 88 48 80C58 82 66 90 68 100Z" fill="#5f9132" />
      <path d="M68 108C82 106 90 98 88 90C78 92 70 98 68 108Z" fill="#528028" />
      <g transform="translate(68 44)">
        {petals.map((a) => (
          <ellipse key={a} cx="0" cy="-22" rx="5.4" ry="12" transform={`rotate(${a})`} fill={a % 40 === 0 ? '#f7c21e' : '#f2b10f'} stroke="#c88a08" strokeWidth=".8" />
        ))}
        <circle r="15" fill="#5a3a16" stroke="#3b230c" strokeWidth="1.2" />
        <circle r="10" fill="#6e4720" />
        {[[-4, -4], [4, -4], [0, 0], [-5, 4], [5, 4], [0, 8], [0, -8]].map(([dx, dy], i) => (
          <circle key={i} cx={dx} cy={dy} r="1.3" fill="#3b230c" />
        ))}
      </g>
    </svg>
  );
}

const r = seeded(33);
const LITTER = Array.from({ length: 78 }, (_, i) => ({
  x: Math.round((i * 1280) / 78 + r() * 14 - 4),
  y: 18 + Math.round(r() * 12),
  rx: 9 + Math.round(r() * 7),
  ry: 3.5 + r() * 3,
  rot: Math.round(r() * 180),
  c: LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)],
}));

export function ThanksgivingABack() {
  return null;
}

export function ThanksgivingAFront() {
  return (
    <>
      <LeafDefs />
      <div className="hd-lights">
        {Array.from({ length: 16 }, (_, i) => (
          <LeafDroop key={i} index={i} />
        ))}
      </div>
      <FallingLeaves count={18} />
      <svg className="hd-tg-litter" viewBox="0 0 1280 40" preserveAspectRatio="none" aria-hidden="true">
        {LITTER.map((l, i) => (
          <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.rot} ${l.x} ${l.y})`} fill={l.c} stroke="rgba(60,25,5,.25)" strokeWidth=".8" />
        ))}
      </svg>
      <Patch className="hd-tg-patch" />
      <Sunflower className="hd-tg-sun" />
    </>
  );
}
