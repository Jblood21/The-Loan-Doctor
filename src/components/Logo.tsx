// Loanbasecamp brand mark — a flat mountain tile + two-tone wordmark.

interface LogoProps {
  /** tile size in px */
  size?: number;
  /** wordmark font size in px; 0 hides the wordmark */
  wordmark?: number;
  /** soft shadow under the tile */
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
        {/* back peak */}
        <path d="M3 19.5 10.6 6 15 13.4 12.2 19.5Z" />
        {/* front peak */}
        <path d="M11.4 19.5 15.8 11.3 21 19.5Z" opacity="0.85" />
      </svg>
    </div>
  );
}

export function Logo({ size = 34, wordmark = 19, glow = false }: LogoProps) {
  return (
    <div className="flex items-center" style={{ gap: size * 0.32 }}>
      <LogoMark size={size} glow={glow} />
      {wordmark > 0 && (
        <span className="font-display font-bold tracking-[-0.4px] text-ink" style={{ fontSize: wordmark }}>
          Loan<span className="text-brand">basecamp</span>
        </span>
      )}
    </div>
  );
}
