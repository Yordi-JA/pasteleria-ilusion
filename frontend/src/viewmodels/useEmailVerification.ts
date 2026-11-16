import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AuthRequestError, verifyEmail } from '../models/session.ts'
import type { LinkSent } from '../models/session.ts'
import { tokenFromHash } from './accountLinks.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'

/** Lo que `/verificar` recibe al llegar desde el registro o desde `/entrar` (estado de la navegación, no la URL). */
type VerificationRouteState = LinkSent & { justSent: true }

function readRouteState(state: unknown): VerificationRouteState | null {
  if (state === null || typeof state !== 'object') return null
  const { email, expiresInHours } = state as Record<string, unknown>
  if (typeof email !== 'string' || typeof expiresInHours !== 'number') return null
  return { email, expiresInHours, justSent: true }
}

/** Lo que `/entrar` recibe después de confirmar la cuenta: el aviso "Tu cuenta quedó confirmada." */
export const ACCOUNT_CONFIRMED_STATE = { accountConfirmed: true } as const

/** `/entrar` llegó desde una cuenta recién confirmada (estado de la navegación). */
export function cameFromConfirmation(state: unknown): boolean {
  return state !== null && typeof state === 'object' && (state as Record<string, unknown>).accountConfirmed === true
}

/** Lleva a `/verificar` diciendo a qué correo salió el enlace y cuánto vale; la espera para reenviar empieza ya. */
export function useGoToVerification() {
  const navigate = useNavigate()
  return useCallback(
    (sent: LinkSent) => navigate('/verificar', { state: { email: sent.email, expiresInHours: sent.expiresInHours, justSent: true } }),
    [navigate],
  )
}

/**
 * `idle`: "Revisa tu correo" (Verificar.dc.html). `verifying`: abriendo el enlace. `invalid`: el enlace venció, ya se
 * usó o está incompleto. `failed`: no se pudo preguntar (sin red, límite, servidor); se puede reintentar.
 */
export type VerificationPhase = 'idle' | 'verifying' | 'invalid' | 'failed'

/**
 * `/verificar` (D76). Con `#<token>` en la URL: lo guarda en memoria, lo quita de la URL (`replace`, para que no quede
 * en el historial) y llama a `POST auth/verify/`. Confirmar no abre sesión ni toca la que haya: lleva a `/entrar`, que
 * dice "Tu cuenta quedó confirmada. Entra con tu contraseña." Sin
 * token, dice a qué correo fue el enlace si llegó desde el registro o desde `/entrar`; si no (por ejemplo, abierta a
 * mano), dice "a tu correo".
 */
export function useEmailVerification() {
  const location = useLocation()
  const navigate = useNavigate()
  const sent = readRouteState(location.state)
  const hashToken = tokenFromHash(location.hash)
  const [token, setToken] = useState<string | null>(hashToken)
  const [phase, setPhase] = useState<VerificationPhase>(hashToken ? 'verifying' : 'idle')
  const [failure, setFailure] = useState<AuthNotice | null>(null)
  // StrictMode corre los efectos dos veces: el mismo enlace se abre una sola vez (el segundo intento ya no serviría).
  const openedToken = useRef<string | null>(null)
  // Otro enlace con la vista ya abierta: se toma al pintar (estado derivado de la URL), no en un efecto.
  if (hashToken && hashToken !== token) {
    setToken(hashToken)
    setPhase('verifying')
  }

  // Quitar el token de la URL sí es un efecto: sincroniza el historial del navegador.
  useEffect(() => {
    if (!tokenFromHash(location.hash)) return
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: location.state })
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  const open = useCallback(
    async (value: string) => {
      setPhase('verifying')
      setFailure(null)
      try {
        await verifyEmail(value)
        navigate('/entrar', { replace: true, state: ACCOUNT_CONFIRMED_STATE })
      } catch (caught) {
        const rejection = caught instanceof AuthRequestError ? caught : new AuthRequestError(0, 'network')
        // Un token que ni siquiera tiene forma vuelve como error del campo `token`: es el mismo enlace que no sirve.
        if (rejection.code === 'invalid_link' || rejection.fields.token) {
          setPhase('invalid')
          return
        }
        setFailure(authNotice(rejection))
        setPhase('failed')
      }
    },
    [navigate],
  )

  useEffect(() => {
    if (!token || openedToken.current === token) return
    openedToken.current = token
    void open(token)
  }, [token, open])

  return {
    phase,
    /** El correo al que fue el enlace y sus horas, o `null` sin estado. */
    sent,
    /** Por qué no se pudo preguntar (en `failed`). */
    failure,
    /** Vuelve a abrir el mismo enlace, que sigue en memoria (en `failed`). */
    retry: () => {
      if (token) void open(token)
    },
  }
}
