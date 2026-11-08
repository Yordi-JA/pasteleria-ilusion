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
      },
      animation: {
        esqueleto: 'esqueleto 1.4s ease-in-out infinite',
        'paso-derecha': 'paso-derecha 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        'paso-izquierda': 'paso-izquierda 250ms cubic-bezier(0.23, 1, 0.32, 1)',
      },
      // Curva de entrada fuerte (ease-out) para lo que aparece, como la escena 3D de la portada (D48).
      transitionTimingFunction: { entrada: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    },
  },
};
