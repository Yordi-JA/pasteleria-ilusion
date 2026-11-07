/**
 * Un monto de la API como texto: `money()` tiene 10 dígitos con 2 decimales, así que la parte entera llega a 8
 * dígitos ("350.00", "99999999.99"). Es el único patrón de precio del frontend: lo usan el catálogo, el carrito
 * y `formatPrice`.
 */
export const PRICE_PATTERN = /^(\d{1,8})(?:\.(\d{1,2}))?$/

/**
 * Precio en pesos mexicanos como en el mockup: "$350", "$35.50", "$1,250". Los centavos en cero no se
 * muestran. Trabaja sobre el texto que manda la API ("350.00"), sin pasar por un número de punto flotante,
 * así nunca redondea. Un valor que no es un monto válido devuelve `null`: nunca se muestra un precio dudoso.
 */
export function formatPrice(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = PRICE_PATTERN.exec(value.trim())
  if (!match) return null
  const [, digits, cents = ''] = match
  const whole = digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = cents.padEnd(2, '0')
  return fraction === '00' ? `$${whole}` : `$${whole}.${fraction}`
}
