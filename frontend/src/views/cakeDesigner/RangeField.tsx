import { useId } from 'react'
import { focusRing } from '../../components/focus.ts'

type RangeFieldProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Lo que dice el valor, para verlo y para el lector de pantalla ("21.6 cm", "40 %", "15°"). */
  text: string
  onChange: (value: number) => void
  /** Los extremos, si ayudan ("Izquierda" y "Derecha"). */
  ends?: [string, string]
}

/**
 * Un deslizador con etiqueta visible y su valor dicho en palabras (`aria-valuetext`). Con el teclado, las flechas lo mueven de
 * paso en paso; el valor nunca pasa de `max` (lo que cabe en la tapa y en la hoja carta).
 */
export default function RangeField({ label, value, min, max, step, text, onChange, ends }: RangeFieldProps) {
  const id = useId()
  const top = Math.max(max, min)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-etiqueta">
          {label}
        </label>
        <span aria-hidden="true" className="text-nota tabular-nums text-mermelada-suave">
          {text}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={top}
        step={step}
        value={Math.min(Math.max(value, min), top)}
        aria-valuetext={text}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-11 w-full cursor-pointer accent-mermelada ${focusRing}`}
      />
      {ends && (
        <div aria-hidden="true" className="flex justify-between text-nota text-mermelada-suave">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  )
}
