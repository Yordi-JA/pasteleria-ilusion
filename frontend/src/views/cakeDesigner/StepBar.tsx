import { Check, LockSimple } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { focusRing } from '../../components/focus.ts'
import Toggletip from '../../components/Toggletip.tsx'
import type { StepStatus } from '../../viewmodels/cakeDesignSteps.ts'
import { useArrivals } from '../../viewmodels/useArrivals.ts'

export type StepItem = {
  number: number
  short: string
  title: string
  status: StepStatus
  reachable: boolean
  /** Por qué el paso está incluido (el relleno del pan, o lo que viene del pastel de vitrina de origen): el mensaje flotante del candado. */
  tip?: string
  /** El nombre del candado para el lector de pantalla: "Relleno incluido", "Pan del pastel elegido". */
  tipLabel?: string
}

/** El candado de la barra móvil, cuando su mensaje no es el de un solo paso (el pastel de vitrina de origen, tanda 2). */
type MobileTip = { label: string; text: string }

/** El área de toque del candado llega a 44 px sin cambiar el círculo de 30 px, que se alinea con la línea de los pasos. */
const LOCK_BUTTON = "h-[30px] w-[30px] before:absolute before:-inset-[7px] before:content-['']"

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

/**
 * El avance que acaba de dar "Continuar" se asienta (22 de noviembre): la palomita del paso completado crece desde 0.6 y aparece
 * (el círculo y su anillo no se mueven), y 60 ms después la línea que lo une con el siguiente se llena de izquierda a derecha,
 * en 250 ms; en móvil se llena el segmento del paso nuevo. Los estados "!" y el candado no se animan: son avisos y se ven de
 * inmediato. Al regresar o al recargar no se mueve nada (`useArrivals`).
 */
const CHECK_ARRIVING = 'motion-safe:animate-asienta'
const LINE_ARRIVING = 'origin-left motion-safe:animate-tramo-lleno [--entrada-retraso:60ms]'
const SEGMENT_ARRIVING = 'origin-left motion-safe:animate-tramo-lleno'

/** Las llaves de lo que puede llegar: la palomita, la línea llena y el segmento con color de cada paso. */
function progressKeys(steps: StepItem[]): string[] {
  return steps.flatMap((step, index) => {
    const keys: string[] = []
    if (step.status === 'complete') keys.push(`${step.number}:palomita`)
    if (isFilled(steps, index)) keys.push(`${step.number}:linea`)
    if (step.status !== 'upcoming') keys.push(`${step.number}:segmento`)
    return keys
  })
}

/** La línea que va de este paso al siguiente se pinta llena si el siguiente ya se alcanzó o este se completó. */
function isFilled(steps: StepItem[], index: number): boolean {
  return index < steps.length - 1 && (steps[index + 1].status !== 'upcoming' || steps[index].status === 'complete')
}

function Circle({ step, arriving = false }: { step: StepItem; arriving?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-nota font-semibold ${CIRCLE[step.status]}`}
    >
      {step.status === 'complete' ? (
        <Check size={14} weight="bold" className={arriving ? CHECK_ARRIVING : undefined} />
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
 * incluido, con su mensaje flotante, "!" si hay que cambiarlo, o el número) y la línea que los une; los ya alcanzados son enlaces para
 * regresar (libro de marca, "Cotizador 3D"). En móvil (hasta 600 px), "Paso 3 de 8: Pan" con 8 segmentos.
 */
export default function StepBar({ steps, current, mobileTip = null }: { steps: StepItem[]; current: number; mobileTip?: MobileTip | null }) {
  const total = steps.length
  const now = steps[current - 1]
  const included = steps.find((step) => step.tip)
  // En móvil va un solo candado: el del pastel de origen, que junta tipo, pan y relleno, o el del paso incluido.
  const lock = mobileTip ?? (included?.tip ? { label: included.tipLabel ?? `${included.short} incluido`, text: included.tip } : null)
  const arrived = useArrivals(progressKeys(steps), current)
  return (
    <nav aria-label="Pasos de Diseña tu pastel">
      <ol className="grid grid-cols-8 max-[600px]:hidden">
        {steps.map((step, index) => {
          const label = (
            <>
              {step.tip ? (
                <Toggletip label={step.tipLabel ?? `${step.short} incluido`} text={step.tip} buttonClassName={LOCK_BUTTON}>
                  <Circle step={step} />
                </Toggletip>
              ) : (
                <Circle step={step} arriving={arrived.has(`${step.number}:palomita`)} />
              )}
              <span className={`text-nota ${step.status === 'current' || step.status === 'complete' ? 'font-semibold text-mermelada' : 'text-mermelada-suave'}`}>
                {step.short}
              </span>
              <span className="sr-only">
                , {step.title}: {STATUS_WORDS[step.status]}
              </span>
            </>
          )
          const filled = isFilled(steps, index)
          return (
            <li key={step.number} className="relative flex justify-center" aria-current={step.status === 'current' ? 'step' : undefined}>
              {index < total - 1 && (
                // El riel `relieve` siempre; el tramo `mermelada` va encima cuando está lleno, para llenarse sobre el riel.
                <span aria-hidden="true" className="absolute left-[calc(50%+22px)] right-[calc(-50%+22px)] top-[21px] h-px bg-relieve">
                  {filled && (
                    <span
                      data-testid="tramo-lleno"
                      className={`block h-full bg-mermelada ${arrived.has(`${step.number}:linea`) ? LINE_ARRIVING : ''}`}
                    />
                  )}
                </span>
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-etiqueta">
            Paso {current} de {total}: {now?.title}
          </p>
          {/* En móvil no se ven los círculos: el candado del paso incluido va junto al paso actual. */}
          {lock && (
            <Toggletip label={lock.label} text={lock.text}>
              <LockSimple size={20} aria-hidden="true" />
            </Toggletip>
          )}
        </div>
        <ol aria-hidden="true" className="grid grid-cols-8 gap-1.5">
          {steps.map((step) => (
            // El riel `relieve` queda abajo y el color va encima, para que el segmento nuevo se llene sobre él.
            <li key={step.number} className="h-1.5 overflow-hidden rounded-full bg-relieve">
              <span
                className={`block h-full rounded-full ${SEGMENT[step.status]} ${arrived.has(`${step.number}:segmento`) ? SEGMENT_ARRIVING : ''}`}
              />
            </li>
          ))}
        </ol>
      </div>
    </nav>
  )
}
