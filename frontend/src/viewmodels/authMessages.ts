import type { AuthRequestError } from '../models/session.ts'

/** Lo que dice el aviso de un acceso rechazado: qué pasó y cómo seguir (libro de marca, redacción). */
export type AuthNotice = { title: string; detail: string }

function waitText(seconds: number | null): string {
  if (!seconds) return 'Espera un momento e inténtalo de nuevo.'
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes === 1 ? 'Espera 1 minuto e inténtalo de nuevo.' : `Espera ${minutes} minutos e inténtalo de nuevo.`
}

const NOTICES: Record<string, (error: AuthRequestError) => AuthNotice> = {
  invalid_credentials: () => ({ title: 'El correo o la contraseña no coinciden.', detail: 'Revísalos e inténtalo de nuevo.' }),
  locked_out: (error) => ({ title: 'Demasiados intentos fallidos.', detail: `Por seguridad, pausamos el acceso con este correo. ${waitText(error.retryAfterSeconds)}` }),
  throttled: (error) => ({ title: 'Hubo muchos intentos desde esta conexión.', detail: waitText(error.retryAfterSeconds) }),
  network: () => ({ title: 'No pudimos conectar.', detail: 'Revisa tu conexión e inténtalo de nuevo.' }),
  cookies_blocked: () => ({ title: 'Tu navegador bloquea las cookies de este sitio.', detail: 'Actívalas para entrar: guardan tu sesión.' }),
  account_exists: () => ({ title: 'Ya hay una cuenta con este correo.', detail: 'Entra con tu correo y contraseña.' }),
  google_conflict: () => ({ title: 'Este correo ya está ligado a otra cuenta de Google.', detail: 'Entra con esa cuenta de Google o con tu correo y contraseña.' }),
  inactive: () => ({ title: 'Esta cuenta está desactivada.', detail: 'Escríbenos por WhatsApp para revisarla.' }),
  google_email_unverified: () => ({ title: 'Tu correo de Google no está verificado.', detail: 'Verifícalo en Google o entra con tu correo.' }),
  google_disabled: () => ({ title: 'Por ahora no se puede entrar con Google.', detail: 'Entra con tu correo.' }),
  google_unavailable: () => ({ title: 'No pudimos conectar con Google.', detail: 'Inténtalo de nuevo en un momento o entra con tu correo.' }),
  google_invalid: () => ({ title: 'No pudimos entrar con Google.', detail: 'Inténtalo de nuevo o entra con tu correo.' }),
}

/** El aviso de un error del acceso; uno desconocido (un 403 de CSRF, un 500) pide recargar. */
export function authNotice(error: AuthRequestError): AuthNotice {
  return NOTICES[error.code]?.(error) ?? { title: 'No pudimos completar el acceso.', detail: 'Recarga la página e inténtalo de nuevo.' }
}
