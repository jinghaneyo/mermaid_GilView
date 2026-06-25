/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // React Flow가 colorMode=dark 시 .react-flow 에 .dark 클래스를 붙임
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
