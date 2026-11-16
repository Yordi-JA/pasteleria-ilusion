/**
 * Lo que comparten `/verificar` y `/recuperar` (D76): el token del fragmento de la URL, los plazos en palabras y la
 * revisión del correo antes de enviar. Sin React.
 */

/** Lo que mide como mucho un token de enlace; más largo no es un token (el backend tiene el mismo tope). */
const MAX_TOKEN_LENGTH = 128
// Solo para avisar antes de enviar; quien decide es el backend. La misma forma que el registro.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El token de `#<token>`, o `null` si no hay. Uno que no cabe se manda igual: el backend dice que no sirve. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash
  return token ? token.slice(0, MAX_TOKEN_LENGTH + 1) : null
}

/** "1 hora", "24 horas". */
export function hoursText(hours: number): string {
  return hours === 1 ? '1 hora' : `${hours} horas`
}

/** "Podrás pedir otro en 0:59" (Verificar.dc.html). */
export function resendWaitText(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `Podrás pedir otro en ${minutes}:${String(rest).padStart(2, '0')}`
}

/** El error del correo antes de enviar, con los textos del registro; `undefined` si se puede enviar. */
export function emailError(value: string): string | undefined {
  const email = value.trim()
  if (!email) return 'Escribe tu correo.'
  if (!EMAIL_SHAPE.test(email)) return 'Escribe un correo válido, por ejemplo nombre@correo.com.'
  return undefined
}
