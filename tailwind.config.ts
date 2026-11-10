import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#176B52',
          50: '#E8F3EF',
          100: '#CFE6DD',
          600: '#176B52',
          700: '#125642',
          800: '#0E4334',
        },
        navy: { DEFAULT: '#172C3C', 700: '#172C3C', 800: '#10202D', 600: '#24435A' },
        mist: '#F2F5F4',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(23,44,60,.06), 0 4px 16px rgba(23,44,60,.06)' },
    },
  },
  plugins: [],
};
export default config;
