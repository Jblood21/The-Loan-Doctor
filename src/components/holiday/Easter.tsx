import { seeded, vars } from './util';

const EGG = 'M30 3C44 3 56 30 56 48C56 65 44 76 30 76S4 65 4 48C4 30 16 3 30 3Z';

type EggStyle = { base: string; mark: string; kind: 'zigzag' | 'dots' | 'stripes' | 'flower' };
const EGGS: EggStyle[] = [
  { base: '#f9c6d7', mark: '#ffffff', kind: 'zigzag' },
  { base: '#cdb4f0', mark: '#fbe8a6', kind: 'dots' },
  { base: '#bde8d0', mark: '#ffffff', kind: 'stripes' },
  { base: '#fbe8a6', mark: '#f4a3c0', kind: 'flower' },
];

function Egg({ i, className, style }: { i: number; className?: string; style?: React.CSSProperties }) {
  const e = EGGS[i % EGGS.length];
  const id = `egg-${i}-${className ?? 'x'}`;
  return (
    <svg className={className} style={style} viewBox="0 0 60 80" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={EGG} />
        </clipPath>
      </defs>
      <path d={EGG} fill={e.base} />
      <g clipPath={`url(#${id})`} fill="none" stroke={e.mark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {e.kind === 'zigzag' && <path d="M0 40L8 32L16 40L24 32L32 40L40 32L48 40L56 32L64 40M0 54L8 46L16 54L24 46L32 54L40 46L48 54L56 46L64 54" />}
        {e.kind === 'dots' && (
          <g fill={e.mark} stroke="none">
            {[[18, 30], [38, 28], [28, 44], [14, 54], [44, 52], [28, 64]].map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r="3.2" />
            ))}
          </g>
        )}
        {e.kind === 'stripes' && <path d="M0 30Q30 38 60 30M0 44Q30 52 60 44M0 58Q30 66 60 58" />}
        {e.kind === 'flower' && (
          <g fill={e.mark} stroke="none">
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="30" cy="38" rx="4" ry="7" transform={`rotate(${a} 30 45)`} />
            ))}
            <circle cx="30" cy="45" r="3.2" fill="#fff" />
          </g>
        )}
      </g>
      <ellipse cx="19" cy="24" rx="3" ry="6" transform="rotate(20 19 24)" fill="#fff" opacity=".45" />
      <path d={EGG} fill="none" stroke="rgba(90,60,110,.28)" strokeWidth="1.3" />
    </svg>
  );
}

function Bunny({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 96 124" aria-hidden="true">
      <g stroke="rgba(90,60,110,.35)" strokeWidth="1.4">
        <ellipse cx="34" cy="24" rx="8.5" ry="23" transform="rotate(-9 34 24)" fill="#fff" />
        <ellipse cx="60" cy="24" rx="8.5" ry="23" transform="rotate(10 60 24)" fill="#fff" />
        <ellipse cx="48" cy="98" rx="27" ry="24" fill="#fff" />
        <ellipse cx="31" cy="119" rx="13" ry="6" fill="#fff" />
        <ellipse cx="65" cy="119" rx="13" ry="6" fill="#fff" />
        <circle cx="76" cy="102" r="8" fill="#fff" />
        <ellipse cx="48" cy="58" rx="23" ry="20" fill="#fff" />
      </g>
      <ellipse cx="34" cy="25" rx="4" ry="16" transform="rotate(-9 34 25)" fill="#f9c6d7" />
      <ellipse cx="60" cy="25" rx="4" ry="16" transform="rotate(10 60 25)" fill="#f9c6d7" />
      <ellipse cx="48" cy="104" rx="14" ry="14" fill="#fdf2f6" />
      <circle cx="40" cy="56" r="2.8" fill="#3b2f4a" />
      <circle cx="56" cy="56" r="2.8" fill="#3b2f4a" />
      <circle cx="41" cy="55" r=".9" fill="#fff" />
      <circle cx="57" cy="55" r=".9" fill="#fff" />
      <path d="M45 63L51 63L48 67Z" fill="#f48fb1" />
      <path d="M48 67Q44 72 40 69M48 67Q52 72 56 69" fill="none" stroke="#3b2f4a" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="34" cy="64" rx="4.5" ry="3" fill="#f9c6d7" opacity=".8" />
      <ellipse cx="62" cy="64" rx="4.5" ry="3" fill="#f9c6d7" opacity=".8" />
      <g transform="translate(48 79)">
        <path d="M0 0L-12-7L-12 7ZM0 0L12-7L12 7Z" fill="#b39ddb" />
        <circle r="3.4" fill="#9575cd" />
      </g>
    </svg>
  );
}

