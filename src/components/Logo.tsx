// LoanDr. brand mark — gradient "pulse/heartbeat" tile + wordmark.

interface LogoProps {
  /** tile size in px */
  size?: number;
  /** wordmark font size in px; 0 hides the wordmark */
  wordmark?: number;
  /** glow shadow under the tile */
  glow?: boolean;
  /** stroke color of the pulse path */
  stroke?: string;
}

export function LogoMark({ size = 34, glow = false, stroke = '#07111d' }: Omit<LogoProps, 'wordmark'>) {
  return (
    <div
      className="flex items-center justify-center bg-brand-gradient"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        boxShadow: glow ? '0 8px 24px rgba(45,212,191,.28)' : undefined,
      }}
    >
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 13h3l2 5 4-12 2 7h4" />
      </svg>
    </div>
  );
}

export function Logo({ size = 34, wordmark = 19, glow = false }: LogoProps) {
  return (
    <div className="flex items-center" style={{ gap: size * 0.32 }}>
      <LogoMark size={size} glow={glow} />
      {wordmark > 0 && (
        <span className="font-display font-bold tracking-[-0.4px]" style={{ fontSize: wordmark }}>
          Loan<span className="text-brand-teal">Dr.</span>
        </span>
      )}
    </div>
  );
}
