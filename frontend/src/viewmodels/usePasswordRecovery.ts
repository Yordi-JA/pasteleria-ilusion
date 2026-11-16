import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AuthRequestError, confirmPasswordReset, PASSWORD_MIN_LENGTH, requestPasswordReset } from '../models/session.ts'
import { emailError, hoursText, tokenFromHash } from './accountLinks.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'
import { DEFAULT_AFTER_LOGIN } from './returnPath.ts'
import { PASSWORD_TOO_SHORT } from './useRegister.ts'

/** Pedir el enlace (Recuperar.dc.html): el correo y el mensaje neutro, igual exista o no la cuenta. */
function useResetRequest() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [sentText, setSentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const problem = emailError(email)
    setError(problem)
    setNotice(null)
    setSentText('')
    if (problem) {
      emailInput.current?.focus()
      return
    }
    const target = email.trim()
    setSubmitting(true)
    try {
      const hours = await requestPasswordReset(target)
      setSentText(
        `Si hay una cuenta con ${target}, te enviamos un enlace para crear una contraseña nueva. Vence en ${hoursText(hours)}. ` +
          'Si no llega, revisa la carpeta de correo no deseado.',
      )
    } catch (caught) {
      const rejection = caught instanceof AuthRequestError ? caught : new AuthRequestError(0, 'network')
      const fieldError = rejection.fields.email?.[0]
      if (fieldError) {
        setError(fieldError)
        emailInput.current?.focus()
      } else {
        setNotice(authNotice(rejection))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return { email: { value: email, onChange: setEmail, error }, emailInput, notice, sentText, submitting, submit }
}

/** Crear la contraseña nueva con el enlace: las reglas del registro y, al guardarla, la sesión nueva. */
function useNewPassword(token: string | null, onInvalidLink: () => void) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordInput = useRef<HTMLInputElement>(null)

  function show(problem: string) {
    setError(problem)
    passwordInput.current?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !token) return
    setNotice(null)
    if (!password) return show('Escribe la contraseña nueva.')
    if (password.length < PASSWORD_MIN_LENGTH) return show(PASSWORD_TOO_SHORT)
    setError(undefined)
    setSubmitting(true)
    try {
      await confirmPasswordReset(token, password)
      navigate(DEFAULT_AFTER_LOGIN, { replace: true })
    } catch (caught) {
      const rejection = caught instanceof AuthRequestError ? caught : new AuthRequestError(0, 'network')
      setSubmitting(false)
      if (rejection.code === 'invalid_link' || rejection.fields.token) {
        onInvalidLink()
        return
      }
      const fieldError = rejection.fields.new_password?.[0]
      if (fieldError) show(fieldError)
      else setNotice(authNotice(rejection))
    }
  }

  return { password: { value: password, onChange: setPassword, error }, passwordInput, notice, submitting, submit }
}

/**
 * `/recuperar` (D76). Sin token es el formulario del mockup: pide el correo y, al enviar, dice lo mismo exista o no la
 * cuenta. Con `#<token>` es "Crea tu nueva contraseña": guarda el token en memoria, lo quita de la URL (`replace`) y,
 * al guardar, la sesión nueva lleva a `/cuenta`. Un enlace que ya no sirve vuelve al formulario del correo y lo dice.
 */
export function usePasswordRecovery() {
  const location = useLocation()
  const navigate = useNavigate()
  const hashToken = tokenFromHash(location.hash)
  const [token, setToken] = useState<string | null>(hashToken)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const { emailInput, ...request } = useResetRequest()
  const { passwordInput, ...reset } = useNewPassword(token, () => {
    setToken(null)
    setLinkInvalid(true)
  })
  // Otro enlace con la vista ya abierta: se toma al pintar (estado derivado de la URL), no en un efecto.
  if (hashToken && hashToken !== token) {
    setToken(hashToken)
    setLinkInvalid(false)
  }

  // Quitar el token de la URL sí es un efecto: sincroniza el historial del navegador.
  useEffect(() => {
    if (!tokenFromHash(location.hash)) return
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: location.state })
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  return {
    mode: token ? ('reset' as const) : ('request' as const),
    /** El enlace del correo ya no sirve: el formulario del correo lo dice con `authNotice('invalid_link')`. */
    invalidLinkNotice: linkInvalid ? authNotice(new AuthRequestError(400, 'invalid_link')) : null,
    request,
    reset,
    /** Para llevar el foco al campo con error; aparte de los valores que pinta la vista. */
    refs: { email: emailInput, password: passwordInput },
  }
}
