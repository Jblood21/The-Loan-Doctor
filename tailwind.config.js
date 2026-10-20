/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Base Camp semantic names (preferred going forward) ---
        surface: {
          DEFAULT: 'var(--surface)',
          sunken: 'var(--surface-sunken)',
          tint: 'var(--surface-tint)',
          'tint-strong': 'var(--surface-tint-strong)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
        'on-brand': 'var(--on-brand)',
        'accent-hot': 'var(--accent-hot)',
        'on-accent-hot': 'var(--on-accent-hot)',
        success: {
          DEFAULT: 'var(--success)',
          tint: 'var(--success-tint)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          tint: 'var(--warning-tint)',
        },
        'danger-tint': 'var(--danger-tint)',
        'border-control': 'var(--border-control)',
        'ridge-light': 'var(--ridge-light)',
        glacier: 'var(--glacier)',
        sage: 'var(--sage)',
        'coral-deep': 'var(--coral-deep)',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
        },

        // --- Legacy names kept as aliases onto the token system, so existing
        //     components re-theme automatically without edits. ---
        app: 'var(--surface-sunken)',
        sidebar: 'var(--surface)',
        card: 'var(--surface)',
        input: 'var(--surface)',
        elevated: 'var(--surface-tint)',
        border: {
          DEFAULT: 'var(--border)',
          input: 'var(--border-control)',
          control: 'var(--border-control)',
          seg: 'var(--border-control)',
        },
        text: {
          primary: 'var(--ink)',
          heading: 'var(--ink)',
          muted: 'var(--ink-muted)',
          dim: 'var(--ink-muted)',
          dim2: 'var(--ink-muted)',
          label: 'var(--ink)',
          soft: 'var(--ink-muted)',
          softer: 'var(--ink-muted)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          pressed: 'var(--brand-pressed)',
          blue: 'var(--brand)',
          'blue-light': 'var(--brand)',
          'blue-nav': 'var(--brand)',
          teal: 'var(--brand)',
        },
        good: 'var(--success)',
        warn: 'var(--warning)',
        'warn-text': 'var(--warning)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Figtree', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        focus: '0 0 0 3px var(--ring-shadow)',
        'focus-strong': '0 0 0 3px var(--ring-shadow)',
        card: 'var(--shadow-card)',
        slideover: 'var(--shadow-raised)',
        letter: 'var(--shadow-raised)',
        brand: 'var(--shadow-card)',
      },
      backgroundImage: {
        // Flat fills only (Base Camp: no gradients). Kept as image tokens so the
        // existing bg-* class names continue to work.
        'brand-gradient': 'linear-gradient(0deg, var(--brand), var(--brand))',
        'result-card': 'linear-gradient(0deg, var(--surface-tint), var(--surface-tint))',
        'login-panel': 'linear-gradient(0deg, var(--surface-tint), var(--surface-tint))',
      },
      keyframes: {
        'lp-fade': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'lp-spin': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'lp-fade': 'lp-fade .35s ease',
        'lp-fade-slow': 'lp-fade .5s ease',
        'lp-spin': 'lp-spin .8s linear infinite',
      },
      maxWidth: {
        content: '1180px',
      },
    },
  },
  plugins: [],
};
