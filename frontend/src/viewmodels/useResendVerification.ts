import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AuthRequestError, resendVerification } from '../models/session.ts'
import { emailError, hoursText, resendWaitText } from './accountLinks.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'

/** La espera entre dos reenvíos que dibuja el mockup ("Podrás pedir otro en 0:59"). El backend limita aparte. */
export const RESEND_WAIT_MS = 60_000

/**
 * "¿No te llegó?" de `/verificar` (D76): reenvía el enlace para confirmar la cuenta y espera 60 s antes de dejar pedir
 * otro. Con `knownEmail` (recién registrada, o desde `/entrar`) no pide el correo; sin él, lo pide. `justSent`: el
 * enlace acaba de salir, así que la espera empieza ya.
 *
 * El botón queda con `aria-disabled` mientras espera, no `disabled`: así conserva el foco tras pulsarlo. La cuenta
 * regresiva cambia cada segundo y no es una región viva; lo que se anuncia una vez es `sent` (en `role="status"`).
 */
export function useResendVerification({ knownEmail, justSent }: { knownEmail: string | null; justSent: boolean }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [sentText, setSentText] = useState('')
  const [sending, setSending] = useState(false)
  const [waitUntil, setWaitUntil] = useState<number | null>(() => (justSent ? Date.now() + RESEND_WAIT_MS : null))
  const [now, setNow] = useState(() => Date.now())
  const emailInput = useRef<HTMLInputElement>(null)
  // Un doble clic no manda dos peticiones: el estado `sending` llega en el siguiente render.
  const inFlight = useRef(false)

  useEffect(() => {
    if (waitUntil === null) return undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (current >= waitUntil) setWaitUntil(null)
    }
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [waitUntil])

  const remainingMs = waitUntil === null ? 0 : waitUntil - now
  const waiting = remainingMs > 0

  async function resend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (waiting || inFlight.current) return
    const target = knownEmail ?? email.trim()
    if (!knownEmail) {
      const problem = emailError(email)
      setError(problem)
      if (problem) {
        emailInput.current?.focus()
        return
      }
    }
    inFlight.current = true
    setSending(true)
    setNotice(null)
    setSentText('')
    try {
      const hours = await resendVerification(target)
      setSentText(`Si tu cuenta está pendiente de confirmar, te enviamos otro enlace. Vence en ${hoursText(hours)}.`)
      const sentAt = Date.now()
      setNow(sentAt)
      setWaitUntil(sentAt + RESEND_WAIT_MS)
    } catch (caught) {
      const rejection = caught instanceof AuthRequestError ? caught : new AuthRequestError(0, 'network')
      const fieldError = rejection.fields.email?.[0]
      if (fieldError && !knownEmail) {
        setError(fieldError)
        emailInput.current?.focus()
      } else {
        setNotice(authNotice(rejection))
      }
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return {
    /** `null` cuando el correo ya se conoce: la vista no pinta el campo. */
    email: knownEmail ? null : { value: email, onChange: setEmail, error },
    /** Para llevar el foco al correo cuando falta o no tiene forma; aparte de los valores que pinta la vista. */
    refs: { email: emailInput },
    waiting,
    /** "Podrás pedir otro en 0:59" (empieza en 0:59, como el mockup), o `''` sin espera. */
    waitText: waiting ? resendWaitText(Math.max(0, Math.ceil(remainingMs / 1000) - 1)) : '',
    sending,
    /** Lo que se anuncia una vez al reenviar, en la región de estado. */
    sentText,
    notice,
    resend,
  }
}

export type ResendVerificationView = ReturnType<typeof useResendVerification>
