import { Check, LockSimple } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { focusRing } from '../../components/focus.ts'
import type { StepStatus } from '../../viewmodels/cakeDesignSteps.ts'

export type StepItem = { number: number; short: string; title: string; status: StepStatus; reachable: boolean }

/** Palabra de cada estado para el lector de pantalla: el círculo nunca dice solo con color. */
const STATUS_WORDS: Record<StepStatus, string> = {
  complete: 'completado',
  current: 'paso actual',
  included: 'incluido',
  attention: 'hay que cambiarlo',
  upcoming: 'pendiente',
}

const CIRCLE: Record<StepStatus, string> = {
  complete: 'border-mermelada bg-mermelada text-sobre-color',
  current: 'border-mermelada bg-betun text-mermelada ring-4 ring-fresa-claro',
  included: 'border-mermelada bg-betun text-mermelada',
  attention: 'border-cajeta bg-cajeta text-sobre-color',
  upcoming: 'border-relieve bg-betun text-mermelada-suave',
}

/** Segmentos de la barra móvil, como el mockup: lo ya elegido en `mermelada`, el paso actual en `fresa`. */
const SEGMENT: Record<StepStatus, string> = {
  complete: 'bg-mermelada',
  current: 'bg-fresa',
  included: 'bg-mermelada',
  attention: 'bg-mermelada',
  upcoming: 'bg-relieve',
}

function Circle({ step }: { step: StepItem }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-nota font-semibold ${CIRCLE[step.status]}`}
    >
      {step.status === 'complete' ? (
        <Check size={14} weight="bold" />
      ) : step.status === 'included' ? (
        <LockSimple size={14} />
      ) : step.status === 'attention' ? (
        '!'
      ) : (
        step.number
      )}
    </span>
  )
}

/**
 * Avance de "Diseña tu pastel". En escritorio, los 8 pasos con su círculo (palomita, actual, candado del relleno
 * incluido, "!" si hay que cambiarlo, o el número) y la línea que los une; los ya alcanzados son enlaces para
 * regresar (libro de marca, "Cotizador 3D"). En móvil (hasta 600 px), "Paso 3 de 8: Pan" con 8 segmentos.
 */
export default function StepBar({ steps, current }: { steps: StepItem[]; current: number }) {
  const total = steps.length
  const now = steps[current - 1]
  return (
    <nav aria-label="Pasos de Diseña tu pastel">
      <ol className="grid grid-cols-8 max-[600px]:hidden">
        {steps.map((step, index) => {
          const label = (
            <>
              <Circle step={step} />
              <span className={`text-nota ${step.status === 'current' || step.status === 'complete' ? 'font-semibold text-mermelada' : 'text-mermelada-suave'}`}>
                {step.short}
              </span>
              <span className="sr-only">
                , {step.title}: {STATUS_WORDS[step.status]}
              </span>
            </>
          )
          const filled = index < total - 1 && (steps[index + 1].status !== 'upcoming' || step.status === 'complete')
          return (
            <li key={step.number} className="relative flex justify-center" aria-current={step.status === 'current' ? 'step' : undefined}>
              {index < total - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+22px)] right-[calc(-50%+22px)] top-[21px] h-px ${filled ? 'bg-mermelada' : 'bg-relieve'}`}
                />
              )}
              {step.reachable ? (
                <Link
                  to={{ search: `?paso=${step.number}` }}
                  className={`flex min-h-11 flex-col items-center gap-1.5 rounded-sm px-2 pt-1.5 hover:underline hover:underline-offset-4 ${focusRing}`}
                >
                  {label}
                </Link>
              ) : (
                <span className="flex min-h-11 flex-col items-center gap-1.5 px-2 pt-1.5">{label}</span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="hidden flex-col gap-2.5 max-[600px]:flex">
        <p className="text-etiqueta">
          Paso {current} de {total}: {now?.title}
        </p>
        <ol aria-hidden="true" className="grid grid-cols-8 gap-1.5">
          {steps.map((step) => (
            <li
              key={step.number}
              className={`h-1.5 rounded-full ${SEGMENT[step.status]}`}
            />
          ))}
        </ol>
      </div>
    </nav>
  )
}
