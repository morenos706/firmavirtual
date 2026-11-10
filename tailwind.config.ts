import type { Config } from 'tailwindcss';

/**
 * Paleta del Manual de Marca Prebel (Brandbook v1, 2025).
 *  brand = AZUL PREBEL #40637D (color emblemático) y sus tintes
 *  navy  = GRIS PREBEL #55606B (textos y superficies sobrias)
 *  mist  = tinte del BLANCO PREBEL #E3DED8 (fondos)
 *  sec1..sec5 = colores secundarios (barra de color y estados)
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#40637D',
          50: '#ECF0F3',
          100: '#D5DEE6',
          200: '#B4C4D1',
          600: '#40637D',
          700: '#36556B',
          800: '#2C4659',
        },
        navy: { DEFAULT: '#55606B', 600: '#6A747E', 700: '#55606B', 800: '#47515B' },
        mist: '#F4F2EF',
        sand: '#E3DED8',
        sec1: '#5E8AB4',
        sec2: '#8DC8E8',
        sec3: '#5C7F71',
        sec4: '#6FA287',
        sec5: '#FF8674',
      },
      fontFamily: {
        sans: ['"Work Sans"', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(64,99,125,.06), 0 4px 16px rgba(64,99,125,.07)' },
    },
  },
  plugins: [],
};
export default config;
