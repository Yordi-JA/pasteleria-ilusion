import { color } from '../../../design/tokens.json'
import type { ShapeColor } from './cakeShape.ts'

/**
 * Colores de la escena 3D, leídos de `design/tokens.json` (la misma fuente de `tokens.css` y del preset de
 * Tailwind). Es el único lugar donde la escena obtiene un color: los materiales reciben un nombre de token, nunca
 * un hexadecimal suelto. Si la paleta cambia, el pastel cambia con ella sin tocar la escena.
 *
 * La única excepción es la comida de "Diseña tu pastel": el pan, el relleno y la cobertura se pintan con el
 * `preview_color` que la pastelería guarda en el admin para cada opción (un azul fuerte de cobertura no es un color
 * de la marca, es lo que el cliente pidió). Llegan validados como `#rrggbb` y se vuelven a validar aquí.
 */
export type BrandColor =
  | 'nata'
  | 'betun'
  | 'harina'
  | 'relieve'
  | 'fresa'
  | 'fresa-claro'
  | 'mermelada'
  | 'mermelada-suave'
  | 'frambuesa'
  | 'exito'

/** Un color de la pastelería, `#rrggbb`, tal como lo guarda el admin. */
export type DataColor = `#${string}`

/** Lo que recibe un material: un token de la marca o un color de la pastelería. */
export type SceneColor = BrandColor | DataColor

const byName = new Map(color.tokens.map((token) => [token.name, token.value]))
const HEX = /^#[0-9a-f]{6}$/i

/** El hexadecimal de un token de color. Falla al cargar si el token no existe, en vez de pintar un color supuesto. */
export function brandColor(name: BrandColor): string {
  const value = byName.get(name)
  if (!value || !HEX.test(value)) {
    throw new Error(`El token de color "${name}" no está en design/tokens.json`)
  }
  return value
}

/** El hexadecimal de cualquier color de la escena. */
export function sceneColor(value: SceneColor): string {
  if (value.startsWith('#')) {
    if (!HEX.test(value)) throw new Error(`"${value}" no es un color #rrggbb`)
    return value.toLowerCase()
  }
  return brandColor(value as BrandColor)
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/**
 * El hexadecimal de un color de la forma, mezclas incluidas (`amount` de 0, solo el primero, a 1, solo el segundo).
 * Las mezclas dan el matiz del pan según el tipo de pastel y la corteza, que se oscurece hacia `mermelada`, como el
 * prototipo.
 */
export function resolveColor(value: ShapeColor): string {
  if (typeof value === 'string') return sceneColor(value)
  const a = channels(resolveColor(value.mix[0]))
  const b = channels(resolveColor(value.mix[1]))
  const mixed = a.map((channel, i) => Math.round(channel + (b[i] - channel) * value.amount))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
