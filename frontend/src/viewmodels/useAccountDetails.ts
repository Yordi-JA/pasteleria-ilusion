import { useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { ApiError } from '../models/apiClient.ts'
import { accountFieldErrors, getAccount, updateAccount } from '../models/account.ts'
import type { Account } from '../models/account.ts'
import { AuthRequestError, changePassword, PASSWORD_MIN_LENGTH } from '../models/session.ts'
import { authNotice } from './authMessages.ts'
import type { AuthNotice } from './authMessages.ts'
import { displayPhone, PHONE_DIGITS, PHONE_SEPARATORS } from './useDelivery.ts'
import { PASSWORD_HELP, PASSWORD_TOO_SHORT } from './useRegister.ts'
import { useRemoteData } from './useRemoteData.ts'

/** Lo dicen el backend (`User.clean`, `account_service`) y la pantalla con las mismas palabras (D72). */
export const WHATSAPP_NEEDS_PHONE = 'Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales.'
export const FULL_NAME_MAX_LENGTH = 150
const PHONE_ERROR = 'Escribe 10 dígitos, por ejemplo 55 1234 5678.'

/** `/cuenta/datos` (D72): la cuenta se pide al montar y se vuelve a pedir con `retry`. */
export function useAccountDetails() {
  const { state, retry } = useRemoteData(getAccount, 'No se pudieron cargar los datos de la cuenta.')
  return { state, retry }
}

// --- Datos personales y avisos ---

type DetailsField = 'fullName' | 'phone' | 'notifyWhatsapp'
const DETAILS_ORDER: DetailsField[] = ['fullName', 'phone', 'notifyWhatsapp']
const DETAILS_API_FIELDS: Record<string, DetailsField> = { full_name: 'fullName', phone: 'phone', notify_whatsapp: 'notifyWhatsapp' }

export type SaveStatus = 'idle' | 'saving' | 'saved'

const SAVE_FAILED = 'No se pudieron guardar tus cambios.'
/** Un rechazo del servidor sin errores por campo (un 400 con `detail`, un 413, un 500): la conexión no tiene la culpa. */
const SAVE_RETRY = 'Inténtalo de nuevo en un momento.'
/** Sin red, con el corte de 10 s o sin poder renovar la sesión (`requestWithSession` da 503). */
const SAVE_OFFLINE = 'Revisa tu conexión e inténtalo de nuevo.'
/** Por qué la casilla del correo no se quita; solo para lectores de pantalla (la línea visible es el correo). */
export const EMAIL_NOTICE_NOTE = 'Siempre te avisamos por correo; esta casilla no se puede quitar.'

function saveFailureDetail(error: unknown): string {
  return error instanceof ApiError && error.status !== 503 ? SAVE_RETRY : SAVE_OFFLINE
}

/** Los errores que se ven antes de enviar; quien decide es el backend. */
export function validateDetails(values: { fullName: string; phone: string; notifyWhatsapp: boolean }) {
  const errors: Partial<Record<DetailsField, string>> = {}
  const phone = values.phone.replace(PHONE_SEPARATORS, '')
  if (!values.fullName.trim()) errors.fullName = 'Escribe tu nombre.'
  if (phone && !PHONE_DIGITS.test(phone)) errors.phone = PHONE_ERROR
  if (values.notifyWhatsapp && !phone) errors.notifyWhatsapp = WHATSAPP_NEEDS_PHONE
  return errors
}

/**
 * El formulario de "Datos personales" y "Avisos del pedido", a partir de la cuenta cargada. Guarda los tres datos juntos
 * (`PATCH account/`); el estado (guardando, guardado) se dice con palabras en una región `role="status"`, y un error
 * por campo lleva el foco al primero.
 */
export function useAccountForm(account: Account) {
  const [fullName, setFullName] = useState(account.fullName)
  const [phone, setPhone] = useState(displayPhone(account.phone))
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(account.notifyWhatsapp)
  const [errors, setErrors] = useState<Partial<Record<DetailsField, string>>>({})
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  // El estado tarda un render en verse: la ref frena el segundo envío de un doble clic.
  const savingRef = useRef(false)
  const refs: Record<DetailsField, RefObject<HTMLInputElement | null>> = {
    fullName: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    notifyWhatsapp: useRef<HTMLInputElement>(null),
  }

  function show(next: Partial<Record<DetailsField, string>>) {
    setErrors(next)
    const first = DETAILS_ORDER.find((field) => next[field])
    if (first) refs[first].current?.focus()
  }

  /** Un cambio después de guardar deja de decir "guardado". */
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setStatus((current) => (current === 'saved' ? 'idle' : current))
    }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    setNotice(null)
    const local = validateDetails({ fullName, phone, notifyWhatsapp })
    if (Object.keys(local).length > 0) {
      setStatus('idle')
      show(local)
      return
    }
    show({})
    savingRef.current = true
    setStatus('saving')
    try {
      const saved = await updateAccount({ fullName: fullName.trim(), phone: phone.replace(PHONE_SEPARATORS, ''), notifyWhatsapp })
      setFullName(saved.fullName)
      setPhone(displayPhone(saved.phone))
      setNotifyWhatsapp(saved.notifyWhatsapp)
      setStatus('saved')
    } catch (error) {
      setStatus('idle')
      const fields = accountFieldErrors(error)
      const fromServer: Partial<Record<DetailsField, string>> = {}
      const others: string[] = []
      for (const [apiField, messages] of Object.entries(fields ?? {})) {
        const field = DETAILS_API_FIELDS[apiField]
        if (field) fromServer[field] = messages[0]
        else others.push(...messages)
      }
      if (Object.keys(fromServer).length > 0) show(fromServer)
      if (others.length > 0) setNotice({ title: SAVE_FAILED, detail: others.join(' ') })
      else if (!fields) {
        console.warn(SAVE_FAILED, error)
        setNotice({ title: SAVE_FAILED, detail: saveFailureDetail(error) })
      }
    } finally {
      savingRef.current = false
    }
  }

  const field = <T,>(value: T, set: (next: T) => void, name: DetailsField) => ({ value, onChange: edit(set), error: errors[name] })

  return {
    fullName: field(fullName, setFullName, 'fullName'),
    phone: field(phone, setPhone, 'phone'),
    notifyWhatsapp: field(notifyWhatsapp, setNotifyWhatsapp, 'notifyWhatsapp'),
    email: account.email,
    /** Debajo del correo, que no se cambia (D72). */
    emailHelp: account.googleLinked ? 'Vinculado a tu cuenta de Google.' : 'Es el correo con el que entras.',
    /** Solo una cuenta con contraseña puede cambiarla; una solo de Google no ve el formulario. */
    hasPassword: account.hasPassword,
    emailNoticeNote: EMAIL_NOTICE_NOTE,
    refs,
    status,
    /** Mientras se guarda, los campos quedan de solo lectura: lo que se escribiera se perdería al llegar la respuesta. */
    saving: status === 'saving',
    statusText: status === 'saving' ? 'Guardando tus cambios…' : status === 'saved' ? 'Tus cambios se guardaron.' : '',
    notice,
    submit,
  }
}

