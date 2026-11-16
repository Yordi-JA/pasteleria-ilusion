/**
 * Los colores libres de "Diseña tu pastel": la cobertura, la decoración y el mensaje se eligen con cualquier color. Todos viajan
 * como `#rrggbb` en minúsculas, lo mismo que acepta el servidor (`design_layout.normalize_hex_color`). Son colores de comida y de
 * la vista previa, no de la interfaz.
 */

const FULL_HEX = /^#[0-9a-f]{6}$/i

/** El color `#rrggbb` en minúsculas, o `null` si no es exactamente eso (sin forma corta, sin alfa, sin nombres). */
export function normalizeHex(value: unknown): string | null {
  return typeof value === 'string' && FULL_HEX.test(value) ? value.toLowerCase() : null
}

/** `true` si el texto ya es un color `#rrggbb` (en mayúsculas o minúsculas). */
export const isHex = (value: unknown): value is string => normalizeHex(value) !== null

