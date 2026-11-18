import { useId } from 'react'
import type { KeyboardEvent } from 'react'
import { focusRing } from '../../components/focus.ts'

type Props = {
  label: string
  placeholder: string
  value: string
  maxLength: number
  rows: number
  help: string
  /** Lo que también describe el campo (el contador de palabras). */
  describedBy: string
  /** Por qué no entró un renglón más; `null` sin aviso. */
  lineLimit: { id: number; text: string } | null
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * "Tu mensaje" (paso 7, tanda 4): un campo de varios renglones con el mismo aspecto que `TextField`. Enter y Mayús+Enter ponen un
 * salto; el view-model no deja pasar de los renglones permitidos y lo dice en una región `status` siempre montada. La letra es de
 * 16 px, para que un teléfono no acerque la página al escribir, y el teclado del teléfono muestra la tecla de salto (`enterkeyhint`).
 */
export default function MessageField({ label, placeholder, value, maxLength, rows, help, describedBy, lineLimit, onChange, onKeyDown }: Props) {
  const id = useId()
  const helpId = `${id}-ayuda`
  const limitId = `${id}-renglones`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-etiqueta text-mermelada">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="enter"
        aria-describedby={`${helpId} ${describedBy} ${limitId}`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={
          'block w-full resize-none rounded-sm border border-mermelada-suave bg-harina px-[14px] py-3 font-sans text-cuerpo text-mermelada ' +
          // El campo queda a la vista sobre la barra fija del teléfono cuando el teclado lo empuja.
          'scroll-mb-28 placeholder:text-mermelada-suave placeholder:opacity-100 enabled:hover:border-mermelada ' +
          focusRing
        }
      />
      <p id={helpId} className="text-nota text-mermelada-suave">
        {help}
      </p>
      {/* Siempre montada para que el aviso se anuncie; vacía no ocupa lugar (anula el espacio de la columna). */}
      <p id={limitId} role="status" className="text-nota font-semibold text-mermelada empty:-mt-1.5">
        {lineLimit && <span key={lineLimit.id}>{lineLimit.text}</span>}
      </p>
    </div>
  )
}
