import { Check } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { STEP_STATE_WORDS } from '../../viewmodels/orderView.ts'
import type { TimelineStep } from '../../viewmodels/orderView.ts'

// La línea de tiempo se arma una vez (22 de noviembre): los marcadores de lo hecho y de lo que va en curso se asientan desde 0.8
// y la línea de cada paso hecho baja al siguiente, en 450 ms y uno tras otro (60 ms de escalón, tope de 300 ms, como la
// cascada). Los títulos y los pendientes no se mueven: son lo que se lee.
const STEP_DELAY_MS = 60
const MAX_DELAY_MS = 300
const delay = (index: number): CSSProperties => ({ '--entrada-retraso': `${Math.min(index * STEP_DELAY_MS, MAX_DELAY_MS)}ms` }) as CSSProperties

/**
 * La línea de tiempo del pedido (mockups `Confirmacion` y `DetallePedido`): hecho con la palomita en `exito`, en curso
 * con el anillo `cajeta` y pendiente con el anillo hueco. Cada paso dice su estado en palabras para el lector de
 * pantalla; el color nunca va solo. Con `celebrate` (la confirmación y el envío de referencia, que se ven una vez por
 * compra) se arma al montar; en el detalle del pedido, que se vuelve a consultar, no. Un paso que cambia de estado
 * después de montar ya no se anima.
 */
export default function OrderTimeline({ steps, labelledBy, celebrate = false }: { steps: TimelineStep[]; labelledBy: string; celebrate?: boolean }) {
  // Los estados con que se montó: solo esos se arman, una vez.
  const [firstStates] = useState(() => steps.map((step) => `${step.title}:${step.state}`))
  const arming = (step: TimelineStep) => celebrate && step.state !== 'pending' && firstStates.includes(`${step.title}:${step.state}`)
  return (
    <ol aria-labelledby={labelledBy} className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              data-testid="linea-hito"
              style={arming(step) && step.state === 'done' ? delay(index + 1) : undefined}
              className={`absolute left-[12px] top-[26px] h-[calc(100%-26px)] w-0.5 ${step.state === 'done' ? 'bg-exito' : 'bg-relieve'} ${arming(step) && step.state === 'done' ? 'origin-top motion-safe:animate-hito-tramo' : ''}`}
            />
          )}
          <span
            aria-hidden="true"
            data-testid="marcador-hito"
            style={arming(step) ? delay(index) : undefined}
            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center ${arming(step) ? 'motion-safe:animate-hito' : ''}`}
          >
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
