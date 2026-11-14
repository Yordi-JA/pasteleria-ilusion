import { useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { acknowledgeSignOut, getSessionState, logout, restoreSession, subscribeSession } from '../models/session.ts'
import type { SessionState, SessionUser } from '../models/session.ts'

/**
 * La sesión del cliente, compartida por todas las pantallas sin un contexto propio: vive en `models/session.ts` (el
 * access en memoria) y cada pantalla la observa con `useSyncExternalStore`. Solo guarda quién entró, no un estado
 * global del sitio (D62).
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState)
}

/** Al montar el marco: recupera la sesión si el navegador tiene una (la pista de la cookie). */
export function useRestoreSession() {
  useEffect(() => {
    void restoreSession()
  }, [])
}

/**
 * "Cerrar sesión". Si la persona estaba en una ruta de la cuenta, `RequireSession` la lleva a la portada (no a
 * `/entrar`), porque el estado dice desde qué ruta salió a propósito (`signedOutFrom`).
 */
export function useSignOut() {
  return logout
}

/**
 * En el marco: al llegar a otra ruta, "acaba de salir" deja de contar, así volver luego a la cuenta pide iniciar sesión
 * (y no manda otra vez a la portada).
 */
export function useSignOutAcknowledgement() {
  const { pathname } = useLocation()
  useEffect(() => {
    acknowledgeSignOut(pathname)
  }, [pathname])
}

/** El nombre para el saludo: la primera palabra del nombre completo; sin nombre, nada. */
export function firstName(user: SessionUser): string {
  return user.fullName.trim().split(/\s+/)[0] ?? ''
}
