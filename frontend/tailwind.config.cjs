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
        // "Hechos en la casa": la banda lleva dos copias de las fotos y recorre la mitad de su ancho, así el bucle no se nota.
        'galeria-desliza': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        // El salto del contador del carrito cuando llega la perla.
        'header-contador': { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
        // Retroalimentación tras una acción (22 de noviembre). Todas terminan sin nada encima (`none`), así el estado final es el
        // de siempre. El aviso de "Agregado al pedido" baja 8 px desde el botón la primera vez.
        'aviso-entrada': { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'none' } },
        // Lo que se asienta en su lugar desde el tamaño con el que llega la perla al carrito (0.6): la perla de un aviso que
        // reemplaza a otro y la palomita de un paso recién completado.
        asienta: { from: { opacity: '0', transform: 'scale(0.6)' }, to: { opacity: '1', transform: 'none' } },
        // Lo que se agrega a una lista ya visible, con el movimiento de las secciones (8 px): la fila de "Tu pastel" y el carrito vacío.
        aparece: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        // Una línea de avance que se llena de izquierda a derecha (la barra de pasos de "Diseña tu pastel").
        'tramo-lleno': { from: { transform: 'scaleX(0)' }, to: { transform: 'none' } },
        // La línea de tiempo de la confirmación: cada marcador se asienta y la línea baja al siguiente.
        hito: { from: { opacity: '0', transform: 'scale(0.8)' }, to: { opacity: '1', transform: 'none' } },
        'hito-tramo': { from: { transform: 'scaleY(0)' }, to: { transform: 'none' } },
      },
      animation: {
        esqueleto: 'esqueleto 1.4s ease-in-out infinite',
        'paso-derecha': 'paso-derecha 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        'paso-izquierda': 'paso-izquierda 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        // 450 ms con la curva `entrada`; cada pieza fija su escalón con `--entrada-retraso`. `backwards`: invisible solo mientras
        // espera su turno, y al terminar no queda ningún efecto encima.
        'home-entrada': 'home-entrada 450ms cubic-bezier(0.23, 1, 0.32, 1) var(--entrada-retraso, 0ms) backwards',
        galeria: 'galeria-desliza var(--galeria-duracion, 300s) linear infinite',
        'header-contador': 'header-contador 300ms cubic-bezier(0.23, 1, 0.32, 1)',
        'aviso-entrada': 'aviso-entrada 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        asienta: 'asienta 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        aparece: 'aparece 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        // Con `--entrada-retraso` y `backwards`, como `home-entrada`: vacía solo mientras espera su turno.
        'tramo-lleno': 'tramo-lleno 250ms cubic-bezier(0.23, 1, 0.32, 1) var(--entrada-retraso, 0ms) backwards',
        hito: 'hito 450ms cubic-bezier(0.23, 1, 0.32, 1) var(--entrada-retraso, 0ms) backwards',
        'hito-tramo': 'hito-tramo 450ms cubic-bezier(0.23, 1, 0.32, 1) var(--entrada-retraso, 0ms) backwards',
      },
      // Curva de entrada fuerte (ease-out) para lo que aparece, como la escena 3D de la portada (D48).
      transitionTimingFunction: { entrada: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    },
  },
};
