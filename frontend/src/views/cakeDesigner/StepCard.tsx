import type { ReactNode, RefObject } from 'react'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'

type StepCardProps = {
  number: number
  title: string
  total: number
  titleRef: RefObject<HTMLHeadingElement | null>
  /** De qué lado entra la tarjeta: al avanzar, desde la derecha; al regresar, desde la izquierda. */
  direction: 'forward' | 'back' | null
  /** Por qué no se puede continuar todavía ("Elige el pan."). */
  error: string | null
  continueLabel: string
  continueDisabled?: boolean
  /** "Continuar" espera algo (los kilos del paso 1): el botón se desactiva y lo dice con `aria-busy`. */
  busy?: boolean
  onContinue: () => void
  onBack: () => void
  children: ReactNode
}

const ENTER = { forward: 'motion-safe:animate-paso-derecha', back: 'motion-safe:animate-paso-izquierda' } as const

/**
 * La tarjeta del paso actual, siempre en el mismo lugar: título con número, "Paso N de 8", el contenido y "Continuar"
 * con "Atrás". Al cambiar de paso, el foco llega al título (lo pone el view-model).
 */
export default function StepCard({
  number,
  title,
  total,
  titleRef,
  direction,
  error,
  continueLabel,
  continueDisabled = false,
  busy = false,
  onContinue,
  onBack,
  children,
}: StepCardProps) {
  return (
    <section
      aria-labelledby="paso-titulo"
      data-testid="tarjeta-paso"
      className={`flex min-w-0 flex-col gap-5 rounded-lg border-[1.5px] border-mermelada bg-betun p-6 max-[600px]:p-4 ${direction ? ENTER[direction] : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="paso-titulo" ref={titleRef} tabIndex={-1} className="font-display text-titulo-2 outline-none">
          {number}. {title}
        </h2>
        <p className="text-nota text-mermelada-suave">
          Paso {number} de {total}
        </p>
      </div>
      {children}
      <div className="flex flex-col gap-3 border-t border-relieve pt-5">
        {error && (
          <p role="alert" className="text-nota font-semibold text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button onClick={onContinue} disabled={continueDisabled} aria-busy={busy || undefined}>
            {continueLabel}
          </Button>
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex min-h-11 items-center rounded-sm px-4 text-etiqueta hover:underline hover:underline-offset-4 ${focusRing}`}
          >
            Atrás
          </button>
        </div>
      </div>
    </section>
  )
}
