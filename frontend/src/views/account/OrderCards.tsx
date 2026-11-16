import { Link } from 'react-router'
import { buttonClasses } from '../../components/buttonStyles.ts'
import Card from '../../components/Card.tsx'
import { inlineLink } from '../../components/focus.ts'
import Pending from '../../components/Pending.tsx'
import ProgressPearls from '../../components/ProgressPearls.tsx'
import { PEARL_STEPS } from '../../viewmodels/orderView.ts'
import type { OrderCardView } from '../../viewmodels/orderView.ts'
import type { RequestRowView } from '../../viewmodels/referenceView.ts'
import { ORDER_LINK_ATTRIBUTE } from '../../viewmodels/useMyOrders.ts'

/** El estado en palabras: perlas desde que se paga; si no, solo el texto (nunca solo color). */
function OrderStatus({ order }: { order: OrderCardView }) {
  if (order.pearl !== null) return <ProgressPearls steps={PEARL_STEPS} current={order.pearl} />
  return <span className="text-etiqueta font-semibold">{order.statusLabel}</span>
}

/** "Ver pedido": el número va para el lector de pantalla, porque hay un enlace igual por tarjeta. */
function SeeOrder({ order, className }: { order: OrderCardView; className: string }) {
  return (
    <Link to={order.href} className={className} {...{ [ORDER_LINK_ATTRIBUTE]: order.id }}>
      Ver pedido<span className="sr-only"> #{order.id}</span>
    </Link>
  )
}

/** Un pedido en curso (mockup `Cuenta`, "Pedido en curso"). "Apartado, falta tu pago" va como aviso `cajeta`. */
export function CurrentOrderCard({ order }: { order: OrderCardView }) {
  const titleId = `pedido-${order.id}`
  return (
    <Card as="article" large aria-labelledby={titleId} className="flex flex-col gap-3 max-[600px]:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={titleId} className="font-display text-titulo-3">
          {order.title}
        </h3>
        {order.payHref === null && <OrderStatus order={order} />}
      </div>
      {order.payHref && (
        <div className="flex flex-col gap-1 rounded-md border-2 border-cajeta px-4 py-3">
          <p className="text-cuerpo font-semibold">{order.statusLabel}</p>
          <Link to={order.payHref} className={`self-start text-cuerpo font-semibold ${inlineLink}`}>
            Pagar mi pedido
          </Link>
        </div>
      )}
      <p className="text-cuerpo text-mermelada-suave">{order.brief}</p>
      <p className="text-cuerpo text-mermelada-suave">{order.when}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-relieve pt-3">
        <p className="text-cuerpo text-mermelada-suave">{order.remaining ?? ''}</p>
        <SeeOrder order={order} className={buttonClasses('secondary')} />
      </div>
    </Card>
  )
}

/** Un pedido anterior (mockup `Cuenta`, "Pedidos anteriores"): número, fecha, resumen, total y estado. */
export function PreviousOrderRow({ order }: { order: OrderCardView }) {
  const titleId = `pedido-${order.id}`
  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-2 border-b border-relieve py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-cuerpo text-mermelada-suave">
          <span id={titleId} className="font-semibold text-mermelada">
            {order.title}
          </span>{' '}
          {order.created}
        </p>
        <p className="text-cuerpo font-semibold tabular-nums">{order.total}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-nota text-mermelada-suave">{order.brief}</p>
        <OrderStatus order={order} />
      </div>
      <SeeOrder order={order} className={`self-start text-etiqueta font-semibold ${inlineLink} inline-flex min-h-11 items-center`} />
    </article>
  )
}

/** Una solicitud de cotización en curso (mockup `Cuenta`, "Solicitudes de cotización"): número, línea, estado y enlace. */
export function QuoteRequestRow({ request }: { request: RequestRowView }) {
  const titleId = `solicitud-${request.id}`
  return (
    <article aria-labelledby={titleId} className="flex items-center justify-between gap-x-4 gap-y-2 py-4 max-[600px]:flex-col max-[600px]:items-start">
      <p className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="text-cuerpo font-semibold">
          {request.title}
        </span>
        <span className="text-nota text-mermelada-suave">
          {request.line.kind === 'pending' ? (
            <>
              Válida hasta el <Pending what="vigencia" />
            </>
          ) : (
            request.line.text
          )}
        </span>
      </p>
      <p className="flex shrink-0 flex-wrap items-center gap-x-4">
        <span className="text-etiqueta font-semibold">{request.statusLabel}</span>
        <Link to={request.href} className={`inline-flex min-h-11 items-center text-etiqueta font-semibold ${inlineLink}`}>
          {request.linkLabel}
          <span className="sr-only"> #{request.id}</span>
        </Link>
      </p>
    </article>
  )
}
