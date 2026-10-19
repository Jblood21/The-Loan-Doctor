// Loan Base Camp brand lockup. LogoMark is the icon-only tile (used on the splash);
// Logo is the full badge, drawn as crisp inline SVG so it scales cleanly with no
// white edges on any background.
import { useId } from 'react';

interface LogoProps {
  /** rendered height in px (width scales to the lockup's aspect ratio) */
  size?: number;
  /** accepted for call-site compatibility; the wordmark is part of the art */
  wordmark?: number;
  /** soft drop shadow */
  glow?: boolean;
}

export function LogoMark({ size = 34, glow = false }: Omit<LogoProps, 'wordmark'>) {
  return (
    <div
      className="flex items-center justify-center bg-brand"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        boxShadow: glow ? 'var(--shadow-card)' : undefined,
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="var(--on-brand)" aria-hidden="true">
        <path d="M3 19.5 10.6 6 15 13.4 12.2 19.5Z" />
        <path d="M11.4 19.5 15.8 11.3 21 19.5Z" opacity="0.85" />
      </svg>
    </div>
  );
}

const ASPECT = 472 / 120;

export function Logo({ size = 44, glow = false }: LogoProps) {
  const clip = useId();
  const h = size * 1.25;
  const w = h * ASPECT;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 472 120"
      fill="none"
      role="img"
      aria-label="Loan Base Camp"
      className="block select-none"
      style={{ filter: glow ? 'drop-shadow(0 6px 16px rgba(0,0,0,.22))' : undefined }}
    >
      <rect x="5" y="5" width="462" height="110" rx="26" fill="#f2eee1" stroke="#1f2c3c" strokeWidth="7" />
      <clipPath id={clip}>
        <rect x="9" y="9" width="454" height="102" rx="22" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <circle cx="74" cy="78" r="31" fill="#e8977f" />
        <polygon points="18,98 78,36 138,98" fill="#8aa6c6" />
        <polygon points="58,98 110,44 162,98" fill="#4f7aa6" />
        <polygon points="104,98 144,54 184,98" fill="#26486d" />
        <polygon points="78,36 70,50 88,50" fill="#eef3f8" />
        <polygon points="110,44 103,56 118,56" fill="#eef3f8" />
        <polygon points="144,54 138,64 151,64" fill="#eef3f8" />
      </g>
      <text x="212" y="55" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="39" fill="#1f2c3c">
        Loan Base
      </text>
      <text x="212" y="99" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="39" fill="#1f2c3c">
        Camp
      </text>
    </svg>
  );
}
