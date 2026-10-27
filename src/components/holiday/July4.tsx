import { vars } from './util';

const FLAG_COLORS = ['#c1272d', '#ffffff', '#1f4fa3'];

const STAR = 'M0-10L2.9-3.1 10-3.1 4.3 1.2 6.2 8.4 0 4.2-6.2 8.4-4.3 1.2-10-3.1-2.9-3.1Z';

/** One swag of bunting: a drooping cord with three pennant flags. */
function Swag({ index }: { index: number }) {
  // Points on the cord M0 6 Q60 38 120 6 at t = .2, .5, .8
  const flags: [number, number][] = [
    [24, 17],
    [60, 22],
    [96, 17],
  ];
  return (
    <svg className="hd-swag" viewBox="0 0 120 64" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <path d="M0 6Q60 38 120 6" fill="none" stroke="#5b6b8c" strokeWidth="1.8" strokeLinecap="round" />
      {flags.map(([x, y], i) => {
        const color = FLAG_COLORS[(index * 3 + i) % 3];
        return (
          <g key={i} className="hd-pennant" style={vars({ '--delay': `${((index * 3 + i) * 0.37) % 2.4}s` })}>
            <path d={`M${x - 13} ${y - 3}L${x + 13} ${y - 3}L${x} ${y + 31}Z`} fill={color} stroke="rgba(31,60,120,.35)" strokeWidth="1.1" strokeLinejoin="round" />
            {color === '#1f4fa3' && <path d={STAR} transform={`translate(${x} ${y + 9}) scale(.8)`} fill="#fff" />}
            {color === '#c1272d' && <path d={`M${x - 8} ${y + 4}L${x + 8} ${y + 4}`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".85" />}
          </g>
        );
      })}
    </svg>
  );
}

/** A firework: rays and sparks that open out, hang, and fade. */
function Burst({ className, style, a, b }: { className: string; style?: React.CSSProperties; a: string; b: string }) {
  const rays = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);
  const inner = Array.from({ length: 7 }, (_, i) => (i * 360) / 7 + 12);
  return (
    <svg className={className} style={style} viewBox="-60 -60 120 120" aria-hidden="true">
      <g className="hd-burst-body">
        {rays.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <line x1="16" y1="0" x2="40" y2="0" stroke={a} strokeWidth="3" strokeLinecap="round" />
            <circle cx="49" cy="0" r="3.4" fill={a} />
          </g>
        ))}
        {inner.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <line x1="8" y1="0" x2="20" y2="0" stroke={b} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="26" cy="0" r="2.4" fill={b} />
          </g>
        ))}
        <circle r="4" fill="#fff" />
      </g>
    </svg>
  );
}

function Sparkle({ className, color, style }: { className: string; color: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="-12 -12 24 24" aria-hidden="true">
      <path d={STAR} fill={color} stroke="rgba(31,60,120,.3)" strokeWidth=".8" />
    </svg>
  );
}

function Flag({ className }: { className: string }) {
  const stripes = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg className={className} viewBox="0 0 120 100" aria-hidden="true">
      <rect x="6" y="6" width="4.5" height="92" rx="2" fill="#7c8aa5" />
      <circle cx="8.2" cy="5" r="4.2" fill="#fbbf24" stroke="#d99a05" strokeWidth="1" />
      <g className="hd-cloth">
        {stripes.map((i) => (
          <rect key={i} x="10.5" y={10 + i * 7.4} width="100" height="7.4" fill={i % 2 === 0 ? '#c1272d' : '#ffffff'} />
        ))}
        <rect x="10.5" y="10" width="44" height="29.6" fill="#1f4fa3" />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={17 + (i % 4) * 11.5} cy={17 + Math.floor(i / 4) * 9.5} r="2" fill="#fff" />
        ))}
        <rect x="10.5" y="10" width="100" height="51.8" fill="none" stroke="rgba(31,60,120,.3)" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/** Behind the page: fireworks and twinkles in the sky, showing wherever the page is clear. */
export function July4Back() {
  return (
    <>
      <Burst className="hd-burst hd-burst-a" a="#e53935" b="#ffffff" style={vars({ '--delay': '0s' })} />
      <Burst className="hd-burst hd-burst-b" a="#3b82f6" b="#fbbf24" style={vars({ '--delay': '-2.2s' })} />
      <Burst className="hd-burst hd-burst-c" a="#fbbf24" b="#e53935" style={vars({ '--delay': '-4.1s' })} />
      <Sparkle className="hd-spark hd-spark-1" color="#fbbf24" style={vars({ '--delay': '0s' })} />
      <Sparkle className="hd-spark hd-spark-2" color="#ffffff" style={vars({ '--delay': '-1.1s' })} />
      <Sparkle className="hd-spark hd-spark-3" color="#60a5fa" style={vars({ '--delay': '-2.0s' })} />
      <Sparkle className="hd-spark hd-spark-4" color="#e53935" style={vars({ '--delay': '-0.6s' })} />
    </>
  );
}

export function July4Front() {
  return (
    <>
      <div className="hd-bunting">
        {Array.from({ length: 16 }, (_, i) => (
          <Swag key={i} index={i} />
        ))}
      </div>
      <Flag className="hd-flag" />
      <Sparkle className="hd-star-big hd-star-big-a" color="#1f4fa3" />
      <Sparkle className="hd-star-big hd-star-big-b" color="#e53935" />
    </>
  );
}
