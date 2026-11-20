/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../design/tailwind.preset.js')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Brillo del esqueleto de carga (D43). Se aparta de design/referencia/esqueleto.css: en vez de mover
      // `background-position` (repinta cada bloque en cada cuadro), un ::after con este reflejo en `nata`
      // se desliza con `transform`, que se compone en la GPU. Vive aquí y no en el preset porque el preset es de `design/`.
      backgroundImage: ({ theme }) => ({
        'esqueleto-brillo': `linear-gradient(90deg, transparent 40%, ${theme('colors.nata')} 50%, transparent 60%)`,
      }),
      keyframes: {
        esqueleto: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        // La tarjeta de "Diseña tu pastel" entra desde la derecha al avanzar y desde la izquierda al regresar.
        'paso-derecha': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'none' } },
        'paso-izquierda': { from: { opacity: '0', transform: 'translateX(-24px)' }, to: { opacity: '1', transform: 'none' } },
        // Tanda 7 (D90), portada y encabezado. La entrada del hero: sube 12 px y aparece, una sola vez por carga.
        'home-entrada': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        // El salto del contador del carrito cuando llega la perla.
        'header-contador': { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        esqueleto: 'esqueleto 1.4s ease-in-out infinite',
        'paso-derecha': 'paso-derecha 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        'paso-izquierda': 'paso-izquierda 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        // 450 ms con la curva `entrada`; cada pieza fija su escalón con `--entrada-retraso`. `backwards`: invisible solo mientras
        // espera su turno, y al terminar no queda ningún efecto encima.
        'home-entrada': 'home-entrada 450ms cubic-bezier(0.23, 1, 0.32, 1) var(--entrada-retraso, 0ms) backwards',
        'header-contador': 'header-contador 300ms cubic-bezier(0.23, 1, 0.32, 1)',
      },
      // Curva de entrada fuerte (ease-out) para lo que aparece, como la escena 3D de la portada (D48).
      transitionTimingFunction: { entrada: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    },
  },
};
