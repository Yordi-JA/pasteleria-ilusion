// Pastelería Ilusión: preset de Tailwind generado desde design/tokens.json (paleta Fresa y mermelada).
// Uso en tailwind.config.js:  presets: [require('./design/tailwind.preset.js')]
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        'nata': '#fff4f4',
        'betun': '#fffbfb',
        'harina': '#fbecec',
        'relieve': '#ecd2d2',
        'fresa': '#f9c1c1',
        'fresa-claro': '#ffdfdf',
        'mermelada': '#5e1921',
        'mermelada-suave': '#664243',
        'mermelada-profunda': '#430e15',
        'sobre-color': '#fffbfb',
        'sobre-color-suave': '#f9c1c1',
        'frambuesa': '#d24d47',
        'cajeta': '#8f5413',
        'exito': '#3f5f2a',
        'error': '#b13a14'
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['56px', { lineHeight: '1.05', fontWeight: '500', letterSpacing: '-0.01em' }],
        'titulo-1': ['40px', { lineHeight: '1.1', fontWeight: '500' }],
        'titulo-2': ['28px', { lineHeight: '1.2', fontWeight: '500' }],
        'titulo-3': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'cuerpo': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'nota': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'etiqueta': ['14px', { lineHeight: '1.3', fontWeight: '600' }]
      },
      borderRadius: { sm: '6px', md: '12px', lg: '24px' },
      boxShadow: { flotante: '0 2px 4px rgba(94, 25, 33, 0.06), 0 12px 32px rgba(94, 25, 33, 0.10)' },
    },
  },
};
