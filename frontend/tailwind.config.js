/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        innogen: {
          bg: '#050505',
          card: '#111111',
          'card-hover': '#181818',
          primary: '#F8F2D8',
          secondary: 'rgba(248,242,216,0.65)',
          border: 'rgba(255,255,255,0.08)',
          glow: '#F8F2D8',
          core: '#FFF9EA',
          bloom: 'rgba(248,242,216,0.45)',
          accent: '#3B82F6',
          success: '#22C55E',
          warning: '#FACC15',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'ring-rotate': 'ring-rotate 60s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.4', filter: 'blur(15px)' },
          '100%': { opacity: '0.8', filter: 'blur(25px)' },
        },
        'ring-rotate': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
};
