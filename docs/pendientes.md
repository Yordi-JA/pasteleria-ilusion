# Pendientes

Lo que quedó abierto y todavía no se programa. Cada punto dice de dónde viene y qué falta para cerrarlo.

## Vista previa con textura de "Diseña tu pastel" (D50)

Lo construido está en D50 ([`proyecto/decisiones.md`](proyecto/decisiones.md)) y se subió a `main` y a Heroku el 8 de noviembre de 2026. Quedan estos puntos:

1. Visto bueno de la dueña sobre el aspecto. Falta revisar en el navegador, a 1440 px y a 390 px, los pasos 3, 4 y 5 con la miga del pan, el choco-vainilla en dos colores, los rellenos con fruta, galleta y granillo, el relleno con queso o con flan y la cobertura sin perlas. Las capturas de antes y después que tomó el agente quedaron en el scratchpad de la sesión del 7 de noviembre, fuera del repositorio.
2. Rellenos de Nuez y de Fresa con yogurt. La dueña no ha dicho cómo se ven y quedan lisos (`preview_style = smooth`). Cuando lo diga, se cambian en el admin; si piden un estilo que no existe (por ejemplo, trozos de nuez), hay que agregarlo a `FillingFlavor.preview_style` y a `src/three/FillingPieces.tsx`.
3. Aspecto propio del queso y del flan. Hoy la parte de queso o de flan es una franja lisa de crema, sin textura. Falta preguntar a la dueña si debe verse distinta.
4. Colores de los trozos. Los eligió el agente y no la dueña: durazno `#FBD08F`, fresa `#C8283A`, galleta `#2B1D1A`, choco vainilla `#FFFBFB`, capuchino `#5A3A28` y chocolate `#3A2218` (`FillingFlavor.preview_color_secondary`, sembrados en la migración `0015`). Se editan en el admin; falta que la dueña los confirme.
5. Granillo de dos colores. El granillo alterna el color de los trozos con el color del sabor. Si la dueña quiere dos colores distintos de esos, hace falta un campo más en el modelo.
6. Trozos solo en el costado. Las rebanadas de fruta, la galleta y el granillo están en el costado de la franja del relleno. La vista previa no tiene cara de corte; si algún día la tiene, los trozos no se verán ahí.
7. Fixture de las pruebas E2E. `frontend/e2e/support/cake-design.ts` es una copia de las opciones de la API con los estilos y colores de la semilla. Si la dueña los cambia en el admin, el fixture no cambia solo y las pruebas siguen pasando con los valores viejos.
8. Revisión de código del diff de D50. El agente que lo construyó corrió las pruebas, pero el diff no pasó por la revisión de correctitud y rendimiento antes de subirse. Falta revisar en especial `src/three/crumb.ts` (la textura y su liberación) y `src/three/FillingPieces.tsx` (mallas instanciadas).
9. Revisión de la animación y el rendimiento del 3D (`/review-animations`), obligatoria en el 3D y pendiente para esta ronda. Falta medir los cuadros por segundo en reposo con los trozos, en escritorio y en un teléfono real.
10. Revisión en el sitio desplegado. Falta abrir https://pasteleriailusion.me/pedido/disena y comprobar que las migraciones `0014` y `0015` dejaron los estilos de relleno y el choco-vainilla en dos colores también en producción.
