/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sw-black': '#0a0a0a',
        'sw-dark': '#1a1a2e',
        'sw-darker': '#0f0f1a',
        'sw-gold': '#FF6B35',
        'sw-blue': '#4BD5EE',
        'sw-red': '#FF2D2D',
        'sw-green': '#00FF00',
        'sw-gray': '#4a4a4a',
        'sw-light': '#f0f0f0',
        'sw-purple': '#9D4EDD',
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'sans-serif'],
        'space': ['Space Mono', 'monospace'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(255, 107, 53, 0.3)',
        'glow-blue': '0 0 20px rgba(75, 213, 238, 0.3)',
        'glow-red': '0 0 20px rgba(255, 45, 45, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(255, 107, 53, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(255, 107, 53, 0.8)' },
        }
      }
    },
  },
  plugins: [],
}
