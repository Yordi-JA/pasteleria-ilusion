import { MagnifyingGlass } from '@phosphor-icons/react'
import { useId } from 'react'
import type { Ref } from 'react'
import { focusRing } from './focus.ts'

type SearchFieldProps = {
  /** Etiqueta real del campo; se oculta a la vista como en el mockup, pero el lector la dice. */
  label: string
  value: string
  placeholder: string
  maxLength: number
  onChange: (value: string) => void
  /** Enter: buscar ya, sin esperar. */
  onSubmit: () => void
  /** Ayuda para el lector de pantalla, enlazada con `aria-describedby`. */
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/**
 * Buscador del catálogo (y de la vitrina, cuando lo lleve): un `<form role="search">` con su etiqueta real, la lupa
 * decorativa y un campo `type="search"` (Escape lo borra, como en cualquier buscador del navegador). El formulario
 * no navega: Enter llama a `onSubmit`. Quien lo usa decide cuándo pedir a la API.
 */
export default function SearchField({ label, value, placeholder, maxLength, onChange, onSubmit, describedBy, inputRef, className = '' }: SearchFieldProps) {
  const id = useId()
  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <MagnifyingGlass size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mermelada-suave" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="search"
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={
          'h-11 w-full rounded-sm border border-mermelada-suave bg-harina pl-[42px] pr-3.5 font-sans text-cuerpo text-mermelada ' +
          'placeholder:text-mermelada-suave placeholder:opacity-100 hover:border-mermelada ' +
          `${focusRing}`
        }
      />
    </form>
  )
}
