import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/Button';

// Backing-store resolution for the drawing canvas. The element is stretched to
// the container width via CSS; pointer coordinates are mapped to this resolution
// on the fly, so the signature stays crisp regardless of the rendered size.
const CANVAS_W = 560;
const CANVAS_H = 170;
const INK = '#1b2733';

type Mode = 'draw' | 'type' | 'upload';

// Bundled script fonts (see index.css @font-face + public/fonts). `size` balances
// the visual weight across fonts that render large/small at the same pixel size.
interface SigFont {
  id: string;
  family: string;
  label: string;
  size: number;
}
const SIGNATURE_FONTS: SigFont[] = [
  { id: 'dancing', family: 'Dancing Script', label: 'Flowing', size: 1.0 },
  { id: 'greatvibes', family: 'Great Vibes', label: 'Elegant', size: 1.18 },
  { id: 'sacramento', family: 'Sacramento', label: 'Casual', size: 1.16 },
];

/**
 * Render typed text in a script font to a transparent PNG data URL. Awaits the
 * font so the canvas never falls back to a system default, and pads generously so
 * tall swashes / descenders aren't clipped.
 */
async function renderTypedSignature(text: string, family: string, sizeMul: number): Promise<string> {
  const px = 96 * sizeMul;
  const fontStr = `${px}px "${family}"`;
  try {
    await document.fonts.load(fontStr, text);
  } catch {
    /* fall back to whatever is available */
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.font = fontStr;
  const m = ctx.measureText(text);
  const padX = px * 0.4;
  const width = Math.ceil(m.width + padX * 2 + px * 0.2);
  const height = Math.ceil(px * 1.7);
  canvas.width = width;
  canvas.height = height;
  // Resizing the canvas resets the context state, so re-apply it.
  ctx.font = fontStr;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, padX, height - Math.ceil(px * 0.45));
  return canvas.toDataURL('image/png');
}

interface SignaturePadProps {
  /** Current signature as a PNG data URL (empty string = none). */
  value: string;
  /** Called with a new data URL when the signature changes, or '' when cleared. */
  onChange: (dataUrl: string) => void;
  /** Seeds the typed-signature field (e.g. the loan officer's name). */
  defaultName?: string;
}

/**
 * Capture a signature three ways — draw it, type it in a script font, or upload an
 * image. All three produce a transparent PNG data URL so the signature overlays the
 * letter cleanly and flows through the same preview/PDF pipeline.
 */
export function SignaturePad({ value, onChange, defaultName = '' }: SignaturePadProps) {
  const [mode, setMode] = useState<Mode>('draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Typed-signature state.
  const [typedName, setTypedName] = useState(defaultName);
  const [fontId, setFontId] = useState(SIGNATURE_FONTS[0].id);

  // Prepare the 2D drawing context (and whenever we switch back to draw mode).
  useEffect(() => {
    if (mode !== 'draw') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
  }, [mode]);

  // In type mode, re-render the signature image whenever the text or font changes.
  useEffect(() => {
    if (mode !== 'type') return;
    const text = typedName.trim();
    if (!text) {
      onChange('');
      return;
    }
    const font = SIGNATURE_FONTS.find((f) => f.id === fontId) || SIGNATURE_FONTS[0];
    let cancelled = false;
    renderTypedSignature(text, font.family, font.size).then((url) => {
      if (!cancelled && url) onChange(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName, fontId]);

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

  const tabs: { id: Mode; label: string }[] = [
    { id: 'draw', label: 'Draw' },
    { id: 'type', label: 'Type' },
    { id: 'upload', label: 'Upload' },
  ];

  return (
    <div className="rounded-[10px] border border-border-input bg-input p-3">
      <div className="mb-2.5 inline-flex rounded-[9px] border border-border-seg bg-app p-0.5 text-[12.5px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`cursor-pointer rounded-[7px] px-3 py-1 font-semibold transition-colors ${
              mode === t.id ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'draw' && (
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
      )}

      {mode === 'type' && (
        <div>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your name"
            aria-label="Signature name"
            className="h-10 w-full rounded-[8px] border border-border-input bg-app px-3 text-[14px] text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus"
          />
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SIGNATURE_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFontId(f.id)}
                className={`flex h-[68px] flex-col items-center justify-center overflow-hidden rounded-[8px] border bg-white px-2 transition-colors ${
                  fontId === f.id ? 'border-brand-blue ring-1 ring-brand-blue' : 'border-border-input hover:border-brand-teal'
                }`}
              >
                <span
                  className="max-w-full truncate leading-none text-[#1b2733]"
                  style={{ fontFamily: `'${f.family}', cursive`, fontSize: 26 }}
                >
                  {typedName.trim() || 'Your Name'}
                </span>
                <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-dim">{f.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11.5px] text-text-dim">Pick a style — it renders into the letter exactly as shown.</div>
        </div>
      )}

      {mode === 'upload' && (
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
