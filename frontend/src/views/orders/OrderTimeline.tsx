import { Check } from '@phosphor-icons/react'
import { STEP_STATE_WORDS } from '../../viewmodels/orderView.ts'
import type { TimelineStep } from '../../viewmodels/orderView.ts'

/**
 * La línea de tiempo del pedido (mockups `Confirmacion` y `DetallePedido`): hecho con la palomita en `exito`, en curso
 * con el anillo `cajeta` y pendiente con el anillo hueco. Cada paso dice su estado en palabras para el lector de
 * pantalla; el color nunca va solo.
 */
export default function OrderTimeline({ steps, labelledBy }: { steps: TimelineStep[]; labelledBy: string }) {
  return (
    <ol aria-labelledby={labelledBy} className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[12px] top-[26px] h-[calc(100%-26px)] w-0.5 ${step.state === 'done' ? 'bg-exito' : 'bg-relieve'}`}
            />
          )}
          <span aria-hidden="true" className="flex h-[26px] w-[26px] shrink-0 items-center justify-center">
            {step.state === 'done' && (
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-exito text-sobre-color">
                <Check size={14} weight="bold" />
              </span>
            )}
            {step.state === 'current' && (
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[5px] border-cajeta bg-betun">
                <span className="h-1.5 w-1.5 rounded-full bg-cajeta" />
              </span>
            )}
            {step.state === 'pending' && <span className="h-[26px] w-[26px] rounded-full border-[1.5px] border-mermelada-suave bg-betun" />}
          </span>
          <span className="flex flex-col">
            <span className="text-cuerpo font-semibold">
              {step.title}
              <span className="sr-only">, {STEP_STATE_WORDS[step.state]}</span>
            </span>
            {step.detail && <span className="text-nota text-mermelada-suave">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
