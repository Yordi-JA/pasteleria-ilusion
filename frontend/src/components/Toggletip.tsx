import { useId } from 'react'
import type { ReactNode } from 'react'
import { useToggletip } from '../viewmodels/useToggletip.ts'
import { focusRing } from './focus.ts'

type ToggletipProps = {
  /** El nombre del botón para el lector de pantalla: "Relleno incluido". */
  label: string
  /** Lo que explica el mensaje flotante; también es la descripción del botón (`aria-describedby`). */
  text: string
  /** Lo que se ve en el botón (el candado). */
  children: ReactNode
  className?: string
  /** El tamaño del botón; por omisión, 44 px para el dedo. Uno más chico agranda su área de toque con `before:`. */
  buttonClassName?: string
}

/**
 * Un botón que explica algo en un mensaje flotante sobre él (`role="tooltip"`). Aparece con el foco, con el puntero y con un
 * toque, y sigue a la vista mientras el puntero pasa del botón al mensaje; Esc, salir o perder el foco lo cierran. El texto
 * describe al botón aunque esté oculto, así el lector lo dice al llegar. Sin animación: respeta `prefers-reduced-motion`.
 */
export default function Toggletip({ label, text, children, className = '', buttonClassName = 'min-h-11 min-w-11' }: ToggletipProps) {
  const id = useId()
  const tip = useToggletip()
  return (
    <span className={`relative inline-flex ${className}`} onMouseEnter={tip.show} onMouseLeave={tip.hide}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={tip.show}
        onBlur={tip.hide}
        onClick={tip.show}
        className={`relative inline-flex cursor-help items-center justify-center rounded-full ${buttonClassName} ${focusRing}`}
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`${tip.open ? '' : 'hidden'} absolute bottom-full left-1/2 z-30 mb-1 w-64 -translate-x-1/2 rounded-md bg-mermelada px-3 py-2 text-left text-nota font-normal text-sobre-color shadow-flotante`}
      >
        {text}
      </span>
    </span>
  )
}
