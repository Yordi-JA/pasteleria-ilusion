import { CaretDown } from '@phosphor-icons/react'
import { Link } from 'react-router'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import type { PriceView, SummaryRow } from '../../viewmodels/cakeDesignSummary.ts'

/**
 * El total: la cifra anterior se queda a la vista mientras llega la nueva (más tenue, sin parpadeo). La región es
 * `aria-live` y `aria-busy` mientras calcula, así el lector dice el total nuevo una sola vez, al llegar. Si la
 * petición falló, dice "Sin calcular": nunca un total viejo como si fuera el de ahora.
 */
function Amount({ price, currency, className }: { price: PriceView; currency: boolean; className: string }) {
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      aria-busy={price.updating || undefined}
      data-testid="total-estimado"
      data-state={price.failed ? 'failed' : price.updating ? 'updating' : 'ready'}
      className={`tabular-nums motion-safe:transition-opacity motion-safe:duration-150 ${price.updating && price.isFigure ? 'opacity-60' : ''} ${className}`}
    >
      {price.isFigure && currency ? `${price.amount} MXN` : price.amount}
    </p>
  )
}

function RetryPrice({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-x-2' : 'gap-3'}`}>
      <p role="alert" className="text-nota font-semibold">
        No se pudo calcular el total.
      </p>
      {compact ? (
        <button
          type="button"
          onClick={onRetry}
          className={`inline-flex min-h-11 items-center rounded-sm text-etiqueta underline underline-offset-4 ${focusRing}`}
        >
          Volver a intentar
        </button>
      ) : (
        <Button variant="secondary" onClick={onRetry}>
          Volver a intentar
        </Button>
      )}
    </div>
  )
}

/** La API rechazó la elección: dice por qué, sin "Volver a intentar" (daría lo mismo). */
function RejectedPrice({ reason }: { reason: string }) {
  return (
    <p role="alert" className="text-nota font-semibold">
      {reason}
    </p>
  )
}

const DRAG_HINT = 'Arrastra el pastel para girarlo.'
const KEYS_HINT = 'Usa las flechas para girarlo y verlo desde arriba o desde abajo.'

type PriceCardProps = {
  price: PriceView
  sizeLine: string
  hintId: string
  sceneReady: boolean
  /** La vista previa tiene el foco del teclado: la pista visible es la de las flechas. */
  keyboardFocus: boolean
  onRetry: () => void
}

/** "Total estimado" de escritorio, bajo la vista previa. En móvil lo sustituye la barra inferior. */
export function PriceCard({ price, sizeLine, hintId, sceneReady, keyboardFocus, onRetry }: PriceCardProps) {
  return (
    <section aria-label="Total estimado" className="flex flex-col gap-3 rounded-lg border border-relieve bg-betun p-6 max-[900px]:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-cuerpo text-mermelada-suave">Total estimado</p>
        <Amount price={price} currency className="text-titulo-3" />
      </div>
      <p className="text-cuerpo font-semibold">{sizeLine}</p>
      {price.failed && <RetryPrice onRetry={onRetry} />}
      {price.rejectedReason && <RejectedPrice reason={price.rejectedReason} />}
      {price.note && <p className="text-nota text-mermelada-suave">{price.note}</p>}
      {(price.assumed || sceneReady) && (
        <p className="text-nota text-mermelada-suave">
          {price.assumed}
          {price.assumed && sceneReady && ' '}
          {/* Describe la vista previa (`aria-describedby`) con las dos frases; solo se ve cuando el pastel ya se puede girar. */}
          <span id={hintId} className={sceneReady ? '' : 'sr-only'}>
            <span className={keyboardFocus ? 'sr-only' : ''}>{DRAG_HINT}</span>
            <span className={keyboardFocus ? '' : 'sr-only'}>{KEYS_HINT}</span>
          </span>
        </p>
      )}
    </section>
  )
}

/** La pista de la vista previa en móvil, bajo el pastel. La que describe la escena es la del total de escritorio. */
export function MobileHint({ visible, keyboardFocus }: { visible: boolean; keyboardFocus: boolean }) {
  if (!visible) return null
  return (
    <p aria-hidden="true" className="hidden text-nota text-mermelada-suave max-[900px]:block">
      {keyboardFocus ? KEYS_HINT : DRAG_HINT}
    </p>
  )
}

type MobileBarProps = {
  price: PriceView
  continueLabel: string
  onContinue: () => void
  disabled: boolean
  busy: boolean
  onRetry: () => void
}

/** Barra inferior fija en móvil: el total y el botón para continuar (libro de marca, "Cotizador 3D"). */
export function MobileBar({ price, continueLabel, onContinue, disabled, busy, onRetry }: MobileBarProps) {
  return (
    <div data-testid="barra-movil" className="sticky bottom-0 z-20 -mx-6 hidden border-t border-relieve bg-betun max-[900px]:block max-[600px]:-mx-4">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <p className="text-nota text-mermelada-suave">Total estimado</p>
          <Amount price={price} currency={false} className="text-cuerpo font-semibold" />
          {price.failed && <RetryPrice onRetry={onRetry} compact />}
          {price.rejectedReason && <RejectedPrice reason={price.rejectedReason} />}
        </div>
        <Button onClick={onContinue} disabled={disabled} aria-busy={busy || undefined} className="shrink-0">
          {continueLabel}
        </Button>
      </div>
    </div>
  )
}

function SummaryList({ rows }: { rows: SummaryRow[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.step} className="flex items-center justify-between gap-4 border-t border-relieve py-3">
          <div className="flex min-w-0 flex-col">
            <p className="text-nota text-mermelada-suave">{row.label}</p>
            <p className="text-cuerpo font-semibold">{row.value}</p>
            {row.note && <p className="text-nota font-semibold text-mermelada">{row.note}</p>}
          </div>
          {row.canChange && (
            <Link
              to={{ search: `?paso=${row.step}` }}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-sm text-etiqueta underline underline-offset-4 ${focusRing}`}
            >
              Cambiar<span className="sr-only"> {row.label.toLowerCase()}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

/** "Tu pastel" de escritorio: lo elegido con "Cambiar". No aparece mientras está vacío. */
export function SummaryCard({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="tu-pastel" className="flex flex-col gap-3 rounded-lg border border-relieve bg-betun p-6 max-[900px]:hidden">
      <h2 id="tu-pastel" className="font-display text-titulo-3 font-medium">
        Tu pastel
      </h2>
      <SummaryList rows={rows} />
    </section>
  )
}

/** En móvil, "Tu pastel" se abre como desplegable: "Ver tu pastel (3 elegidos)". */
export function SummaryDisclosure({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null
  return (
    <details className="group hidden rounded-md border border-relieve bg-betun max-[900px]:block">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 py-3 text-etiqueta [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        Ver tu pastel ({rows.length} {rows.length === 1 ? 'elegido' : 'elegidos'})
        <CaretDown size={18} aria-hidden="true" className="shrink-0 motion-safe:transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-2">
        <SummaryList rows={rows} />
      </div>
    </details>
  )
}
