// Decorative layered mountain range built from shaded gradients of the Base Camp
// accent palette — alpenglow coral (red), sage (green), gold (yellow), plus glacier
// and mountain blue for depth. Purely decorative: aria-hidden, no pointer events.
// Sits behind content; anchors to the bottom and scales to fill its container.

interface MountainScapeProps {
  /** overall opacity of the illustration (0–1) */
  opacity?: number;
  /** gaussian blur in px — use a few px for a soft, distant backdrop */
  blur?: number;
  className?: string;
}

export function MountainScape({ opacity = 1, blur = 0, className = '' }: MountainScapeProps) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-full w-full ${className}`}
      viewBox="0 0 1440 520"
      preserveAspectRatio="xMidYMax slice"
      style={{ opacity, filter: blur ? `blur(${blur}px)` : undefined }}
    >
      <defs>
        {/* Soft sun glow at the horizon (gold). */}
        <radialGradient id="ms-sun" cx="50%" cy="100%" r="75%">
          <stop offset="0%" stopColor="#f3c877" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#e8b45f" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e8b45f" stopOpacity="0" />
        </radialGradient>
        {/* Far ridge — glacier/mountain blue, palest. */}
        <linearGradient id="ms-glacier" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c6d4df" />
          <stop offset="100%" stopColor="#8aa6c2" />
        </linearGradient>
        {/* Green ridge — sage to deep success green. */}
        <linearGradient id="ms-sage" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcc9ba" />
          <stop offset="60%" stopColor="#7fa389" />
          <stop offset="100%" stopColor="#4f7d63" />
        </linearGradient>
        {/* Gold ridge — warm yellow shaded. */}
        <linearGradient id="ms-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#edc074" />
          <stop offset="100%" stopColor="#a8761c" />
        </linearGradient>
        {/* Front ridge — alpenglow coral/red shaded. */}
        <linearGradient id="ms-coral" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0a08c" />
          <stop offset="55%" stopColor="#cf7d6a" />
          <stop offset="100%" stopColor="#b35a48" />
        </linearGradient>
        {/* Deep foreground base — mountain blue. */}
        <linearGradient id="ms-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f74a8" />
          <stop offset="100%" stopColor="#1c3459" />
        </linearGradient>
      </defs>

      {/* sun */}
      <circle cx="720" cy="430" r="300" fill="url(#ms-sun)" />

      {/* far glacier-blue ridge */}
      <path
        d="M0,344 L150,286 L300,332 L470,268 L640,324 L820,258 L1000,318 L1180,272 L1320,320 L1440,292 L1440,520 L0,520 Z"
        fill="url(#ms-glacier)"
        opacity="0.3"
      />
      {/* green (sage) ridge */}
      <path
        d="M0,384 L180,332 L360,380 L520,320 L700,376 L880,328 L1060,380 L1240,332 L1440,378 L1440,520 L0,520 Z"
        fill="url(#ms-sage)"
        opacity="0.55"
      />
      {/* gold ridge */}
      <path
        d="M0,404 L160,356 L340,402 L500,352 L690,404 L860,360 L1040,404 L1230,356 L1440,400 L1440,520 L0,520 Z"
        fill="url(#ms-gold)"
        opacity="0.82"
      />
      {/* coral / red alpenglow front ridge */}
      <path
        d="M0,448 L200,404 L380,452 L560,402 L760,454 L940,408 L1120,454 L1300,410 L1440,450 L1440,520 L0,520 Z"
        fill="url(#ms-coral)"
        opacity="0.9"
      />
      {/* deep blue foreground base */}
      <path
        d="M0,486 L240,458 L470,490 L700,460 L930,492 L1160,462 L1440,490 L1440,520 L0,520 Z"
        fill="url(#ms-base)"
        opacity="0.95"
      />
    </svg>
  );
}
