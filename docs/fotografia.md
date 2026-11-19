# Fotografía de producto

Cada pastel del catálogo se entrega como un PNG recortado con fondo transparente. Todas las fotos se toman igual para que el catálogo se vea como una sola vitrina y para que el pastel 3D del cotizador coincida con los reales.

## Montaje

- Junto a una ventana con luz de día indirecta, sin sol directo. Apaga las luces del techo para no mezclar colores de luz.
- Del lado opuesto a la ventana, una cartulina blanca de pie que rebote luz y suavice las sombras.
- Detrás del pastel, una cartulina lisa de un color que contraste con él: gris medio para pasteles claros, blanco para pasteles oscuros. Deja unos 50 cm entre el pastel y el fondo para que no le caiga sombra.
- El pastel sobre una base lisa, al centro de la mesa. Marca con cinta la posición del pastel y la del teléfono para repetirlas en todas las fotos.

## Toma

- Usa el lente de 2x o 3x del teléfono, a 1.5 m más o menos. El lente de 1x deforma el pastel de cerca.
- Coloca la cámara a la altura del piso más alto del pastel, inclinada unos 15° hacia abajo y de frente. La decoración principal mira a la cámara.
- Fija el teléfono en un tripié o sobre una pila de libros.
- No uses el modo retrato: su desenfoque falso arruina el recorte.
- Mantén presionado sobre el pastel en la pantalla para fijar el enfoque y la exposición.
- Una foto principal por pastel. Si el corte importa (rebanadas, sabores, rellenos), toma también una del pastel partido con el mismo ángulo.
- Las bases y stands que se prestan se fotografían igual, solos.

## Edición con Gemini

Antes del recorte, la luz, el balance de blancos y el fondo se pueden mejorar con Gemini, sin cambiar nada del pastel. La instrucción y la revisión están en [`fotografia-edicion.md`](fotografia-edicion.md).

## Recorte

- Quita el fondo con cualquier herramienta que lo haga: la función de aislar el sujeto del iPhone o del Mac, Photoshop o Canva.
- Revisa los bordes al 100% de zoom. No deben quedar restos del fondo, de la mesa ni un halo claro alrededor.
- No dejes la sombra de la foto: el sitio pone su propia sombra de contacto.

## Exportación

- PNG con transparencia, en sRGB, sobre un lienzo de 2000 × 2000 px.
- El pastel va centrado en horizontal, con su base a 160 px del borde inferior. Así todos los pasteles quedan apoyados en la misma línea.
- Los pasteles completos miden como máximo 1600 px de alto o de ancho. Las rebanadas, los postres individuales y las bases, como máximo 1200 px.
- Comprime cada archivo sin perder la transparencia (por ejemplo, con TinyPNG o Squoosh) para que pese menos de 1.5 MB. El PNG es el original; el sitio puede generar versiones más ligeras a partir de él.

## Nombres de archivo

- En minúsculas, con guiones, sin acentos, sin ñ y sin guion bajo. El admin no acepta otra forma: el campo "archivo de la foto" solo recibe letras minúsculas, números y guiones, con extensión `webp`, `jpg`, `jpeg`, `png` o `avif`.
- Un producto del catálogo usa su identificador del admin (el `slug`, la última parte de la dirección de su ficha). Así la foto y el producto se encuentran sin adivinar, aunque dos productos compartan sabor (hay tres de zarzamora y dos de cajeta).
    - El pastel completo, que es el mismo en la vitrina y por encargo: `slug.png`. Va en el campo "archivo de la foto" del producto.
    - El mini: `slug-mini.png`. La rebanada: `slug-rebanada.png`. Van en el campo "archivo de la foto" de esa presentación y reemplazan la del producto solo en ella.
    - La foto del corte lleva `-corte` al final.
    - Ejemplos: `tres-leches-de-cajeta.png`, `tres-leches-de-cajeta-mini.png`, `tres-leches-de-cajeta-rebanada.png`, `tres-leches-con-flan-y-cajeta-corte.png`, `imposible.png`.
- Lo que no es un producto del catálogo usa `categoria-nombre.png`, con las categorías `boda`, `xv`, `cumple`, `infantil` y `base`. Ejemplos: `boda-tres-pisos-vainilla.png`, `base-dorada.png`.
- La imagen del modelo 3D que usan la cuadrícula del catálogo y la portada lleva `-modelo` al final y es WebP: `slug-modelo.webp` (D86). No se toma ni se sube: se genera con `npm run render:modelos` desde `frontend/`, que la guarda en `frontend/public/fotos/`. Mide 1200 × 1200 px con fondo transparente; el pastel con su base mide 958 px de ancho, va centrado y su borde inferior queda en y = 1101. Solo existe para los productos que ya tienen foto, y cada imagen copia su foto.
- La foto original, la que se toma con el teléfono, se queda con el nombre que le ponga la pastelería (por ejemplo, `Cajeta_Vitrina.jpg`), en `assets/pasteles/originales/`. Solo el archivo final sigue estas reglas.