function Tulip({ className, color, style }: { className: string; color: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 40 96" aria-hidden="true">
      <path d="M20 94V40" stroke="#4f9a63" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M20 92C6 76 5 60 12 52C15 64 18 78 20 92Z" fill="#62b277" />
      <path d="M20 92C34 78 35 62 29 54C25 66 22 78 20 92Z" fill="#53a269" />
      <path d="M7 40C4 24 12 13 20 10C28 13 36 24 33 40C28 46 12 46 7 40Z" fill={color} />
      <path d="M20 10C14 20 14 34 18 44C22 34 24 20 20 10Z" fill="#fff" opacity=".3" />
      <path d="M7 40C4 24 12 13 20 10C28 13 36 24 33 40" fill="none" stroke="rgba(90,60,110,.25)" strokeWidth="1.2" />
    </svg>
  );
}

function Basket({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 110 84" aria-hidden="true">
      <path d="M18 44Q55-14 92 44" fill="none" stroke="#b97d44" strokeWidth="5" strokeLinecap="round" />
      <g transform="translate(26 6) scale(.52)">
        <Egg i={0} />
      </g>
      <g transform="translate(46 -2) scale(.52) rotate(8 30 40)">
        <Egg i={2} />
      </g>
      <g transform="translate(62 8) scale(.5) rotate(-12 30 40)">
        <Egg i={1} />
      </g>
      <path d="M10 42H100L90 80Q88 84 82 84H28Q22 84 20 80Z" fill="#d49a5e" stroke="#b97d44" strokeWidth="1.6" />
      <path d="M14 54H96M17 66H93M36 42L40 84M55 42V84M74 42L70 84" stroke="#b97d44" strokeWidth="1.5" fill="none" />
      <path d="M8 40Q55 54 102 40V46Q55 60 8 46Z" fill="#62b277" opacity=".95" />
    </svg>
  );
}

/** Blades of grass along the bottom edge. */
function grassPath(width: number, base: number, step: number, min: number, max: number, seed: number) {
  const r = seeded(seed);
  let d = `M0 ${base}`;
  for (let x = 0; x < width; x += step) {
    const h = base - (min + r() * (max - min));
    const lean = (r() - 0.5) * step * 0.9;
    d += `L${x + step * 0.25} ${base - (base - h) * 0.4}L${x + step * 0.5 + lean} ${h}L${x + step * 0.75} ${base - (base - h) * 0.4}L${x + step} ${base}`;
  }
  return `${d}V${base + 6}H0Z`;
}
const GRASS_BACK = grassPath(1280, 52, 14, 22, 44, 3);
const GRASS_FRONT = grassPath(1280, 52, 17, 12, 30, 11);

const rand = seeded(21);
const PETALS = Array.from({ length: 14 }, (_, i) => ({
  left: ((i * 100) / 14 + rand() * 4).toFixed(1),
  dur: (14 + rand() * 12).toFixed(1),
  delay: (-rand() * 26).toFixed(1),
  sway: Math.round(-50 + rand() * 100),
  size: (7 + rand() * 5).toFixed(1),
}));

