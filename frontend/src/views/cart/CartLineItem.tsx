import { Link } from 'react-router'
import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import QuantityStepper from '../../components/QuantityStepper.tsx'
import { MAX_LINE_QUANTITY } from '../../models/cart.ts'
import type { CartLineView } from '../../viewmodels/cartLines.ts'

/** Un botón con forma de enlace ("Quitar", "Editar pedido"): la acción es de esta pantalla, no lleva a otra. */
export const textButton = `inline-flex min-h-11 cursor-pointer items-center rounded-sm text-etiqueta text-mermelada underline underline-offset-4 hover:decoration-2 ${focusRing}`

type CartLineItemProps = {
  line: CartLineView
  /** El símbolo va una sola vez por pantalla (libro de marca): en la primera base del carrito. */
  stamp: boolean
  /** Hay que preguntar antes de editar este pastel (hay otro a medias en "Diseña tu pastel"). */
  askingEdit: boolean
  onQuantity: (quantity: number) => void
  onRemove: () => void
  onEdit: () => void
  onConfirmEdit: () => void
  onCancelEdit: () => void
}

/** El hueco de la foto: el carrito no guarda fotos, y el nombre de la línea ya dice qué es (decorativo). */
function PhotoSlot() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-md bg-harina px-2 text-center text-nota text-mermelada-suave max-[600px]:h-[72px] max-[600px]:w-[72px]"
    >
      Foto del pastel
    </div>
  )
}

/**
 * Una línea del carrito (mockup de Carrito): de dónde sale ("En vitrina hoy", "Por encargo"), el nombre, la cantidad con
 * "−" y "+", "Quitar" y el importe. Un pastel diseñado lleva lo elegido, "Editar pedido" y, con base, su depósito.
 */
export default function CartLineItem({ line, stamp, askingEdit, onQuantity, onRemove, onEdit, onConfirmEdit, onCancelEdit }: CartLineItemProps) {
  const isDesign = line.key.kind === 'design'
  return (
    <li className="flex gap-4 border-b border-relieve py-6 first:pt-0 last:border-b-0 last:pb-0 max-[600px]:gap-3">
      <PhotoSlot />
      <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-4 gap-y-3 max-[600px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-nota font-semibold text-mermelada-suave">{line.origin}</p>
          <h3 className="font-display text-titulo-3">
            {line.slug ? (
              <Link to={`/pasteles/${line.slug}`} className={`rounded-sm hover:underline hover:underline-offset-4 ${focusRing}`}>
                {line.name}
              </Link>
            ) : (
              line.name
            )}
          </h3>
          {line.details.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-nota text-mermelada-suave">
              {line.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          {line.requiresQuote && (
            <p className="text-nota font-semibold text-mermelada">En pausa por cotización: la pastelería te dice el precio de la decoración.</p>
          )}
        </div>
        <div className="row-span-2 flex flex-col items-end text-right max-[600px]:row-span-1 max-[600px]:row-start-3 max-[600px]:items-start max-[600px]:text-left">
          <p className="text-titulo-3 tabular-nums">{line.total ?? 'Precio por confirmar'}</p>
          {line.unitNote && <p className="text-nota text-mermelada-suave">{line.unitNote}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {line.key.kind === 'offering' && (
            <>
              <QuantityStepper value={line.quantity} max={MAX_LINE_QUANTITY} itemName={line.name} onChange={onQuantity} />
              {line.presentation && <span className="text-nota text-mermelada-suave">{line.presentation}</span>}
            </>
          )}
          {isDesign && (
            <button type="button" className={textButton} aria-label={`Editar pedido: ${line.name}`} onClick={onEdit}>
              Editar pedido
            </button>
          )}
          <button type="button" className={textButton} aria-label={`Quitar ${line.name}`} onClick={onRemove}>
            Quitar
          </button>
        </div>
        {askingEdit && (
          <div className="col-span-full">
            <Notice tone="attention" title="Tienes otro pastel a medias en Diseña tu pastel">
              <p>Si editas este, el que llevas a medias se reemplaza.</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={onConfirmEdit} autoFocus>
                  Editar este pastel
                </Button>
                <button type="button" className={textButton} onClick={onCancelEdit}>
                  Seguir en el carrito
                </button>
              </div>
            </Notice>
          </div>
        )}
        {line.base && (
          <div className="col-span-full flex items-start gap-3 rounded-md bg-harina px-4 py-3.5">
            {stamp && <img src={symbol} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />}
            <p className="text-nota">
              <strong className="block font-semibold">Incluye base{line.base.kg ? ` para ${line.base.kg} kg` : ''}</strong>
              Depósito de {line.base.deposit}: te lo devolvemos al regresar la base.
            </p>
          </div>
        )}
      </div>
    </li>
  )
}
