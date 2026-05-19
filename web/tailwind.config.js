/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fdf9f4',
          100: '#f8edd9',
          200: '#f0d7b0',
          300: '#e4b87e',
          400: '#d49650',
          500: '#c47d32',
          600: '#a66624',
          700: '#88501c',
          800: '#6e3f17',
          900: '#5a3314',
          950: '#321a09',
        },
        accent: {
          400: '#c4a882',
          500: '#a88a62',
        },
        // UniDuka brand teal for POS / active states
        duka: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: { widest: '0.15em' },
    },
  },
  plugins: [],
};