function Butterfly({ className, style, wing, wing2 }: { className: string; style?: React.CSSProperties; wing: string; wing2: string }) {
  return (
    <svg className={className} style={style} viewBox="0 0 44 36" aria-hidden="true">
      <g className="hd-wings">
        <ellipse cx="13" cy="12" rx="11" ry="9" transform="rotate(-20 13 12)" fill={wing} />
        <ellipse cx="31" cy="12" rx="11" ry="9" transform="rotate(20 31 12)" fill={wing} />
        <ellipse cx="15" cy="25" rx="7" ry="6" transform="rotate(20 15 25)" fill={wing2} />
        <ellipse cx="29" cy="25" rx="7" ry="6" transform="rotate(-20 29 25)" fill={wing2} />
        <circle cx="11" cy="11" r="2.6" fill="#fff" opacity=".7" />
        <circle cx="33" cy="11" r="2.6" fill="#fff" opacity=".7" />
      </g>
      <rect x="20.6" y="8" width="2.8" height="22" rx="1.4" fill="#5b4a6e" />
      <path d="M21 8Q18 2 14 2M23 8Q26 2 30 2" stroke="#5b4a6e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const PASTELS = ['#f9c6d7', '#cdb4f0', '#bde8d0', '#fbe8a6', '#b9dcf5'];

/** One swag of the egg garland: a cord with three small painted eggs hanging from it. */
function EggDroop({ index }: { index: number }) {
  // Points on the cord M0 6 Q60 40 120 6 at t = .2, .5, .8
  const spots: [number, number][] = [
    [24, 17],
    [60, 23],
    [96, 17],
  ];
  return (
    <svg className="hd-droop" viewBox="0 0 120 64" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <path d="M0 6Q60 40 120 6" fill="none" stroke="#a894c4" strokeWidth="1.8" strokeLinecap="round" />
      {spots.map(([x, y], i) => {
        const n = index * 3 + i;
        const color = PASTELS[n % PASTELS.length];
        return (
          <g key={i} className="hd-pennant" style={vars({ '--delay': `${(n * 0.43) % 2.6}s` })}>
            <line x1={x} y1={y - 1} x2={x} y2={y + 5} stroke="#a894c4" strokeWidth="1.3" />
            <g transform={`translate(${x - 10} ${y + 3}) scale(.33)`}>
              <path d={EGG} fill={color} stroke="rgba(90,60,110,.3)" strokeWidth="3" />
              <path d="M6 42Q30 50 54 42M8 56Q30 64 52 56" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".85" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export function EasterBack() {
  return null;
}

export function EasterFront() {
  return (
    <>
      <div className="hd-lights">
        {Array.from({ length: 16 }, (_, i) => (
          <EggDroop key={i} index={i} />
        ))}
      </div>
      <Butterfly className="hd-butterfly hd-butterfly-a" wing="#f9c6d7" wing2="#cdb4f0" style={vars({ '--dur': '34s', '--delay': '-6s' })} />
      <Butterfly className="hd-butterfly hd-butterfly-b" wing="#fbe8a6" wing2="#b9dcf5" style={vars({ '--dur': '44s', '--delay': '-26s' })} />
      {PETALS.map((p, i) => (
        <i key={i} className="hd-petal" style={vars({ left: `${p.left}%`, '--s': `${p.size}px`, '--dur': `${p.dur}s`, '--delay': `${p.delay}s`, '--sway': `${p.sway}px` })} />
      ))}
      <svg className="hd-grass hd-grass-back" viewBox="0 0 1280 58" preserveAspectRatio="none" aria-hidden="true">
        <path d={GRASS_BACK} fill="#8fd1a0" />
      </svg>
      <Basket className="hd-basket" />
      <Tulip className="hd-tulip hd-tulip-1" color="#f48fb1" />
      <Tulip className="hd-tulip hd-tulip-2" color="#fbc75a" style={vars({ '--w': '20px' })} />
      <Egg i={3} className="hd-nest-egg hd-nest-egg-1" />
      <Egg i={1} className="hd-nest-egg hd-nest-egg-2" />
      <svg className="hd-grass hd-grass-front" viewBox="0 0 1280 58" preserveAspectRatio="none" aria-hidden="true">
        <path d={GRASS_FRONT} fill="#6fbf86" />
      </svg>
      <Tulip className="hd-tulip hd-tulip-3" color="#b39ddb" />
      <Tulip className="hd-tulip hd-tulip-4" color="#f48fb1" style={vars({ '--w': '18px' })} />
      <Bunny className="hd-bunny" />
    </>
  );
}
