import type { Config } from 'tailwindcss';

// Charte Moka Studio
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terracotta: { DEFAULT: '#B66B50', 600: '#A35C43', 700: '#8A4C37', 50: '#F7ECE7', 100: '#EED6CB' },
        creme: '#F8F4EF',
        beige: { DEFAULT: '#EDE3D8', 300: '#E2D4C4' },
        anthracite: { DEFAULT: '#292724', 700: '#45423D', 500: '#6E6A63', 300: '#A39E95' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(41,39,36,.04), 0 1px 1px rgba(41,39,36,.03)' },
    },
  },
  plugins: [],
} satisfies Config;
