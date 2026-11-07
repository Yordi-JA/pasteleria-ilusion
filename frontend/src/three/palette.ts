import { color } from '../../../design/tokens.json'

/**
 * Colores de la escena 3D, leídos de `design/tokens.json` (la misma fuente de `tokens.css` y del preset de
 * Tailwind). Es el único lugar donde la escena obtiene un color: los materiales reciben un nombre de token, nunca
 * un hexadecimal suelto. Si la paleta cambia, el pastel cambia con ella sin tocar la escena.
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

const byName = new Map(color.tokens.map((token) => [token.name, token.value]))

/** El hexadecimal de un token de color. Falla al cargar si el token no existe, en vez de pintar un color supuesto. */
export function brandColor(name: BrandColor): string {
  const value = byName.get(name)
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`El token de color "${name}" no está en design/tokens.json`)
  }
  return value
}
