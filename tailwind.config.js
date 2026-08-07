/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#07111d',
        sidebar: '#0a1726',
        card: '#0c1b2c',
        input: '#091523',
        elevated: '#0e2032',
        border: {
          DEFAULT: 'rgba(140,165,195,.10)',
          input: '#21364d',
          seg: '#1c2f45',
        },
        text: {
          primary: '#e9f1fa',
          heading: '#ffffff',
          muted: '#8ba0b6',
          dim: '#869cb2',
          dim2: '#7c93aa',
          label: '#aebfd1',
          soft: '#9db4cb',
          softer: '#cdddec',
        },
        brand: {
          blue: '#2f80ed',
          'blue-light': '#5fa8f5',
          'blue-nav': '#5fb0f5',
          teal: '#2dd4bf',
        },
        good: '#34d399',
        warn: '#fbbf24',
        'warn-text': '#d9b777',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'monospace'],
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(47,128,237,.16)',
        'focus-strong': '0 0 0 3px rgba(47,128,237,.18)',
        slideover: '-20px 0 60px rgba(0,0,0,.4)',
        letter: '0 20px 50px rgba(0,0,0,.35)',
        brand: '0 8px 24px rgba(45,212,191,.28)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#2f80ed,#2dd4bf)',
        'result-card': 'linear-gradient(160deg,#0e2740,#0c1d30)',
        'login-panel': 'linear-gradient(155deg,#0a1a2e 0%,#0c2238 55%,#0a3340 100%)',
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
