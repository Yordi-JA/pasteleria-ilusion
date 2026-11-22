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
  /**
   * Dónde se alinea el mensaje con el botón: centrado por omisión, o `end`, pegado a su orilla derecha, cuando el botón va junto
   * al borde de la pantalla (el candado del paso en móvil). Cerrado sigue en el acomodo (`invisible`), así que centrado ahí
   * se saldría de la pantalla y la dejaría arrastrar de lado.
   */
  align?: 'center' | 'end'
}

const ALIGN = {
  center: 'left-1/2 origin-bottom -translate-x-1/2',
  end: 'right-0 origin-bottom-right',
}

/**
 * Un botón que explica algo en un mensaje flotante sobre él (`role="tooltip"`). Aparece con el foco, con el puntero y con un
 * toque, y sigue a la vista mientras el puntero pasa del botón al mensaje; Esc, salir o perder el foco lo cierran. El texto
 * describe al botón aunque esté oculto, así el lector lo dice al llegar. Crece desde el botón (de 0.97 a 1, 150 ms) al abrir y
 * regresa igual al cerrar; `invisible` y no `hidden`, para que la salida también se vea. Con `prefers-reduced-motion` solo aparece.
 */
export default function Toggletip({ label, text, children, className = '', buttonClassName = 'min-h-11 min-w-11', align = 'center' }: ToggletipProps) {
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
        className={`${tip.open ? 'visible scale-100 opacity-100' : 'invisible scale-[0.97] opacity-0'} absolute bottom-full ${ALIGN[align]} z-30 mb-1 w-64 transition-[opacity,transform,visibility] duration-150 ease-entrada motion-reduce:transition-none rounded-md bg-mermelada px-3 py-2 text-left text-nota font-normal text-sobre-color shadow-flotante`}
      >
        {text}
      </span>
    </span>
  )
}
