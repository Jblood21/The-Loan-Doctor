import { vars } from './util';

/** Radial strands plus sagging rings, drawn from the top-left corner outward. */
function webPaths(size: number, strands: number, rings: number[]) {
  const pt = (angle: number, r: number) => [Math.cos(angle) * size * r, Math.sin(angle) * size * r];
  const angle = (i: number) => (i / (strands - 1)) * (Math.PI / 2);
  const spokes: string[] = [];
  for (let i = 0; i < strands; i++) {
    const [x, y] = pt(angle(i), 1);
    spokes.push(`M0 0L${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const rounds = rings.map((r) => {
    let d = '';
    for (let i = 0; i < strands - 1; i++) {
      const [x1, y1] = pt(angle(i), r);
      const [x2, y2] = pt(angle(i + 1), r);
      const [cx, cy] = pt((angle(i) + angle(i + 1)) / 2, r * 0.8); // sag toward the corner
      d += i === 0 ? `M${x1.toFixed(1)} ${y1.toFixed(1)}` : '';
      d += `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    return d;
  });
  return { spokes: spokes.join(''), rounds };
}

const WEB = webPaths(200, 8, [0.16, 0.32, 0.5, 0.7, 0.92]);

function Cobweb({ className }: { className: string }) {
  return (
    <svg className={`hd-web ${className}`} viewBox="0 0 200 200" fill="none" strokeLinecap="round">
      <path d={WEB.spokes} stroke="currentColor" strokeWidth="1.3" />
      {WEB.rounds.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth="1" />
      ))}
    </svg>
  );
}

function Ghost({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 84 104" aria-hidden="true">
      <path
        d="M10 44C10 20 24 5 42 5s32 15 32 39v42q-8 14-16 4-8 10-16 0-8 10-16 0-8 10-16-4Z"
        fill="#fff"
        stroke="rgba(110,80,170,.5)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 56Q-2 56 2 70 8 68 12 64ZM74 56Q86 56 82 70 76 68 72 64Z" fill="#fff" stroke="rgba(110,80,170,.5)" strokeWidth="1.4" strokeLinejoin="round" />
      <ellipse cx="32" cy="42" rx="5" ry="7.5" fill="#2a1a3d" />
      <ellipse cx="52" cy="42" rx="5" ry="7.5" fill="#2a1a3d" />
      <circle cx="30.5" cy="39.5" r="1.8" fill="#fff" />
      <circle cx="50.5" cy="39.5" r="1.8" fill="#fff" />
      <ellipse cx="42" cy="60" rx="5" ry="7" fill="#2a1a3d" />
      <circle cx="24" cy="52" r="4.5" fill="#ffb3c7" opacity=".55" />
      <circle cx="60" cy="52" r="4.5" fill="#ffb3c7" opacity=".55" />
    </svg>
  );
}

function Spider() {
  return (
    <svg className="hd-spider" viewBox="0 0 44 74" aria-hidden="true">
      <line x1="22" y1="0" x2="22" y2="34" stroke="currentColor" strokeWidth="1.1" opacity=".75" />
      <g transform="translate(22 46)">
        <g stroke="#2a1a3d" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-4-1Q-11-9-17-4M-5 1Q-13 0-19 6M-5 4Q-13 9-17 15M-3 6Q-7 13-9 19" />
          <path d="M4-1Q11-9 17-4M5 1Q13 0 19 6M5 4Q13 9 17 15M3 6Q7 13 9 19" />
        </g>
        <ellipse cx="0" cy="5" rx="6.6" ry="8" fill="#2a1a3d" />
        <circle cx="0" cy="-4.4" r="4.8" fill="#3a2556" />
        <circle cx="-2" cy="-5.2" r="1.3" fill="#ffd37a" />
        <circle cx="2" cy="-5.2" r="1.3" fill="#ffd37a" />
        <path d="M-2.4 3.5L0 8.5L2.4 3.5" stroke="#ff7a1a" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Bat({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 64 32" aria-hidden="true">
      <g className="hd-flap">
        <path
          d="M32 15C25 3 12 3 2 11c7 0 9 4 11 9 3-4 7-4 10-1 2-3 6-4 9 0 3-4 7-3 9 0 3-3 7-3 10 1 2-5 4-9 11-9C52 3 39 3 32 15Z"
          fill="#2a1a3d"
        />
      </g>
      <path d="M27 13L28 5l3 6 3-6 1 8Z" fill="#2a1a3d" />
      <circle cx="30" cy="13" r=".9" fill="#ffd37a" />
      <circle cx="34" cy="13" r=".9" fill="#ffd37a" />
    </svg>
  );
}

function Pumpkin({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 110 96" aria-hidden="true">
      <g stroke="#b85c06" strokeWidth="1.6">
        <ellipse cx="55" cy="56" rx="46" ry="35" fill="#f08a1c" />
        <ellipse cx="30" cy="56" rx="26" ry="34" fill="#f59a2b" />
        <ellipse cx="80" cy="56" rx="26" ry="34" fill="#f59a2b" />
        <ellipse cx="55" cy="56" rx="21" ry="35" fill="#f9ad45" />
      </g>
      <path d="M50 22Q51 8 61 5l3 6Q58 13 58 24Z" fill="#5f7d2c" stroke="#3f5a1b" strokeWidth="1.2" />
      <g fill="#ffe27a" className="hd-ember">
        <path d="M31 50L43 50L37 38Z" />
        <path d="M67 50L79 50L73 38Z" />
        <path d="M52 58L58 58L55 52Z" />
        <path d="M30 64Q55 86 80 64L75 64L71 69L64 63L55 71L46 63L39 69L35 64Z" />
      </g>
    </svg>
  );
}

/** Behind the page: cobwebs in the top corners, showing wherever the page is clear. */
export function HalloweenBack() {
  return (
    <>
      <Cobweb className="hd-web-tl" />
      <Cobweb className="hd-web-tr" />
    </>
  );
}

/** In front of the page, hugging the edges. */
export function HalloweenFront() {
  return (
    <>
      <div className="hd-spider-wrap">
        <Spider />
      </div>
      <Bat className="hd-bat" style={vars({ '--top': '8px', '--dur': '30s', '--delay': '-4s' })} />
      <Bat className="hd-bat hd-bat-small" style={vars({ '--top': '26px', '--dur': '38s', '--delay': '-20s' })} />
      <Ghost className="hd-ghost hd-ghost-a" style={vars({ '--dur': '7s' })} />
      <Ghost className="hd-ghost hd-ghost-b" style={vars({ '--dur': '9s', '--delay': '-3s' })} />
      <Ghost className="hd-ghost hd-ghost-c" style={vars({ '--dur': '8s', '--delay': '-5s' })} />
      <Pumpkin className="hd-pumpkin hd-pumpkin-a" />
      <Pumpkin className="hd-pumpkin hd-pumpkin-b" />
    </>
  );
}
