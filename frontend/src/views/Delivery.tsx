import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import { focusRing } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import TextLink from '../components/TextLink.tsx'
import { formatDateInSentence } from '../models/dates.ts'
import { paymentNote } from '../viewmodels/cartLines.ts'
import { formatTime } from '../viewmodels/deliverySchedule.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useDelivery } from '../viewmodels/useDelivery.ts'
import DateAndTime from './delivery/DateAndTime.tsx'
import QuoteDelivery from './delivery/QuoteDelivery.tsx'
import { DeliverySummary, Fulfillment, Pickup } from './delivery/DeliveryParts.tsx'

const TITLE = '¿Cómo recibes tu pedido?'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'

const STATUS_TEXT = { idle: '', uploading: 'Subiendo tus imágenes…', creating: 'Creando tu pedido…' } as const

/**
 * `/pedido/entrega` (D66): forma de entrega, fecha y hora con el calendario de la API, quién recoge y el resumen.
 * "Continuar al pago" crea el pedido en el servidor y lleva a `/pedido/pago`; con "Otra decoración" el pedido queda en
 * pausa por cotización y la pantalla lo dice. Pide sesión (`RequireSession`, D62). Con `?cotizacion=<id>` es la entrega de
 * una cotización aceptada (D70): el día del evento fijo, sin el carrito.
 */
export default function Delivery() {
  const [params] = useSearchParams()
  const quote = params.get('cotizacion')
  return quote === null ? <CartDelivery /> : <QuoteDelivery title={TITLE} rawId={quote} />
}

function CartDelivery() {
  usePageTitle(TITLE)
  const alertRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const scheduleRef = useRef<HTMLHeadingElement>(null)
  const placedRef = useRef<HTMLHeadingElement>(null)
  const focus = useMemo(() => ({ alert: alertRef, name: nameRef, phone: phoneRef, schedule: scheduleRef, placed: placedRef }), [])
  const delivery = useDelivery(focus)

  if (delivery.placedQuote) {
    const order = delivery.placedQuote
    const when = `${formatDateInSentence(order.deliveryDate) ?? order.deliveryDate} a las ${formatTime(order.slotStartsAt)}`
    return (
      <>
        <CheckoutPageHeader title={TITLE} step="Entrega" />
        <div className={`${column} py-12`}>
          <Card large className="mx-auto flex max-w-[640px] flex-col gap-4">
            <h2 ref={placedRef} tabIndex={-1} className={`self-start rounded-sm font-display text-titulo-2 ${focusRing}`}>
              Recibimos tu pedido
            </h2>
            <Notice tone="attention" title="En pausa por cotización" live={false}>
              La pastelería revisa la imagen de tu decoración y te dice su precio. Hasta entonces no pagas nada.
            </Notice>
            <p className="text-cuerpo">
              Pedido {order.id}, para recoger el {when}, a nombre de {order.pickupName}.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
              <ButtonLink to="/" variant="secondary">
                Ir a inicio
              </ButtonLink>
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (delivery.empty || delivery.conflict) {
    return (
      <>
        <CheckoutPageHeader title={TITLE} step="Entrega" />
        <div className={`${column} py-12`}>
          <Card large className="mx-auto flex max-w-[640px] flex-col items-start gap-4">
            {delivery.empty ? (
              <>
                <h2 className="font-display text-titulo-2">Tu carrito está vacío</h2>
                <p className="text-cuerpo text-mermelada-suave">Agrega algo de la vitrina o del catálogo para hacer tu pedido.</p>
                <ButtonLink to="/vitrina">Ver la vitrina</ButtonLink>
              </>
            ) : (
              <>
                <Notice tone="attention" title="Tu carrito no cabe en un solo pedido" live={false}>
                  Lo de la vitrina de hoy y un pastel de Diseña tu pastel van en pedidos separados (también dos decoraciones por
                  cotizar). Quita uno en tu carrito para continuar.
                </Notice>
                <ButtonLink to="/carrito">Volver al carrito</ButtonLink>
              </>
            )}
          </Card>
        </div>
      </>
    )
  }

  const busy = delivery.status !== 'idle'
  const quote = delivery.summary.requiresQuote
  return (
    <>
      <CheckoutPageHeader title={TITLE} step="Entrega">
        <p className="text-cuerpo text-mermelada-suave">Elige cómo y cuándo lo recibes.</p>
      </CheckoutPageHeader>
      <div className={`${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`}>
        <form
          noValidate
          className="flex flex-col gap-12"
          onSubmit={(event) => {
            event.preventDefault()
            void delivery.submit()
          }}
        >
          <Fulfillment store={delivery.store} />
          <DateAndTime
            calendar={delivery.calendar}
            onChooseDay={delivery.chooseDay}
            onChooseSlot={delivery.chooseSlot}
            error={delivery.fieldErrors.schedule}
            headingRef={scheduleRef}
          />
          <Pickup
            name={delivery.pickupName}
            phone={delivery.pickupPhone}
            onName={delivery.editName}
            onPhone={delivery.editPhone}
            errors={delivery.fieldErrors}
            nameRef={nameRef}
            phoneRef={phoneRef}
          />
          <div className="flex flex-col gap-4">
            {delivery.errors && (
              <div ref={alertRef} tabIndex={-1} className={`rounded-md ${focusRing}`}>
                <Notice tone="error" title={delivery.errors.title}>
                  <ul className="flex flex-col gap-1">
                    {delivery.errors.messages.map((message, index) => (
                      // Dos líneas pueden traer el mismo mensaje: la llave es su lugar en la lista, que no cambia.
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            {quote && (
              <Notice tone="attention" title="Tu pedido queda en pausa por cotización" live={false}>
                Lleva una decoración que la pastelería cotiza: al enviarlo, apartamos tu pedido sin cobrarte y te decimos el precio.
              </Notice>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button type="submit" disabled={busy}>
                {quote ? 'Enviar pedido' : 'Continuar al pago'}
              </Button>
              <TextLink to="/carrito">Volver al carrito</TextLink>
            </div>
            <p role="status" className="text-nota text-mermelada-suave">
              {STATUS_TEXT[delivery.status]}
            </p>
          </div>
        </form>
        <DeliverySummary lines={delivery.lines} summary={delivery.summary} paymentNote={paymentNote(delivery.summary)} />
      </div>
    </>
  )
}
