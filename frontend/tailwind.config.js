/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 背景：深空午夜蓝
        'eagle-dark': '#0B0F19',
        // 核心渐变色 1: 赛博紫
        'neon-purple': '#A855F7', // Purple-500
        // 核心渐变色 2: 激光蓝
        'neon-blue': '#3B82F6',   // Blue-500
        // 核心渐变色 3: 亮青色 (用于高亮)
        'neon-cyan': '#06B6D4',   // Cyan-500
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        // 定义全局主渐变背景
        'cyber-gradient': 'linear-gradient(to bottom right, #0f172a, #1e1b4b, #0f172a)',
        // 按钮渐变
        'btn-gradient': 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      }
    },
  },
  plugins: [],
}