/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        'merriweather': ['Merriweather', 'serif'],
      },
      borderWidth: {
        '0.5': '0.5px',
      },
      spacing: {
        'standard': '1rem',
        'compact': '0.8rem',
        'wide': '1.2rem',
      },
      colors: {
        'bg': {
          '400': '#0F0F0E',
          '300': '#141413',
          '200': '#1F1E1D',
          '100': '#262624',
          '000': '#30302E',
        },
        'text': {
          '000': '#FAF9F5',
          '100': '#DEDCD1',
          '200': '#C2C0B6',
          '300': '#9C9A92',
        },
        'border': {
          '200': '#DEDCD1',
          '300': '#9C9A92',
        },
        'accent-main': {
          '000': '#C96442',
          '100': '#D97757',
          '200': '#D97757',
        },
        'always-black': '#000000',
        'always-white': '#FFFFFF',
        'oncolor': {
          '100': '#FFFFFF',
        },
      },
    },
  },
  plugins: [],
}
