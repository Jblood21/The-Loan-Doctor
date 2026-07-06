import { useId, useRef, useState } from 'react';

export interface AreaPoint {
  x: number;
  y: number;
}

interface Props {
  points: AreaPoint[];
  height?: number;
  color?: string;
  /** Format the y value for axis + tooltip. */
  formatY?: (v: number) => string;
  /** Format the x value for the tooltip. */
  formatX?: (v: number) => string;
  yLabel?: string;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 52 };
const W = 520; // viewBox width; scales to container via width:100%

/**
 * Single-series area chart (e.g. loan balance over time). The title/caption names
 * the series, so no legend box. Faint gridlines, an emphasized endpoint, and a
 * crosshair + tooltip on hover.
 */
export function AreaChart({ points, height = 200, color = '#0f9e8f', formatY = (v) => String(Math.round(v)), formatX = (v) => String(v), yLabel }: Props) {
  const gid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const data = points.length ? points : [{ x: 0, y: 0 }];
  const xs = data.map((p) => p.x);
  const ys = data.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys, 1);
  const sx = (x: number) => PAD.left + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * innerW);
  const sy = (y: number) => PAD.top + innerH - (y / yMax) * innerH;

  const line = data.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(xMax).toFixed(1)} ${PAD.top + innerH} L${sx(xMin).toFixed(1)} ${PAD.top + innerH} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (yMax * i) / ticks);

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W; // viewBox x
    // nearest point by x
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(sx(data[i].x) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hp = hover !== null ? data[hover] : null;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={yLabel || 'Chart'}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={sy(t)} x2={W - PAD.right} y2={sy(t)} stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.5" />
            <text x={PAD.left - 8} y={sy(t) + 3} textAnchor="end" className="num text-text-dim" style={{ fontSize: 10, fill: 'currentColor' }}>
              {formatY(t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#fill-${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* emphasized endpoint */}
        <circle cx={sx(data[data.length - 1].x)} cy={sy(data[data.length - 1].y)} r="3.5" fill={color} />

        {/* hover crosshair */}
        {hp && (
          <g>
            <line x1={sx(hp.x)} y1={PAD.top} x2={sx(hp.x)} y2={PAD.top + innerH} stroke={color} strokeWidth="1" opacity="0.5" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r="4" fill={color} stroke="var(--chart-surface, #101d2c)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] shadow-letter"
          style={{ left: `${(sx(hp.x) / W) * 100}%`, top: (sy(hp.y) / H) * height - 8 }}
        >
          <div className="num font-semibold text-text-heading">{formatY(hp.y)}</div>
          <div className="text-text-muted">{formatX(hp.x)}</div>
        </div>
      )}
    </div>
  );
}
