import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { focusRingWithin, focusRingWithinOnColor } from './focus.ts'

type ChoiceOptionProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** `card` es una tarjeta con radio visible; `chip` oculta el radio y se llena al elegirse. */
  variant?: 'card' | 'chip'
  label: string
  description?: string
  /** Texto a la derecha de la tarjeta, por ejemplo un precio que viene del backend. */
  trailing?: ReactNode
  /** Por qué la opción no aplica. Se muestra siempre que esté desactivada. */
  disabledReason?: string
  /**
   * Chip sobre un campo `mermelada` (filtros de la vitrina de la portada): sin elegir, borde `fresa` y texto
   * `betun`; elegido, fondo `fresa-claro` con borde de 2 px `betun` y texto `mermelada`, como el mockup. Solo
   * aplica a `chip`.
   */
  onColor?: boolean
}

// Cada estado (habilitado o no) arma sus clases completas: ninguna depende del orden del CSS generado.
const cardBase = 'group flex min-h-11 items-center gap-3.5 rounded-md border px-4 py-[15px]'
const chipBase = 'group relative inline-flex min-h-11 items-center rounded-sm border px-4 text-etiqueta'

const cardEnabled =
  'cursor-pointer border-mermelada-suave bg-betun hover:bg-harina ' +
  'has-[:checked]:border-2 has-[:checked]:border-mermelada has-[:checked]:px-[15px] has-[:checked]:py-3.5 ' +
  'motion-safe:transition-colors motion-safe:active:translate-y-px'
const chipEnabled =
  'cursor-pointer border-mermelada-suave bg-betun text-mermelada hover:bg-harina ' +
  'has-[:checked]:border-mermelada has-[:checked]:bg-mermelada has-[:checked]:text-sobre-color has-[:checked]:hover:bg-mermelada-profunda ' +
  'motion-safe:transition-colors motion-safe:active:translate-y-px'

// El chip elegido sobre `mermelada` engrosa el borde a 2 px y quita 1 px de relleno, para no cambiar de tamaño.
const chipOnColorEnabled =
  'cursor-pointer border-sobre-color-suave bg-mermelada text-sobre-color hover:bg-mermelada-profunda ' +
  'has-[:checked]:border-2 has-[:checked]:border-betun has-[:checked]:bg-fresa-claro has-[:checked]:px-[15px] ' +
  'has-[:checked]:text-mermelada has-[:checked]:hover:bg-fresa-claro ' +
  'motion-safe:transition-colors motion-safe:active:translate-y-px'

const cardDisabled = 'cursor-not-allowed border-dashed border-relieve bg-nata text-mermelada-suave'
// Un chip deshabilitado y elegido (por un estado controlado) no se ve disponible: borde sólido, fondo suave y texto apagado.
const chipDisabled =
  'cursor-not-allowed border-dashed border-relieve bg-nata text-mermelada-suave ' +
  'has-[:checked]:border-solid has-[:checked]:border-mermelada-suave has-[:checked]:bg-harina'

export default function ChoiceOption({
  variant = 'card',
  label,
  description,
  trailing,
  disabledReason,
  id,
  disabled,
  onColor = false,
  ...rest
}: ChoiceOptionProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const reasonId = disabled && disabledReason ? `${inputId}-motivo` : undefined
  const describedBy = [reasonId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined
  const isChip = variant === 'chip'
  const chipOnColor = isChip && onColor
  const chipState = chipOnColor ? chipOnColorEnabled : chipEnabled
  const state = disabled ? (isChip ? chipDisabled : cardDisabled) : isChip ? chipState : cardEnabled
  const style = `${isChip ? chipBase : cardBase} ${state} ${chipOnColor ? focusRingWithinOnColor : focusRingWithin}`
  const titleStyle = disabled ? '' : 'group-hover:underline group-hover:underline-offset-4'

  return (
    <div className={`flex flex-col gap-1 ${isChip ? 'items-start' : ''}`}>
      <label htmlFor={inputId} className={style}>
        <input
          {...rest}
          id={inputId}
          type="radio"
          disabled={disabled}
          aria-describedby={describedBy}
          className={
            isChip
              ? 'sr-only'
              : `h-5 w-5 shrink-0 accent-mermelada outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`
          }
        />
        {isChip ? (
          <span className={titleStyle}>{label}</span>
        ) : (
          <>
            <span className="flex flex-1 flex-col">
              <span className={`text-cuerpo font-semibold ${titleStyle}`}>{label}</span>
              {description && <span className="text-nota text-mermelada-suave">{description}</span>}
            </span>
            {trailing && <span className="whitespace-nowrap text-cuerpo font-semibold tabular-nums">{trailing}</span>}
          </>
        )}
      </label>
      {reasonId && (
        <p id={reasonId} className="text-nota text-mermelada-suave">
          {disabledReason}
        </p>
      )}
    </div>
  )
}
