import { Check } from '@phosphor-icons/react'
import { useId } from 'react'
import type { InputHTMLAttributes, RefObject } from 'react'
import Button from '../../components/Button.tsx'
import Card from '../../components/Card.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import TextField from '../../components/TextField.tsx'
import type { Account } from '../../models/account.ts'
import { FULL_NAME_MAX_LENGTH, useAccountForm, usePasswordChange } from '../../viewmodels/useAccountDetails.ts'
import PasswordChange, { PASSWORD_FORM_ID } from './PasswordChange.tsx'

type NoticeOptionProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'aria-invalid'> & {
  label: string
  /** La línea de abajo, visible: el correo, o "Usa el teléfono de tus datos personales." */
  description: string
  /** Lo que solo oye un lector de pantalla, al final de la descripción (por qué la casilla del correo no se quita). */
  srNote?: string
  /** La casilla fija del correo: marcada, desactivada y dibujada como una casilla marcada normal (mockup 013 y 014). */
  locked?: boolean
  error?: string
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * Una casilla de "Avisos del pedido" (CuentaDatos.dc.html): la casilla, su nombre y, debajo, de qué dato sale el aviso.
 * La línea de abajo y el error se enlazan con `aria-describedby`; el nombre accesible es solo la etiqueta. Con `locked`
 * sigue siendo una casilla nativa desactivada (así la anuncian los lectores), pintada en `mermelada` con la marca en
 * `sobre-color`, porque el gris del navegador apenas deja ver que está marcada. Con `disabled` (mientras se guarda)
 * conserva el aspecto del navegador.
 */
function NoticeOption({ label, description, srNote, locked = false, error, inputRef, disabled, ...input }: NoticeOptionProps) {
  const id = useId()
  const descriptionId = `${id}-detalle`
  const noteId = srNote ? `${id}-nota` : undefined
  const errorId = error ? `${id}-error` : undefined
  const inactive = locked || disabled
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-start gap-3">
        <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
          <input
            {...input}
            ref={inputRef}
            id={id}
            type="checkbox"
            checked={locked ? true : input.checked}
            readOnly={locked || input.readOnly}
            disabled={inactive}
            aria-invalid={error ? true : undefined}
            aria-describedby={[descriptionId, noteId, errorId].filter(Boolean).join(' ')}
            className={
              locked
                ? 'h-5 w-5 cursor-not-allowed appearance-none rounded-[4px] bg-mermelada'
                : `h-5 w-5 accent-mermelada ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${focusRing}`
            }
          />
          {locked && (
            <Check size={14} weight="bold" aria-hidden="true" className="pointer-events-none absolute left-[3px] top-[3px] text-sobre-color" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <label htmlFor={id} className={`text-cuerpo font-semibold ${inactive ? '' : 'cursor-pointer'}`}>
            {label}
          </label>
          <p id={descriptionId} className="break-words text-nota text-mermelada-suave">
            {description}
          </p>
          {srNote && (
            <span id={noteId} className="sr-only">
              {srNote}
            </span>
          )}
        </div>
      </div>
      {error && (
        <p id={errorId} className="text-nota font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * El contenido de `/cuenta/datos` con la cuenta cargada (D72, mockup `CuentaDatos`): "Datos personales" y "Avisos del
 * pedido" en dos columnas (una sola desde 960 px) y "Guardar cambios" abajo. El correo no se cambia. El formulario de
 * la contraseña es otro `<form>` (fuera de este), al que pertenecen sus campos por el atributo `form`.
 */
export default function AccountDetailsForm({ account }: { account: Account }) {
  // Las refs aparte, como en `Login.tsx`: el resto del view-model se lee al pintar.
  const { refs: { fullName: fullNameRef, phone: phoneRef, notifyWhatsapp: whatsappRef }, ...form } = useAccountForm(account)
  const password = usePasswordChange()
  return (
    <>
      <form noValidate onSubmit={(event) => void form.submit(event)} aria-labelledby="datos-y-avisos" className="flex flex-col gap-6">
        <h2 id="datos-y-avisos" className="font-display text-titulo-2">
          Datos y avisos
        </h2>
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1 max-[960px]:gap-6">
          <Card as="section" large aria-labelledby="datos-personales" className="flex flex-col gap-5">
            <h3 id="datos-personales" className="font-display text-titulo-3">
              Datos personales
            </h3>
            <div className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
              <TextField
                ref={fullNameRef}
                label="Nombre completo"
                autoComplete="name"
                placeholder="Ej. Ana López García"
                maxLength={FULL_NAME_MAX_LENGTH}
                readOnly={form.saving}
                value={form.fullName.value}
                onChange={(event) => form.fullName.onChange(event.target.value)}
                error={form.fullName.error}
              />
              <TextField
                ref={phoneRef}
                label="Teléfono o WhatsApp"
                labelNote="(opcional)"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ej. 55 1234 5678"
                maxLength={20}
                help="10 dígitos."
                readOnly={form.saving}
                value={form.phone.value}
                onChange={(event) => form.phone.onChange(event.target.value)}
                error={form.phone.error}
              />
            </div>
            <TextField
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              readOnly
              value={form.email}
              help={form.emailHelp}
              className="read-only:bg-nata"
            />
            {form.hasPassword && <PasswordChange password={password} />}
          </Card>
          <Card as="section" large aria-labelledby="avisos-del-pedido" className="flex flex-col gap-5">
            <h3 id="avisos-del-pedido" className="font-display text-titulo-3">
              Avisos del pedido
            </h3>
            <p className="text-cuerpo text-mermelada-suave">Elige por dónde te avisamos.</p>
            <div className="flex flex-col gap-2">
              <NoticeOption
                label="Correo electrónico"
                description={form.email}
                srNote={form.emailNoticeNote}
                locked
              />
              <NoticeOption
                inputRef={whatsappRef}
                label="WhatsApp"
                description="Usa el teléfono de tus datos personales."
                checked={form.notifyWhatsapp.value}
                disabled={form.saving}
                onChange={(event) => form.notifyWhatsapp.onChange(event.target.checked)}
                error={form.notifyWhatsapp.error}
              />
            </div>
          </Card>
        </div>
        {form.notice && (
          <Notice tone="error" title={form.notice.title} className="self-start">
            {form.notice.detail}
          </Notice>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" aria-disabled={form.saving || undefined}>
            Guardar cambios
          </Button>
          <p role="status" className="text-etiqueta text-mermelada">
            {form.statusText}
          </p>
        </div>
      </form>
      {/* Sin nombre a propósito: vacío, no debe ser un punto de referencia para los lectores de pantalla. */}
      <form id={PASSWORD_FORM_ID} noValidate onSubmit={(event) => void password.submit(event)} />
    </>
  )
}
