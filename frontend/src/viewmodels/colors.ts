import { normalizeHex } from '../models/color.ts'

/**
 * Matemática de color del selector libre. Sin React. Los colores son de comida (cobertura, decoración,
 * tinta del mensaje), no de la interfaz.
 */

/**
 * Con qué color se dibuja el selector del paso 5 cuando la pastelería no tiene ningún nombre de referencia y todavía no se elige
 * uno: solo es el punto de partida de las barras (no se guarda ni se muestra en la vista previa hasta que se elige).
 */
export const PICKER_START = '#ffffff'

/** Tono de 0 a 360, intensidad (saturación) y claridad de 0 a 100. Con decimales: así un código escrito no se redondea al volver. */
export type Hsl = { h: number; s: number; l: number }

const toHex = (channel: number) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0')

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100
  const light = l / 100
  const chroma = sat * Math.min(light, 1 - light)
  const channel = (offset: number) => {
    const k = (offset + h / 30) % 12
    return light - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return `#${toHex(channel(0))}${toHex(channel(8))}${toHex(channel(4))}`
}

/**
 * Del código al tono, la intensidad y la claridad. En el negro, el blanco y los grises el tono no está definido: se conserva el
 * de `previous`, para que la barra no salte al llegar a un extremo.
 */
export function hexToHsl(hex: string, previous: Hsl = { h: 0, s: 0, l: 0 }): Hsl {
  const color = normalizeHex(hex) ?? '#000000'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) {
    // Un gris no tiene intensidad: es 0. Solo se conserva la de `previous` si no cambia el color (en el negro y el blanco, donde
    // la intensidad no se ve), para que la barra no salte al llegar a un extremo.
    const kept = { h: previous.h, s: previous.s, l: l * 100 }
    return hslToHex(kept) === color ? kept : { h: previous.h, s: 0, l: l * 100 }
  }
  const s = delta / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / delta + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60
  return { h, s: s * 100, l: l * 100 }
}
