// Loan Base Camp brand lockup — genuine vector artwork from the brand package.
// LogoMark is the icon-only mountain mark (used on the splash and tight spots);
// Logo is the full "Loan Base Camp" badge lockup. Both are the supplied SVGs,
// rendered as-is (no redraw / recolor / stretch) per the brand guidelines.

interface LogoProps {
  /** base size in px; the lockup renders at ~1.2x this height */
  size?: number;
  /** accepted for call-site compatibility; the wordmark is part of the art */
  wordmark?: number;
  /** soft drop shadow */
  glow?: boolean;
}

export function LogoMark({ size = 34, glow = false }: Omit<LogoProps, 'wordmark'>) {
  // The mountain mark sits on the brand's white panel so it reads in both themes.
  return (
    <div
      className="flex items-center justify-center bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        boxShadow: glow ? 'var(--shadow-card)' : undefined,
      }}
    >
      <img
        src="/brand/mountain-icon.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="select-none"
        style={{ width: size * 0.74, height: size * 0.74 }}
      />
    </div>
  );
}

export function Logo({ size = 34, glow = false }: LogoProps) {
  return (
    <img
      src="/brand/loan-base-camp.svg"
      alt="Loan Base Camp"
      draggable={false}
      className="block w-auto select-none"
      style={{ height: Math.round(size * 1.2), filter: glow ? 'drop-shadow(0 6px 16px rgba(0,0,0,.22))' : undefined }}
    />
  );
}
