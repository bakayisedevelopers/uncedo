/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F7F4',
        surface: '#FFFFFF',
        well: '#EDF0EB',
        border: '#DFE5DE',
        forest: {
          950: '#091A17',
          900: '#0D2420',
          800: '#14352F',
        },
        ink: {
          900: '#111815',
          700: '#2E3A34',
          500: '#505E56',
          400: '#6D7B73',
        },
        tealbrand: {
          800: '#094944',
          700: '#0B5D56',
          600: '#0F766E',
          500: '#14B8A6',
          100: '#D6F2ED',
          50: '#EDF9F6',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
