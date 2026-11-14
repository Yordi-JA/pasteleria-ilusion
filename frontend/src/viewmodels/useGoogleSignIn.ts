import { useCallback, useEffect, useRef, useState } from 'react'
import { googleClientId, renderGoogleButton } from '../models/googleIdentity.ts'
import type { GoogleButtonPurpose } from '../models/googleIdentity.ts'
import { AuthRequestError, loginWithGoogle } from '../models/session.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'

/** `hidden`: sin client ID no hay botón; `failed`: la librería de Google no cargó. */
export type GoogleButtonStatus = 'hidden' | 'loading' | 'ready' | 'failed'

/**
 * El botón oficial de Google en `/entrar` y `/registro` (D62). Sin `VITE_GOOGLE_CLIENT_ID` no aparece y el correo
 * sigue funcionando. Si la cuenta ya tenía contraseña y quedó ligada a Google, no salta al destino: avisa primero
 * que esa contraseña dejó de servir (`linked`).
 */
export function useGoogleSignIn(purpose: GoogleButtonPurpose, onSuccess: () => void) {
  const clientId = googleClientId()
  const [status, setStatus] = useState<GoogleButtonStatus>(clientId ? 'loading' : 'hidden')
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [linked, setLinked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  // La librería guarda el callback del primer `initialize`: este ref lleva siempre el destino actual.
  const latestSuccess = useRef(onSuccess)
  useEffect(() => {
    latestSuccess.current = onSuccess
  }, [onSuccess])

  const onCredential = useCallback(async (credential: string) => {
    setSubmitting(true)
    setNotice(null)
    try {
      const { passwordRemoved } = await loginWithGoogle(credential)
      if (passwordRemoved) setLinked(true)
      else latestSuccess.current()
    } catch (error) {
      setNotice(authNotice(error instanceof AuthRequestError ? error : new AuthRequestError(0, 'network')))
    } finally {
      setSubmitting(false)
    }
  }, [])

  useEffect(() => {
    const parent = container.current
    if (!clientId || !parent) return
    let active = true
    renderGoogleButton(parent, { clientId, purpose, onCredential: (credential) => void onCredential(credential) })
      .then(() => active && setStatus('ready'))
      .catch(() => active && setStatus('failed'))
    return () => {
      active = false
    }
  }, [clientId, purpose, onCredential])

  return { status, container, notice, linked, submitting, continueAfterLink: () => latestSuccess.current() }
}

export type GoogleSignInView = ReturnType<typeof useGoogleSignIn>
