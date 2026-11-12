import type { DataColor } from '../three/palette.ts'

/**
 * Los tonos de la decoración con duya y de las rosas (D53), calculados a partir de un color de la cobertura. Son
 * colores de la vista previa (comida), no de la interfaz. Se calculan en OKLab, un espacio donde mover la luminosidad
 * no cambia el tono: un lila oscurecido sigue siendo lila (en RGB o en HSL, un pastel casi blanco viraría a rojo).
 *
 * Criterio:
 * - Más oscuro ("profundo"): la luminosidad baja a 72 % de la del color y la saturación sube 30 %, para que se lea
 *   sobre la cobertura, que casi siempre es un color pastel.
 * - Más claro: la luminosidad sube la mitad de lo que le falta para el blanco y la saturación baja a 65 %.
 * - Si el resultado se sale de los colores que se pueden mostrar, se baja la saturación hasta que cabe.
 * - Automático: la decoración usa el tono profundo, con el claro como acento. Con un color elegido, la decoración usa
 *   ese color y el acento es el tono que contrasta: el claro si el color es oscuro, el profundo si es claro.
 *
 * Un color sin saturación (el blanco) da grises y blancos: no hay tono que inventar.
 */

type Lab = { l: number; a: number; b: number }

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
const fromLinear = (channel: number) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055)

export function hexToLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** Los canales lineales de un color de OKLab; pueden salirse de 0 a 1 (fuera de lo que se puede mostrar). */
function labToLinear({ l, a, b }: Lab): [number, number, number] {
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

const inGamut = (channels: number[]) => channels.every((channel) => channel >= -0.0005 && channel <= 1.0005)

function labToHex(lab: Lab): DataColor {
  let current = lab
  // Baja la saturación (el croma) hasta que el color se pueda mostrar; con croma 0 siempre cabe.
  for (let step = 0; step < 24 && !inGamut(labToLinear(current)); step++) {
    current = { ...current, a: current.a * 0.9, b: current.b * 0.9 }
  }
  const channels = labToLinear(current).map((channel) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, channel))))) * 255))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

const withChroma = (lab: Lab, factor: number): Lab => ({ l: lab.l, a: lab.a * factor, b: lab.b * factor })

/** Un tono más oscuro del mismo color: 72 % de la luminosidad y 130 % de la saturación. */
export function deepTone(hex: string): DataColor {
  const lab = hexToLab(hex)
  return labToHex({ ...withChroma(lab, 1.3), l: lab.l * 0.72 })
}

/** Un tono más claro del mismo color: la mitad de lo que falta para el blanco y 65 % de la saturación. */
export function lightTone(hex: string): DataColor {
  const lab = hexToLab(hex)
  return labToHex({ ...withChroma(lab, 0.65), l: lab.l + (1 - lab.l) * 0.5 })
}

/** Luminosidad percibida de 0 (negro) a 1 (blanco). */
export function lightness(hex: string): number {
  return hexToLab(hex).l
}

/** Con un color claro (luminosidad desde 0.7) el acento es el tono profundo; con uno oscuro, el claro. */
const LIGHT_COLOR = 0.7

export type DecorationTones = {
  /** El color de la mayor parte de la decoración. */
  main: DataColor
  /** El otro tono: perlitas de los festones y la segunda fila de los olanes. */
  accent: DataColor
  /** Las rosas alternan sus pétalos entre estos tonos (en un color elegido, solo el principal). */
  petals: DataColor[]
}

/** Automático: toma el color de la cobertura y genera un tono profundo y otro claro del mismo color. */
export function automaticTones(cover: string): DecorationTones {
  const deep = deepTone(cover)
  const light = lightTone(cover)
  return { main: deep, accent: light, petals: [deep, light] }
}

/** Un color elegido: la decoración es de ese color, con un acento que contrasta. */
export function chosenTones(color: string): DecorationTones {
  const accent = lightness(color) >= LIGHT_COLOR ? deepTone(color) : lightTone(color)
  return { main: color as DataColor, accent, petals: [color as DataColor] }
}
