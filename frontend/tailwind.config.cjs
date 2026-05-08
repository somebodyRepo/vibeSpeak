/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        body: ['Open Sans', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
        },
        secondary: '#F97316',
        surface: '#F8FAFC',
        card: '#E8E8E8',
      },
    },
  },
  plugins: [],
}
