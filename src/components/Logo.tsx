// Loan Base Camp brand lockup. LogoMark is the icon-only tile (used on the splash);
// Logo is the full "Loan Base Camp" badge image (corner pixels made transparent so
// it blends on any background).

interface LogoProps {
  /** base size in px; the lockup renders at ~1.2x this height */
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

export function Logo({ size = 34, glow = false }: LogoProps) {
  return (
    <img
      src="/brand/logo-lockup.png"
      alt="Loan Base Camp"
      draggable={false}
      className="block w-auto select-none"
      style={{ height: Math.round(size * 1.2), filter: glow ? 'drop-shadow(0 6px 16px rgba(0,0,0,.22))' : undefined }}
    />
  );
}
