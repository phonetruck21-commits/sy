/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0A1F44', 50: '#EEF3FB', 100: '#D6E1F5', 600: '#13306A', 700: '#0F2856', 800: '#0A1F44', 900: '#06142E' },
        accent: { DEFAULT: '#FFC629', 600: '#E5AC00' },
        live: '#E11D48',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      fontFamily: { sans: ['"Segoe UI"', 'Heebo', 'Rubik', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