export type AccountFormView = ReturnType<typeof useAccountForm>

// --- Cambiar la contraseña ---

type PasswordField = 'current' | 'next'
const PASSWORD_ORDER: PasswordField[] = ['current', 'next']
const PASSWORD_API_FIELDS: Record<string, PasswordField> = { current_password: 'current', new_password: 'next' }

export const PASSWORD_CHANGED = 'Cambiamos tu contraseña. Cerramos tu sesión en los demás dispositivos.'
/** Los avisos del acceso que también aplican aquí; cualquier otro rechazo pide recargar. */
const SHARED_NOTICES = new Set(['throttled', 'network', 'cookies_blocked'])

export function validatePasswordChange(values: { current: string; next: string }) {
  const errors: Partial<Record<PasswordField, string>> = {}
  if (!values.current) errors.current = 'Escribe tu contraseña actual.'
  if (!values.next) errors.next = 'Escribe la contraseña nueva.'
  else if (values.next.length < PASSWORD_MIN_LENGTH) errors.next = PASSWORD_TOO_SHORT
  return errors
}

/**
 * "Cambiar contraseña" (D72): un formulario que se abre en la misma vista, con la contraseña actual y la nueva. Al
 * cambiarla, el backend cierra las demás sesiones y esta sigue con un access nuevo (`changePassword`). Al cerrar el
 * formulario, por "Cancelar" o tras el cambio, el foco vuelve al botón que lo abre.
 */
export function usePasswordChange() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({})
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [changed, setChanged] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refs: Record<PasswordField, RefObject<HTMLInputElement | null>> = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
  }

  function reset() {
    setCurrent('')
    setNext('')
    setErrors({})
    setNotice(null)
  }

  function close() {
    setOpen(false)
    reset()
    toggleRef.current?.focus()
  }

  function toggle() {
    if (open) {
      close()
      return
    }
    setChanged(false)
    setOpen(true)
  }

  function show(found: Partial<Record<PasswordField, string>>) {
    setErrors(found)
    const first = PASSWORD_ORDER.find((field) => found[field])
    if (first) refs[first].current?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setNotice(null)
    const local = validatePasswordChange({ current, next })
    if (Object.keys(local).length > 0) {
      show(local)
      return
    }
    show({})
    setSubmitting(true)
    try {
      await changePassword(current, next)
      setChanged(true)
      close()
    } catch (error) {
      const rejection = error instanceof AuthRequestError ? error : new AuthRequestError(0, 'network')
      const fromServer: Partial<Record<PasswordField, string>> = {}
      for (const [apiField, messages] of Object.entries(rejection.fields)) {
        const field = PASSWORD_API_FIELDS[apiField]
        if (field && messages[0]) fromServer[field] = messages.join(' ')
      }
      if (Object.keys(fromServer).length > 0) show(fromServer)
      else
        setNotice(
          SHARED_NOTICES.has(rejection.code)
            ? authNotice(rejection)
            : { title: 'No pudimos cambiar tu contraseña.', detail: 'Recarga la página e inténtalo de nuevo.' },
        )
    } finally {
      setSubmitting(false)
    }
  }

  const field = (value: string, onChange: (next: string) => void, name: PasswordField) => ({ value, onChange, error: errors[name] })

  return {
    open,
    toggle,
    close,
    toggleRef,
    current: field(current, setCurrent, 'current'),
    next: field(next, setNext, 'next'),
    nextHelp: PASSWORD_HELP,
    refs,
    notice,
    submitting,
    statusText: changed ? PASSWORD_CHANGED : '',
    submit,
  }
}

export type PasswordChangeView = ReturnType<typeof usePasswordChange>
