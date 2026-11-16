import { useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { AuthRequestError, PASSWORD_MIN_LENGTH, register } from '../models/session.ts'
import type { LinkSent } from '../models/session.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'

type RegisterField = 'fullName' | 'email' | 'phone' | 'password' | 'acceptsTerms'

const FIELD_ORDER: RegisterField[] = ['fullName', 'email', 'phone', 'password', 'acceptsTerms']
/** Los nombres de la API para cada campo del formulario. */
const API_FIELDS: Record<string, RegisterField> = {
  full_name: 'fullName',
  email: 'email',
  phone: 'phone',
  password: 'password',
  accepts_terms: 'acceptsTerms',
}

const PHONE_SEPARATORS = /[\s().-]/g
// Solo para avisar antes de enviar; quien decide es el backend.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PASSWORD_HELP = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`
export const PASSWORD_TOO_SHORT = `Te faltan caracteres: el mínimo es ${PASSWORD_MIN_LENGTH}.`

/** Los errores que se ven antes de enviar, con los textos de RegistroError.dc.html. */
export function validateRegistration(values: { fullName: string; email: string; phone: string; password: string; acceptsTerms: boolean }) {
  const errors: Partial<Record<RegisterField, string>> = {}
  if (!values.fullName.trim()) errors.fullName = 'Escribe tu nombre.'
  if (!values.email.trim()) errors.email = 'Escribe tu correo.'
  else if (!EMAIL_SHAPE.test(values.email.trim())) errors.email = 'Escribe un correo válido, por ejemplo nombre@correo.com.'
  const phone = values.phone.replace(PHONE_SEPARATORS, '')
  if (phone && !/^[0-9]{10}$/.test(phone)) errors.phone = 'Escribe 10 dígitos, por ejemplo 55 1234 5678.'
  if (!values.password) errors.password = 'Crea una contraseña.'
  else if (values.password.length < PASSWORD_MIN_LENGTH) errors.password = PASSWORD_TOO_SHORT
  if (!values.acceptsTerms) errors.acceptsTerms = 'Acepta los términos y el aviso de privacidad para crear tu cuenta.'
  return errors
}

/**
 * El formulario de `/registro` (Registro.dc.html y RegistroError.dc.html). "Ya hay una cuenta con este correo." llega
 * con el código `email_taken` y la vista le agrega los enlaces para entrar y para recuperar la contraseña (D61, D76).
 * Crear la cuenta no abre sesión (D76): `onSuccess` recibe a qué correo fue el enlace para confirmarla.
 */
export function useRegister(onSuccess: (sent: LinkSent) => void) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [acceptsTerms, setAcceptsTerms] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<RegisterField, string>>>({})
  const [emailTaken, setEmailTaken] = useState(false)
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const refs: Record<RegisterField, RefObject<HTMLInputElement | null>> = {
    fullName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    acceptsTerms: useRef<HTMLInputElement>(null),
  }

  function show(next: Partial<Record<RegisterField, string>>, taken = false) {
    setErrors(next)
    setEmailTaken(taken)
    const first = FIELD_ORDER.find((field) => next[field])
    if (first) refs[first].current?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setNotice(null)
    const local = validateRegistration({ fullName, email, phone, password, acceptsTerms })
    if (Object.keys(local).length > 0) {
      show(local)
      return
    }
    show({})
    setSubmitting(true)
    try {
      onSuccess(await register({ fullName: fullName.trim(), email: email.trim(), phone, password, acceptsTerms }))
    } catch (error) {
      const rejection = error instanceof AuthRequestError ? error : new AuthRequestError(0, 'network')
      const fromServer: Partial<Record<RegisterField, string>> = {}
      for (const [apiField, messages] of Object.entries(rejection.fields)) {
        const field = API_FIELDS[apiField]
        if (field && messages[0]) fromServer[field] = messages[0]
      }
      if (Object.keys(fromServer).length > 0) show(fromServer, rejection.fieldCodes.email?.includes('email_taken') ?? false)
      else setNotice(authNotice(rejection))
      setSubmitting(false)
    }
  }

  const field = <T,>(value: T, onChange: (next: T) => void, name: RegisterField) => ({ value, onChange, error: errors[name] })

  return {
    fullName: field(fullName, setFullName, 'fullName'),
    email: field(email, setEmail, 'email'),
    phone: field(phone, setPhone, 'phone'),
    password: field(password, setPassword, 'password'),
    acceptsTerms: field(acceptsTerms, setAcceptsTerms, 'acceptsTerms'),
    /** Para llevar el foco al primer campo con error; aparte de los valores que pinta la vista. */
    refs,
    /** El correo ya tiene cuenta: la vista agrega "Inicia sesión". */
    emailTaken,
    notice,
    submitting,
    submit,
  }
}

export type RegisterView = ReturnType<typeof useRegister>
