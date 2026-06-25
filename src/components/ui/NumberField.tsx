import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface NumberFieldProps {
  value: number | string;
  onChange?: (raw: string) => void;
  prefix?: string;
  suffix?: string;
  readOnly?: boolean;
  placeholder?: string;
  size?: 'md' | 'sm';
  className?: string;
  ariaLabel?: string;
}

function toText(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return value;
}

/**
 * Keep only digits and a single decimal point, drop a leading zero (so "0250" → "250"),
 * and tolerate pasted formatting like "$1,200". Empty stays empty.
 */
function sanitize(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
  v = v.replace(/^0+(?=\d)/, ''); // strip leading zeros, but keep "0" and "0.5"
  return v;
}

/**
 * Spacious numeric input with optional $ prefix / % suffix.
 *
 * Behaves like a normal text box: you can clear it, type freely without a stuck
 * leading zero, and intermediate states like "0." or "" are allowed while editing.
 * It keeps its own display buffer and only emits a clean numeric string to the parent.
 */
export function NumberField({
  value,
  onChange,
  prefix,
  suffix,
  readOnly,
  placeholder,
  size = 'md',
  className = '',
  ariaLabel,
}: NumberFieldProps) {
  const [text, setText] = useState(() => toText(value));
  const editing = useRef(false);

  // When the value changes from outside (e.g. linked fields, loading a scenario),
  // resync the display — but never clobber what the user is actively typing.
  useEffect(() => {
    if (editing.current) return;
    const nv = typeof value === 'number' ? value : parseFloat(value);
    if (parseFloat(text) !== nv) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const height = size === 'sm' ? 44 : 46;
  const fontSize = size === 'sm' ? '14.5px' : '15px';
  const padLeft = prefix ? 26 : 14;
  const padRight = suffix ? 34 : 14;
  const style: CSSProperties = {
    height,
    paddingLeft: padLeft,
    paddingRight: padRight,
    fontSize,
    opacity: readOnly ? 0.7 : 1,
  };

  const handleChange = (raw: string) => {
    const v = sanitize(raw);
    setText(v);
    onChange?.(v);
  };

  return (
    <div className="relative flex-1">
      {prefix && (
        <span className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        className={`num w-full rounded-[10px] border border-border-input bg-input text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus ${className}`}
        style={style}
        value={readOnly ? toText(value) : text}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onFocus={(e) => {
          editing.current = true;
          if (!readOnly) e.target.select();
        }}
        onBlur={() => {
          editing.current = false;
          setText(toText(value));
        }}
        onChange={onChange && !readOnly ? (e) => handleChange(e.target.value) : undefined}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
          {suffix}
        </span>
      )}
    </div>
  );
}
