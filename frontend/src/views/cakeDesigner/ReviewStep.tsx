import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import Button from '../../components/Button.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import ColorSwatches from '../../components/ColorSwatches.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import type { Occasion } from '../../models/occasion.ts'
import type { ReviewLine, ReviewView } from '../../viewmodels/cakeDesignReview.ts'
import type { DesignFeedback } from '../../viewmodels/useAddDesignToCart.ts'

/** Una fila del desglose: lo que es, su detalle en `nota` y su monto a la derecha, en cifras tabulares. */
function Line({ line, strong = false, muted = false }: { line: ReviewLine; strong?: boolean; muted?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-relieve py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* `whitespace-pre-line`: el mensaje del pastel conserva sus renglones. */}
        <p className={`whitespace-pre-line ${strong ? 'text-cuerpo font-bold' : muted ? 'text-cuerpo text-mermelada-suave' : 'text-cuerpo font-semibold'}`}>{line.title}</p>
        {line.detail && <p className="text-nota text-mermelada-suave">{line.detail}</p>}
        {line.swatches && <ColorSwatches colors={line.swatches} className="mt-1" />}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <p className={`whitespace-nowrap tabular-nums ${strong ? 'text-cuerpo font-bold' : 'text-cuerpo font-semibold'}`} data-testid={`monto-${line.key}`}>
          {line.amount}
        </p>
        {line.change && (
          // Cada renglón que se puede cambiar lleva su enlace al paso que corresponde, como "Tu pastel" en los otros pasos. El área de
          // toque de 44 px es un pseudo-elemento: el renglón no crece y conserva la altura del mockup.
          <Link to={{ search: `?paso=${line.change.step}` }} className={`relative inline-flex items-center rounded-sm text-etiqueta underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] ${focusRing}`}>
            Cambiar<span className="sr-only"> {line.change.label}</span>
          </Link>
        )}
      </div>
    </li>
  )
}

type ReviewStepProps = {
  review: ReviewView
  onOccasion: (value: Occasion | null) => void
  /** Vuelve a pedir el precio cuando la petición falló. */
  onRetry: () => void
}

/**
 * Paso 8: revisión (reglas 6.4, 7 y 10). La ocasión es opcional y no cambia el precio. El desglose son los montos de la API: el
 * pastel, la cobertura, la decoración, el mensaje y la oblea, la base como depósito aparte, el total, el anticipo y lo que se paga
 * hoy. Con una decoración por cotizar no se cobra nada: el pedido queda en pausa. Sin montos todavía, solo dice que calcula.
 */
