import { useId } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { focusRing } from './focus.ts'

type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'aria-invalid'> & {
  label: string
  /** Ayuda bajo el campo para formatos no obvios; se enlaza con `aria-describedby`. */
  help?: string
  /** Mensaje de error: dice qué pasó y cómo seguir. Marca el campo como inválido. Puede llevar un enlace. */
  error?: ReactNode
  /** Un control dentro del campo, a la derecha (por ejemplo, "Mostrar" en la contraseña). */
  trailing?: ReactNode
  /** Lo que va junto a la etiqueta, en peso normal: "(opcional)". */
  labelNote?: string
}

// En React 19 `ref` llega al input como una prop más, dentro de `rest`.
export default function TextField({ label, help, error, trailing, labelNote, id, className = '', ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const helpId = help ? `${inputId}-ayuda` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [helpId, errorId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined

  const input = (
    <input
      {...rest}
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={
        'h-12 w-full rounded-sm border border-mermelada-suave bg-harina px-[14px] font-sans text-cuerpo text-mermelada ' +
        'placeholder:text-mermelada-suave placeholder:opacity-100 ' +
        'enabled:hover:border-mermelada aria-[invalid=true]:border-2 aria-[invalid=true]:border-error aria-[invalid=true]:px-[13px] ' +
        'disabled:cursor-not-allowed disabled:border-dashed disabled:border-relieve disabled:bg-nata disabled:text-mermelada-suave ' +
        // Con un control dentro, el texto no pasa por debajo de él.
        `${trailing ? 'pr-24 aria-[invalid=true]:pr-24 ' : ''}${focusRing} ${className}`
      }
    />
  )

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-etiqueta text-mermelada">
        {label}
        {labelNote && <span className="font-normal text-mermelada-suave"> {labelNote}</span>}
      </label>
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute right-0.5 top-0.5">{trailing}</div>
        </div>
      ) : (
        input
      )}
      {help && (
        <p id={helpId} className="text-nota text-mermelada-suave">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-nota font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  )
}
