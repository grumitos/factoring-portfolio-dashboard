/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
        'merriweather': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
          '500': '#1f1f1e',
          '400': '#1f1f1e',
          '300': '#2c2c2a',
          '200': '#2c2c2a',
          '100': '#2c2c2a',
          '000': '#2c2c2a',
        },
        'text': {
          '000': '#ffffff',
          '100': '#f8f8f6',
          '200': '#c3c2b7',
          '300': '#97958c',
        },
        'border': {
          '100': '#e2e1da4d',
          '200': '#97958c66',
          '300': '#e2e1da26',
        },
        'accent-main': {
          '000': '#d97757',
          '100': '#d97757',
          '200': '#d97757',
        },
        'accent-soft': '#97958c26',
        'accent-focus': '#3886e5',
        'accent-warn': '#d97757',
        'accent-danger': '#d97757',
        'accent-success': '#c3c2b7',
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