export default function ReviewStep({ review, onOccasion, onRetry }: ReviewStepProps) {
  const id = useId()
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-ocasion`} className="text-etiqueta">
          ¿Para qué ocasión es? <span className="font-normal text-mermelada-suave">(opcional)</span>
        </label>
        <select
          id={`${id}-ocasion`}
          value={review.occasion}
          onChange={(event) => onOccasion((event.target.value || null) as Occasion | null)}
          className={`h-12 w-full rounded-sm border border-mermelada-suave bg-harina px-[14px] font-sans text-cuerpo text-mermelada hover:border-mermelada ${focusRing}`}
        >
          <option value="">Elige una ocasión</option>
          {review.occasions.map((occasion) => (
            <option key={occasion.value} value={occasion.value}>
              {occasion.label}
            </option>
          ))}
        </select>
      </div>

      {review.problem ? (
        // Sin montos y sin esta salida, la revisión se quedaría esperando para siempre: aquí vive el único "Volver a intentar" del precio.
        <Notice tone="error" title={review.problem.title}>
          {review.problem.detail && <p>{review.problem.detail}</p>}
          {review.problem.canRetry && (
            <Button variant="secondary" onClick={onRetry} className="mt-2">
              Volver a intentar
            </Button>
          )}
        </Notice>
      ) : review.lines.length === 0 ? (
        <p role="status" className="text-cuerpo text-mermelada-suave">
          {review.calculating ? 'Calculando tu pedido…' : ''}
        </p>
      ) : (
        <div data-testid="desglose" aria-busy={!review.ready || undefined} className={`flex flex-col gap-4 ${review.ready ? '' : 'opacity-60'}`}>
          <ul className="flex flex-col">
            {review.lines.map((line) => (
              <Line key={line.key} line={line} />
            ))}
          </ul>
          {review.total && (
            <div className="flex items-baseline justify-between gap-4 border-t border-relieve pt-4">
              <p className="text-cuerpo font-bold">{review.total.label}</p>
              <p className="text-cuerpo font-bold tabular-nums" data-testid="monto-total">
                {review.total.amount}
              </p>
            </div>
          )}
          {review.payment && (
            <>
              <ul className="flex flex-col">
                <Line line={review.payment.advance} muted />
                {review.payment.deposit && <Line line={review.payment.deposit} muted />}
              </ul>
              <ul className="flex flex-col border-t border-relieve pt-4">
                <Line line={review.payment.today} strong />
                <Line line={review.payment.onDelivery} muted />
              </ul>
            </>
          )}
          {review.quoteNotice && (
            <Notice tone="attention" title="Tu pedido quedará en pausa">
              <p>Hasta que la pastelería te diga el precio de la decoración. No pagas nada hoy; te avisamos por correo y en tu cuenta.</p>
            </Notice>
          )}
          {review.footnote && <p className="text-nota text-mermelada-suave">{review.footnote}</p>}
        </div>
      )}
    </>
  )
}

/**
 * El aviso de "Agregar al pedido" ("Agregado al pedido" o el error). Va en el pie de la tarjeta del paso, junto al botón que lo
 * provoca (`notice` de `StepCard`), no al final del contenido que se desplaza: ahí quedaría fuera de la vista al hacer clic
 * (tanda 3). La región queda siempre montada para que el aviso se anuncie (`AddToCartNotice`).
 */
export function ReviewFeedback({ feedback }: { feedback: DesignFeedback | null }) {
  return <AddToCartNotice feedback={feedback} />
}

/**
 * Lo que sigue cuando el pastel ya quedó en el pedido: "Ir a mi pedido" como el botón principal y "Diseñar otro pastel" como
 * enlace. Toman el lugar de "Agregar al pedido" y "Atrás" (`actions` de `StepCard`): antes se veían los cuatro juntos, con el
 * aviso, y el botón de agregar ya no hacía nada (correcciones del 21 de noviembre). Para cambiar algo quedan "Cambiar" en cada
 * renglón y la barra de pasos.
 */
export function AddedActions({
  feedbackId,
  claimFocus,
  onStartOver,
}: {
  /** El aviso de "Agregado al pedido" (`DesignFeedback.id`) que trajo este pie. */
  feedbackId: number
  /** Si este aviso todavía no movió el foco (y lo aparta); lo lleva quien sigue montado entre pasos. */
  claimFocus: (feedbackId: number) => boolean
  onStartOver: () => void
}) {
  const actions = useRef<HTMLDivElement>(null)
  // El botón que se tocó ("Agregar al pedido") ya no existe: el foco pasa al que sigue, no se pierde en la página. Solo con un
  // aviso nuevo: al volver al paso 8 desde la barra de pasos, el foco se queda donde lo dejó la navegación. `autoFocus` no sirve
  // aquí: React solo lo aplica a campos y botones, no a un enlace.
  useEffect(() => {
    if (claimFocus(feedbackId)) actions.current?.querySelector('a')?.focus({ preventScroll: true })
  }, [feedbackId, claimFocus])
  return (
    <div ref={actions} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ButtonLink to="/carrito">
        Ir a mi pedido
      </ButtonLink>
      <button
        type="button"
        onClick={onStartOver}
        className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm px-4 text-etiqueta underline underline-offset-4 hover:decoration-2 ${focusRing}`}
      >
        Diseñar otro pastel
      </button>
    </div>
  )
}
