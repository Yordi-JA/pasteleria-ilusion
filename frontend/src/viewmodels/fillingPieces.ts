import type { FillingPreviewStyle } from '../models/cakeDesign.ts'
import type { CakePieces } from '../three/cakeShape.ts'
import type { DataColor } from '../three/palette.ts'

/** Los colores de la API ya llegan validados como `#rrggbb` (`models/cakeDesign.ts`). */
export function dataColor(value: string | null | undefined): DataColor | null {
  return value ? (value as DataColor) : null
}

/** Lo que lleva encima el relleno según el estilo que elige la pastelería; el fondo ya lo puso quien llama. */
export function piecesFor(style: FillingPreviewStyle, color: DataColor | null, accent: DataColor): CakePieces | null {
  switch (style) {
    case 'fruit_slices':
    case 'fruit_chunks':
    case 'cookie_chunks':
    case 'nut_pieces':
    case 'round_chips':
      return { style, colors: [accent] }
    // El granillo alterna el color de los trozos con el del sabor (si lo tiene).
    case 'sprinkles':
      return { style, colors: color ? [accent, color] : [accent] }
    // Grumitos del color del relleno, y uno de cada tres un poco más rojo (el color de los trozos).
    case 'crumbles':
      return { style, colors: color ? [color, color, accent] : [accent] }
    case 'smooth':
      return null
  }
}
