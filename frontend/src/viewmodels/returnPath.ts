/**
 * A dónde vuelve la persona después de entrar o crear su cuenta: `?volver=/carrito`. Solo rutas del propio sitio, para
 * que un enlace no la mande a otra página después de iniciar sesión (redirección abierta).
 */
export const RETURN_PARAM = 'volver'
export const DEFAULT_AFTER_LOGIN = '/cuenta'

const ACCESS_ROUTES = ['/entrar', '/registro']

function hasControlCharacters(text: string): boolean {
  return Array.from(text).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
}

export function safeReturnPath(raw: string | null | undefined): string {
  // `\` cuenta como `/` para el navegador: `/\otro.sitio` saldría del sitio.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || hasControlCharacters(raw)) {
    return DEFAULT_AFTER_LOGIN
  }
  let url: URL
  try {
    url = new URL(raw, 'https://sitio.invalid')
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
  if (url.origin !== 'https://sitio.invalid' || ACCESS_ROUTES.includes(url.pathname)) return DEFAULT_AFTER_LOGIN
  return `${url.pathname}${url.search}${url.hash}`
}

/** `/entrar?volver=...` o `/registro?volver=...`, sin el parámetro cuando el destino es el de siempre. */
export function accessLink(route: '/entrar' | '/registro', returnTo: string): string {
  return returnTo === DEFAULT_AFTER_LOGIN ? route : `${route}?${new URLSearchParams({ [RETURN_PARAM]: returnTo }).toString()}`
}
