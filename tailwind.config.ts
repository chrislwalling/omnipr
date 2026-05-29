import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'omni-navy': '#003E52',
        'omni-navy-dark': '#002535',
        'omni-navy-light': '#005670',
        'omni-gold': '#C8A45A',
        'omni-gold-light': '#E8D5A3',
        'omni-black': '#000000',
        'omni-white': '#FFFFFF',
        'score-high': '#C8A45A',
        'score-medium': '#003E52',
        'score-low': '#6B7280',
        'status-green': '#16A34A',
        'status-yellow': '#D97706',
        'status-red': '#DC2626',
        'border': '#E5E7EB',
        'surface': '#F9FAFB',
        'surface-dark': '#F3F4F6',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      fontFamily: {
        heading: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
