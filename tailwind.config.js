/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],  theme: {
    extend: {
      fontFamily: {
        'merriweather': ['Merriweather', 'serif'],
      },
      borderWidth: {
        '0.5': '0.5px',
      },
      spacing: {
        'standard': '1.2rem',    // Padding estándar para componentes (20% menos que el original de 1.5rem)
        'compact': '1rem',       // Para espacios más pequeños
        'wide': '1.5rem',        // Para espacios más amplios
      },
      colors: {
        // Backgrounds (del más oscuro al más claro)
        'bg': {
          '400': '#0F0F0E', // Más oscuro
          '300': '#141413', 
          '200': '#1F1E1D',
          '100': '#262624', // Color de fondo principal
          '000': '#30302E', // El menos oscuro
        },
        // Textos (del más claro al más oscuro)
        'text': {
          '000': '#FAF9F5', // Texto blanco
          '100': '#DEDCD1', // Texto principal
          '200': '#C2C0B6', // Texto secundario
          '300': '#9C9A92', // Texto terciario/deshabilitado
          '400': '#9C9A92', 
          '500': '#9C9A92', // Texto silenciado
        },
        // Bordes
        'border': {
          '200': '#DEDCD1', // Borde de enfoque (claro)
          '300': '#9C9A92', // Borde regular
          '400': '#9C9A92', // Borde fuerte
        },
        // Acentos
        'accent-main': {
          '000': '#C96442', // Acento primario
          '100': '#D97757', // Acento hover
          '200': '#D97757', // Acento activo
        },
        'always-black': '#000000',
        'always-white': '#FFFFFF',
        'oncolor': {
          '100': '#FFFFFF', // Texto sobre color de acento
        },
      },
    },
  },
  plugins: [],
}