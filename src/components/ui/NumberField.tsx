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

/**
 * Spacious numeric input with optional $ prefix / % suffix.
 * Padding follows the design: 14px base, +12px left when prefixed, +20px right when suffixed.
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
  return (
    <div className="relative flex-1">
      {prefix && (
        <span className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
          {prefix}
        </span>
      )}
      <input
        type="number"
        className={`num w-full rounded-[10px] border border-border-input bg-input text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus ${className}`}
        style={style}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2 text-[14px] text-text-dim">
          {suffix}
        </span>
      )}
    </div>
  );
}
