/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#baddff',
          300: '#7dc0ff',
          400: '#389af8',
          500: '#0e7de8',
          600: '#0260c8',
          700: '#034fa3',
          800: '#073f82',
          900: '#0c356c',
          950: '#082147',
        },
      },
    },
  },
  plugins: [],
}

