import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/Button';

// Backing-store resolution for the drawing canvas. The element is stretched to
// the container width via CSS; pointer coordinates are mapped to this resolution
// on the fly, so the signature stays crisp regardless of the rendered size.
const CANVAS_W = 560;
const CANVAS_H = 170;
const INK = '#1b2733';

interface SignaturePadProps {
  /** Current signature as a PNG data URL (empty string = none). */
  value: string;
  /** Called with a new data URL when the signature changes, or '' when cleared. */
  onChange: (dataUrl: string) => void;
}

/**
 * Capture a signature two ways — draw it with a mouse/finger, or upload an image.
 * Both produce a transparent PNG data URL so the signature overlays the letter
 * cleanly. The drawn canvas keeps a transparent background (only the ink is
 * painted), so `toDataURL` yields exactly what the letter needs.
 */
export function SignaturePad({ value, onChange }: SignaturePadProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Prepare the 2D context once (and whenever we switch back to draw mode).
  useEffect(() => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
  }, [mode]);

  const pointFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasInk) onChange(canvas.toDataURL('image/png'));
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange('');
  };

  const onUpload = (file: File | undefined) => {
    setUploadError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file (PNG, JPG, or SVG).');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setUploadError('That image is over 4 MB — please use a smaller file.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setUploadError('Could not read that file. Try another image.');
    reader.onload = () => onChange(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-[10px] border border-border-input bg-input p-3">
      <div className="mb-2.5 inline-flex rounded-[9px] border border-border-seg bg-app p-0.5 text-[12.5px]">
        {(['draw', 'upload'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`cursor-pointer rounded-[7px] px-3 py-1 font-semibold transition-colors ${
              mode === m ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-soft'
            }`}
          >
            {m === 'draw' ? 'Draw' : 'Upload'}
          </button>
        ))}
      </div>

      {mode === 'draw' ? (
        <div>
          <div className="relative overflow-hidden rounded-[8px] border border-border-input bg-white">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              className="block h-[150px] w-full cursor-crosshair touch-none"
            />
            {/* Signing guideline + prompt, hidden once ink is on the canvas. */}
            <div className="pointer-events-none absolute inset-x-5 bottom-8 border-b border-[#c9d2dd]" />
            {!hasInk && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[#9aa7b6]">
                Sign here with your mouse or finger
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] text-text-dim">Drawn on a transparent background so it sits right on the letter.</span>
            <Button variant="ghost" size="sm" onClick={clearDrawing} disabled={!hasInk && !value}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-border-input bg-app px-4 py-6 text-center transition-colors hover:border-brand-teal">
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                onUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <span className="text-[13px] font-semibold text-text-soft">Choose a signature image…</span>
            <span className="mt-1 text-[11.5px] text-text-muted">
              PNG, JPG, or SVG. A <strong>transparent PNG</strong> blends in best.
            </span>
          </label>
          {uploadError && <div className="mt-2 text-[11.5px] text-danger">{uploadError}</div>}
        </div>
      )}

      {value && (
        <div className="mt-3 flex items-center gap-3 rounded-[8px] border border-border-input bg-white px-3 py-2">
          <img src={value} alt="Signature preview" className="h-10 w-auto max-w-[180px] object-contain" />
          <span className="text-[11.5px] font-semibold text-[#3a4a3a]">Current signature</span>
        </div>
      )}
    </div>
  );
}
