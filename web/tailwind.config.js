/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#10b981',
          light: '#6ee7b7',
          dark: '#059669',
        },
      },
    },
  },
  plugins: [],
}
