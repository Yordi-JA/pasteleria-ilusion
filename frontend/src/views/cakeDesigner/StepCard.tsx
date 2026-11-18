import type { ReactNode, RefObject } from 'react'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import { useScrollOverflow } from '../../viewmodels/useScrollOverflow.ts'
import { DESKTOP_COLUMN, INNER_FOCUS, SCROLLBAR } from './scrollStyles.ts'

type StepCardProps = {
  number: number
  title: string
  total: number
  titleRef: RefObject<HTMLHeadingElement | null>
  /** De qué lado entra la tarjeta: al avanzar, desde la derecha; al regresar, desde la izquierda. */
  direction: 'forward' | 'back' | null
  /** Por qué no se puede continuar todavía ("Elige el pan."). */
  error: string | null
  /** Lo que responde el botón y va junto a él, en el pie fijo: el aviso de "Agregar al pedido" de la revisión. */
  notice?: ReactNode
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
 * con "Atrás". Al cambiar de paso, el foco llega al título (lo pone el view-model). En escritorio el título y los botones
 * quedan siempre a la vista y solo el contenido se desplaza (tanda 3); como la tarjeta se vuelve a montar con cada paso
 * (`key` en `CakeDesigner`), el contenido nuevo empieza arriba. El contenido es una región con nombre y, solo cuando
 * desborda, una parada del tabulador, para bajar con las flechas lo que no tiene controles (una nota al final).
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
  notice,
  children,
}: StepCardProps) {
  const { viewport, content, overflowing } = useScrollOverflow<HTMLDivElement, HTMLDivElement>()
  return (
    <section
      aria-labelledby="paso-titulo"
      data-testid="tarjeta-paso"
      className={`flex min-w-0 flex-col rounded-lg border border-relieve bg-betun ${DESKTOP_COLUMN} ${direction ? ENTER[direction] : ''}`}
    >
      <div className="mx-6 flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-4 pt-6 max-[600px]:mx-4 max-[600px]:pt-4">
        <h2 id="paso-titulo" ref={titleRef} tabIndex={-1} className="font-display text-titulo-2 outline-none">
          {number}. {title}
        </h2>
        <p className="text-nota text-mermelada-suave">
          Paso {number} de {total}
        </p>
      </div>
      <div
        ref={viewport}
        role="region"
        aria-label="Contenido del paso"
        tabIndex={overflowing ? 0 : undefined}
        // 4 px arriba: el anillo de foco de la primera opción (2 px de separación y 2 de grueso) no se recorta.
        className={`min-h-0 scroll-py-3 px-6 pb-5 pt-1 min-[901px]:overflow-y-auto max-[600px]:px-4 ${SCROLLBAR} ${INNER_FOCUS}`}
      >
        <div ref={content} className="flex flex-col gap-5">
          {children}
        </div>
      </div>
      <div className="mx-6 flex shrink-0 flex-col gap-3 border-t border-relieve pb-6 pt-5 max-[600px]:mx-4 max-[600px]:pb-4">
        {notice}
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
