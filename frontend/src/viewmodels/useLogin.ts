import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AuthRequestError, login } from '../models/session.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'

type LoginField = 'email' | 'password'

/**
 * El formulario de `/entrar` (Login.dc.html y LoginError.dc.html): campos, errores por campo antes de enviar y el aviso
 * de un rechazo de la API. Al entrar llama a `onSuccess` (ir al destino).
 */
export function useLogin(onSuccess: () => void) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({})
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  function validate(): Partial<Record<LoginField, string>> {
    const errors: Partial<Record<LoginField, string>> = {}
    if (!email.trim()) errors.email = 'Escribe tu correo.'
    if (!password) errors.password = 'Escribe tu contraseña.'
    return errors
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const errors = validate()
    setFieldErrors(errors)
    if (errors.email || errors.password) {
      setNotice(null)
      ;(errors.email ? emailInput : passwordInput).current?.focus()
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      await login(email.trim(), password)
      onSuccess()
    } catch (error) {
      const rejection = error instanceof AuthRequestError ? error : new AuthRequestError(0, 'network')
      // Un 400 de formato trae el error por campo: va bajo su campo, no en el aviso.
      const fromServer = { email: rejection.fields.email?.[0], password: rejection.fields.password?.[0] }
      if (fromServer.email || fromServer.password) {
        setFieldErrors(fromServer)
        ;(fromServer.email ? emailInput : passwordInput).current?.focus()
        setSubmitting(false)
        return
      }
      setNotice(authNotice(rejection))
      // Como LoginError.dc.html: el correo se queda y la contraseña se vuelve a escribir.
      if (rejection.code === 'invalid_credentials') setPassword('')
      setSubmitting(false)
    }
  }

  return {
    email: { value: email, onChange: setEmail, error: fieldErrors.email },
    password: { value: password, onChange: setPassword, error: fieldErrors.password },
    /** Para llevar el foco al primer campo con error; aparte de los valores que pinta la vista. */
    refs: { email: emailInput, password: passwordInput },
    notice,
    submitting,
    submit,
  }
}

export type LoginView = ReturnType<typeof useLogin>
