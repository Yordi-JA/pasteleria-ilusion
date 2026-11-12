import type { CoverageColorOption } from '../models/cakeDesign.ts'
import { displayHex, normalizeHex } from '../models/color.ts'
import { hexToLab } from './decorationTones.ts'

/**
 * Matemática de color del selector libre y del "parecido a". Sin React. Los colores son de comida (cobertura, decoración,
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

/** La distancia entre dos colores en OKLab (ΔE_OK): cuánto se parecen a la vista, no cuánto cambian sus canales RGB. */
export function colorDistance(a: string, b: string): number {
  const [x, y] = [hexToLab(a), hexToLab(b)]
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/**
 * Hasta qué distancia (ΔE_OK) un color de la lista se considera "parecido": más lejos no se da nombre, solo se muestran la muestra
 * y el código. Medido con la lista de la semilla: los 11 colores se nombran a sí mismos (0) y los colores vivos razonables sí
 * tienen nombre (#ff0000 a 0.09 de Rojo, #4dc707 a 0.16 de Verde, #8a2be2 a 0.17 de Azul fuerte, #0000ff a 0.22 de Azul fuerte),
 * mientras que el negro (0.57) y el #333333 (0.26) quedan sin nombre porque la lista no tiene colores oscuros.
 */
export const MAX_NAME_DISTANCE = 0.25
/** Croma (colorido) en OKLab por debajo del cual un color es gris, y por encima del cual uno de la lista no se parece a un gris. */
const ACHROMATIC_CHROMA = 0.03
const CHROMATIC_CHROMA = 0.05

const chromaOf = (hex: string) => {
  const { a, b } = hexToLab(hex)
  return Math.hypot(a, b)
}

/**
 * El nombre del color de la lista de la pastelería más cercano a `hex` (el primero si dos empatan); `null` si la lista está
 * vacía, si el más cercano pasa de `MAX_NAME_DISTANCE` o si `hex` es un gris y el candidato tiene color (un gris no se parece a
 * un café, aunque sea lo más cercano). La lista ya no limita lo que se elige: es solo una tabla de nombres de referencia.
 */
export function nearestColorName(hex: string, references: readonly CoverageColorOption[]): string | null {
  const gray = chromaOf(hex) < ACHROMATIC_CHROMA
  let best: { name: string; distance: number } | null = null
  for (const reference of references) {
    const color = normalizeHex(reference.previewColor)
    if (!color || (gray && chromaOf(color) > CHROMATIC_CHROMA)) continue
    const distance = colorDistance(hex, color)
    if (!best || distance < best.distance) best = { name: reference.name, distance }
  }
  return best && best.distance <= MAX_NAME_DISTANCE ? best.name : null
}

/** "#A1B2C3" o, si hay un nombre parecido, "#A1B2C3, parecido a rosa". */
export function colorPhrase(hex: string, references: readonly CoverageColorOption[]): string {
  const name = nearestColorName(hex, references)
  return name ? `${displayHex(hex)}, parecido a ${name.charAt(0).toLowerCase()}${name.slice(1)}` : displayHex(hex)
}
