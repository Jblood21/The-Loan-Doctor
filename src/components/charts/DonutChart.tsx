import { useState } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Validated categorical palette (CVD-safe, passes light+dark lightness bands). */
export const PAYMENT_COLORS = ['#0f9e8f', '#3373c4', '#b3781e', '#7c53e0', '#5b7186'];

interface Props {
  segments: DonutSegment[];
  /** Center headline (e.g. the total). */
  centerValue: string;
  centerLabel?: string;
  size?: number;
  thickness?: number;
  formatValue?: (v: number) => string;
}

/**
 * Composition donut for a monthly payment (P&I / taxes / insurance / MI). Segments
 * are drawn with a 2px gap; identity is carried by a direct-labeled legend, not
 * color alone. Hovering a legend row or arc emphasizes that slice.
 */
export function DonutChart({ segments, centerValue, centerLabel, size = 168, thickness = 22, formatValue = (v) => String(v) }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 ? 2 : 0; // px gap between segments

  let offset = 0;
  const arcs = data.map((s, i) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = frac * c;
    const dash = Math.max(0, len - gap);
    const arc = {
      color: s.color,
      dasharray: `${dash} ${c - dash}`,
      dashoffset: -offset,
      dim: active !== null && active !== i,
    };
    offset += len;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Payment breakdown, total ${centerValue}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              style={{ opacity: a.dim ? 0.28 : 1, transition: 'opacity .15s' }}
            />
          ))}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="num text-text-heading" style={{ fontSize: 22, fontWeight: 700, fill: 'currentColor' }}>
          {centerValue}
        </text>
        {centerLabel && (
          <text x="50%" y="60%" textAnchor="middle" className="text-text-muted" style={{ fontSize: 10.5, fill: 'currentColor' }}>
            {centerLabel}
          </text>
        )}
      </svg>

      <ul className="flex w-full max-w-[220px] flex-col gap-1.5">
        {data.map((s, i) => (
          <li
            key={s.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-[13px] transition-colors hover:bg-[rgba(140,165,195,0.08)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-[10px] w-[10px] flex-none rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate text-text-soft">{s.label}</span>
            </span>
            <span className="num flex-none font-medium text-text-softer">
              {formatValue(s.value)}
              <span className="ml-1.5 text-text-dim">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
