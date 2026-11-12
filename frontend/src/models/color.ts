/**
 * Los colores libres de "Diseña tu pastel": la cobertura, la decoración y el mensaje se eligen con cualquier color. Todos viajan
 * como `#rrggbb` en minúsculas, lo mismo que acepta el servidor (`design_layout.normalize_hex_color`). Son colores de comida y de
 * la vista previa, no de la interfaz.
 */

const FULL_HEX = /^#[0-9a-f]{6}$/i
const TYPED_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** El color `#rrggbb` en minúsculas, o `null` si no es exactamente eso (sin forma corta, sin alfa, sin nombres). */
export function normalizeHex(value: unknown): string | null {
  return typeof value === 'string' && FULL_HEX.test(value) ? value.toLowerCase() : null
}

/** `true` si el texto ya es un color `#rrggbb` (en mayúsculas o minúsculas). */
export const isHex = (value: unknown): value is string => normalizeHex(value) !== null

/**
 * Lo que la persona escribe en el campo del código: con o sin `#`, de 6 dígitos o, al terminar de escribir, de 3
 * (`#abc` es `#aabbcc`). Devuelve el color largo en minúsculas, o `null` si no es un código.
 */
export function parseTypedHex(text: string, allowShort: boolean): string | null {
  const match = TYPED_HEX.exec(text.trim())
  if (!match) return null
  const digits = match[1].toLowerCase()
  if (digits.length === 3) return allowShort ? `#${[...digits].map((digit) => digit + digit).join('')}` : null
  return `#${digits}`
}

/** El código como se le muestra a la persona: `#A1B2C3`. */
export const displayHex = (hex: string) => hex.toUpperCase()
