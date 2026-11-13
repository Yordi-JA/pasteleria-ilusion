import { Minus, Plus } from '@phosphor-icons/react'
import { focusRing } from './focus.ts'

type QuantityStepperProps = {
  value: number
  min?: number
  max: number
  /** Qué se cuenta, para las etiquetas: "Tres leches de durazno". */
  itemName: string
  onChange: (value: number) => void
  /** Por ejemplo, `w-full justify-between` para el contador a todo el ancho de una tarjeta. */
  className?: string
}

const stepButton =
  `inline-flex h-11 w-11 items-center justify-center rounded-md text-mermelada enabled:cursor-pointer enabled:hover:bg-harina ` +
  `disabled:cursor-not-allowed disabled:opacity-40 motion-safe:enabled:active:translate-y-px ${focusRing}`

/**
 * Cantidad con "−" y "+" (mockup de la ficha): un grupo con nombre, dos botones de 44 px y el número en un
 * `<output>` que se anuncia al cambiar. En el tope, el botón se desactiva y su etiqueta lo dice.
 */
export default function QuantityStepper({ value, min = 1, max, itemName, onChange, className = '' }: QuantityStepperProps) {
  const atMin = value <= min
  const atMax = value >= max
  return (
    <div role="group" aria-label={`Cantidad de ${itemName}`} className={`inline-flex items-center rounded-md border border-mermelada-suave bg-betun ${className}`}>
      <button type="button" aria-label={`Quitar uno de ${itemName}`} disabled={atMin} onClick={() => onChange(value - 1)} className={stepButton}>
        <Minus size={18} weight="bold" aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-7 text-center text-cuerpo font-semibold tabular-nums">
        {value}
      </output>
      <button type="button" aria-label={`Agregar uno de ${itemName}`} disabled={atMax} onClick={() => onChange(value + 1)} className={stepButton}>
        <Plus size={18} weight="bold" aria-hidden="true" />
      </button>
    </div>
  )
}
