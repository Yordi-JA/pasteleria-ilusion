import type { ReactNode } from 'react'
import ButtonLink from '../../components/ButtonLink.tsx'
import Card from '../../components/Card.tsx'
import { inlineLink } from '../../components/focus.ts'
import Pending from '../../components/Pending.tsx'
import type { StoreDetails } from '../../viewmodels/useStoreInfo.ts'

const column = 'mx-auto w-full max-w-[1200px] px-6 py-12 max-[600px]:px-4'

/** Una tarjeta centrada con un título y sus salidas, para los estados del pedido que no se pagan aquí. */
export function StateCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={column}>
      <Card large className="mx-auto flex max-w-[640px] flex-col items-start gap-4">
        <h2 className="font-display text-titulo-2">{title}</h2>
        {children}
      </Card>
    </div>
  )
}

/** Sin `?pedido=`, con uno que no es un número, ajeno o que no existe (404): no se muestra nada del pedido. */
export function MissingOrder() {
  return (
    <StateCard title="No encontramos el pedido que vas a pagar">
      <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para pagar el que está apartado.</p>
      <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
    </StateCard>
  )
}

/** `cancelled`: venció sin pagarse (regla 10). Lo que apartó ya se liberó; el carrito se vació al crearlo (D66). */
export function ExpiredOrder() {
  return (
    <StateCard title="Este pedido venció sin pagarse">
      <p className="text-cuerpo text-mermelada-suave">No se te cobró nada. Vuelve a hacer tu pedido para elegir otra fecha y hora.</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/pedido">Realizar pedido</ButtonLink>
        <ButtonLink to="/vitrina" variant="secondary">
          Ver la vitrina
        </ButtonLink>
      </div>
    </StateCard>
  )
}

/** `awaiting_quote` u otro estado sin desglose: todavía no hay nada que pagar. */
export function QuoteOrder() {
  return (
    <StateCard title="Este pedido espera su cotización">
      <p className="text-cuerpo text-mermelada-suave">La pastelería revisa la imagen de tu decoración y te dice su precio. Hasta entonces no pagas nada.</p>
      <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
    </StateCard>
  )
}

type RefundProps = { orderId: number; amount: string; orderReceived: boolean; store: StoreDetails }

/**
 * `refund_required` (D68): la pasarela cobró, pero el pedido ya no podía recibir el pago (venció, ya estaba pagado o su
 * horario se llenó). La pastelería lo devuelve a mano; la persona escribe por WhatsApp con su número de pedido.
 */
export function RefundOrder({ orderId, amount, orderReceived, store }: RefundProps) {
  return (
    <StateCard title="Te devolvemos tu pago">
      <p className="text-cuerpo">
        Cobramos {amount} cuando tu pedido {orderId} ya no podía recibir pagos.{orderReceived ? ' Tu pedido sí está pagado: este cobro es de más.' : ''}
      </p>
      <p className="text-cuerpo text-mermelada-suave">La pastelería te devuelve ese dinero. Escríbenos por WhatsApp con tu número de pedido para coordinarlo.</p>
      {store.whatsapp ? (
        <a href={store.whatsapp.url} target="_blank" rel="noopener noreferrer" className={`${inlineLink} inline-flex min-h-11 items-center font-semibold`}>
          Escribir por WhatsApp al {store.whatsapp.display}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      ) : (
        <p className="text-cuerpo font-semibold">
          WhatsApp: <Pending what="número" />
        </p>
      )}
      <ButtonLink to="/cuenta" variant="secondary">
        Ver mis pedidos
      </ButtonLink>
    </StateCard>
  )
}
