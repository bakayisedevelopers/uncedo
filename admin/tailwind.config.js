/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',
          700: '#1e293b',
          800: '#0f172a',
          900: '#020617',
        },
        brand: {
          DEFAULT: '#0f766e',
          dark: '#115e59',
          soft: '#ccfbf1',
        },
        accent: {
          DEFAULT: '#d97706',
          soft: '#ffedd5',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
      },
      boxShadow: {
        glow: '0 24px 80px rgba(15, 118, 110, 0.18)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        'dashboard-radial':
          'radial-gradient(circle at top left, rgba(15, 118, 110, 0.22), transparent 30%), radial-gradient(circle at right center, rgba(217, 119, 6, 0.18), transparent 26%), linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.02))',
      },
    },
  },
  plugins: [],
};
