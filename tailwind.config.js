/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Superficies de la más clara (000) a la más profunda (300)
        'bg': {
          '000': '#201F1C',
          '100': '#1A1917',
          '200': '#151412',
          '300': '#121110',
        },
        'text': {
          '000': '#F2EFE8',
          '100': '#D9D5CB',
          '200': '#B5B0A5',
          '300': '#8C887F',
          '400': '#66625B',
        },
        'border': {
          '200': 'rgb(255 255 255 / 0.14)',
          '300': 'rgb(255 255 255 / 0.08)',
        },
        'accent-main': {
          '000': '#C96442',
          '100': '#D97757',
        },
        'positive': '#8FBF8A',
        'warning': '#E2A857',
        'danger': '#E0715F',
      },
    },
  },
  plugins: [],
}
