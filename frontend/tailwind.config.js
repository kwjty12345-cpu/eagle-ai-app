/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 在这里定义 eagle-bg 对应的颜色
        // 我们用一个深沉的蓝黑色作为背景，显得专业
        'eagle-bg': '#0f172a', 
        'eagle-card': '#1e293b',
        'eagle-accent': '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}