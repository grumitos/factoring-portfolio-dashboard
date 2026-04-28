/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        'mono': ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
        'merriweather': ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
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
          '500': 'var(--color-bg-500)',
          '400': 'var(--color-bg-400)',
          '300': 'var(--color-bg-300)',
          '200': 'var(--color-bg-200)',
          '100': 'var(--color-bg-100)',
          '000': 'var(--color-bg-000)',
        },
        'text': {
          '000': 'var(--color-text-000)',
          '100': 'var(--color-text-100)',
          '200': 'var(--color-text-200)',
          '300': 'var(--color-text-300)',
        },
        'border': {
          '100': 'var(--color-border-100)',
          '200': 'var(--color-border-200)',
          '300': 'var(--color-border-300)',
        },
        'accent-main': {
          '000': 'var(--color-accent-main-000)',
          '100': 'var(--color-accent-main-100)',
          '200': 'var(--color-accent-main-200)',
        },
        'accent-soft': 'var(--color-accent-soft)',
        'accent-focus': 'var(--color-accent-focus)',
        'accent-warn': 'var(--color-accent-warn)',
        'accent-danger': 'var(--color-accent-danger)',
        'accent-success': 'var(--color-accent-success)',
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
