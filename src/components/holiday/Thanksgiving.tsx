import { seeded, vars } from './util';

const LEAF_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#a0522d', '#7a8b2e', '#d35400'];

/** Leaf shapes defined once; each falling leaf just points at one. */
function LeafDefs() {
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

function Leaf({ shape, color, className, style }: { shape: 'maple' | 'round'; color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={{ color, ...style }} viewBox="0 0 40 46" aria-hidden="true">
      <use href={`#tg-${shape}`} />
    </svg>
  );
}

const rand = seeded(5);
function fallingLeaves(count: number) {
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

function FallingLeaves({ count }: { count: number }) {
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

const WORD = 'THANKFUL';
const PENNANT_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#7a8b2e', '#a0522d', '#d35400', '#c0392b', '#e67e22'];

/** A swag of lettered pennants that spells THANKFUL across the top. */
function Banner() {
  const W = 400;
  const n = WORD.length;
  // Points on the cord M0 6 Q200 26 400 6
  const pointAt = (t: number): [number, number] => [
    2 * (1 - t) * t * (W / 2) + t * t * W,
    6 * (1 - t) * (1 - t) + 2 * (1 - t) * t * 26 + 6 * t * t,
  ];
  return (
    <svg className="hd-tg-banner" viewBox={`0 0 ${W} 56`} aria-hidden="true">
      <path d={`M0 6Q${W / 2} 26 ${W} 6`} fill="none" stroke="#8a6a3c" strokeWidth="2" strokeLinecap="round" />
      {WORD.split('').map((ch, i) => {
        const [x, y] = pointAt((i + 0.5) / n);
        const light = PENNANT_COLORS[i] === '#f1c40f';
        return (
          <g key={i} className="hd-pennant" style={vars({ '--delay': `${(i * 0.37) % 2.4}s` })}>
            <path
              d={`M${x - 21} ${y - 1}L${x + 21} ${y - 1}L${x + 21} ${y + 24}L${x} ${y + 36}L${x - 21} ${y + 24}Z`}
              fill={PENNANT_COLORS[i]}
              stroke="rgba(60,25,5,.35)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <text x={x} y={y + 21} textAnchor="middle" fontSize="21" fontWeight="800" fill={light ? '#5b3a0a' : '#fffaf0'} style={{ fontFamily: 'Figtree, system-ui, sans-serif' }}>
              {ch}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Turkey({ className }: { className: string }) {
  const feathers = [-66, -44, -22, 0, 22, 44, 66];
  const colors = ['#c0392b', '#e67e22', '#f1c40f', '#2e8b8b', '#f1c40f', '#e67e22', '#c0392b'];
  return (
    <svg className={className} viewBox="0 0 110 122" aria-hidden="true">
      <g transform="translate(55 70)">
        {feathers.map((a, i) => (
          <g key={a} transform={`rotate(${a})`}>
            <ellipse cx="0" cy="-40" rx="10.5" ry="28" fill={colors[i]} stroke="rgba(60,25,5,.3)" strokeWidth="1.2" />
            <ellipse cx="0" cy="-47" rx="5.2" ry="15" fill="#fff" opacity=".28" />
            <circle cx="0" cy="-52" r="4.2" fill="#5a3a16" opacity=".55" />
          </g>
        ))}
      </g>
      <ellipse cx="55" cy="84" rx="25" ry="29" fill="#8b5a2b" stroke="#5e3a18" strokeWidth="1.5" />
      <path d="M36 76Q55 62 74 76Q70 96 55 100Q40 96 36 76Z" fill="#a8723a" />
      <path d="M40 80Q55 72 70 80" fill="none" stroke="#6f4620" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="55" cy="52" r="13" fill="#a8723a" stroke="#5e3a18" strokeWidth="1.5" />
      <path d="M51 63Q49 74 55 74Q61 74 59 63Z" fill="#d62828" />
      <path d="M52 56L58 56L55 62Z" fill="#f4a51c" />
      <circle cx="49.5" cy="49" r="3" fill="#fff" />
      <circle cx="60.5" cy="49" r="3" fill="#fff" />
      <circle cx="50" cy="49.4" r="1.5" fill="#222" />
      <circle cx="60" cy="49.4" r="1.5" fill="#222" />
      <path d="M46 40Q55 34 64 40" fill="none" stroke="#5e3a18" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M48 112V120M42 120H54M62 112V120M56 120H68" stroke="#f4a51c" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function Pie({ className }: { className: string }) {
  const strips = [-2, -1, 0, 1, 2];
  return (
    <svg className={className} viewBox="0 0 124 96" aria-hidden="true">
      <defs>
        <clipPath id="tg-pie-fill">
          <ellipse cx="62" cy="52" rx="38" ry="13" />
        </clipPath>
      </defs>
      <g className="hd-steam" fill="none" stroke="rgba(120,100,80,.5)" strokeWidth="3" strokeLinecap="round">
        <path d="M46 34Q40 26 46 18Q52 10 46 4" />
        <path d="M62 32Q56 24 62 16Q68 8 62 2" />
        <path d="M78 34Q72 26 78 18Q84 10 78 4" />
      </g>
      <path d="M12 56V68Q12 82 62 82Q112 82 112 68V56" fill="#d99b4b" stroke="#a06a1f" strokeWidth="1.6" />
      <ellipse cx="62" cy="56" rx="50" ry="17" fill="#e9b66a" stroke="#a06a1f" strokeWidth="1.6" />
      <ellipse cx="62" cy="52" rx="38" ry="13" fill="#e8892b" stroke="#b86a1a" strokeWidth="1.2" />
      <g clipPath="url(#tg-pie-fill)" stroke="#e9b66a" strokeWidth="5" strokeLinecap="round">
        {strips.map((k) => (
          <path key={`a${k}`} d={`M${62 + k * 16 - 30} 70L${62 + k * 16 + 30} 34`} />
        ))}
        {strips.map((k) => (
          <path key={`b${k}`} d={`M${62 + k * 16 + 30} 70L${62 + k * 16 - 30} 34`} />
        ))}
      </g>
      <g stroke="#a06a1f" strokeWidth="1.2" fill="none" opacity=".55">
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return <path key={i} d={`M${62 + Math.cos(a) * 46} ${56 + Math.sin(a) * 15.5}l${Math.cos(a) * 3} ${Math.sin(a) * 1.3}`} />;
        })}
      </g>
    </svg>
  );
}

export function ThanksgivingBack() {
  return null;
}

export function ThanksgivingFront() {
  return (
    <>
      <LeafDefs />
      <Banner />
      <FallingLeaves count={9} />
      <Pie className="hd-tg-pie" />
      <Turkey className="hd-tg-turkey" />
    </>
  );
}

