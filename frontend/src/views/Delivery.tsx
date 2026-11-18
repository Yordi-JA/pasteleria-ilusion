import { useId, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useSearchParams } from 'react-router'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import { focusRing } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { formatDateInSentence } from '../models/dates.ts'
import type { OrderErrorsView } from '../viewmodels/orderErrors.ts'
import { paymentNote } from '../viewmodels/cartLines.ts'
import { formatTime } from '../viewmodels/deliverySchedule.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useDelivery } from '../viewmodels/useDelivery.ts'
import DateAndTime from './delivery/DateAndTime.tsx'
import DeliveryBar from './delivery/DeliveryBar.tsx'
import DeliveryProgress from './delivery/DeliveryProgress.tsx'
import QuoteDelivery from './delivery/QuoteDelivery.tsx'
import { DeliverySummary, FulfillmentStrip, Pickup, ScheduleRecap, SummaryPanel } from './delivery/DeliveryParts.tsx'

const TITLE = '¿Cómo recibes tu pedido?'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'

const STATUS_TEXT = { idle: '', uploading: 'Subiendo tus imágenes…', creating: 'Creando tu pedido…' } as const

/** La parte entra desde la derecha al avanzar y desde la izquierda al regresar, como la tarjeta de "Diseña tu pastel". */
const ENTER = { forward: 'motion-safe:animate-paso-derecha', back: 'motion-safe:animate-paso-izquierda' } as const

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

/** El aviso de los errores del servidor, enfocable para llevarle el foco. */
function ServerErrors({ errors, alertRef }: { errors: OrderErrorsView; alertRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={alertRef} tabIndex={-1} className={`rounded-md ${focusRing}`}>
      <Notice tone="error" title={errors.title}>
        <ul className="flex flex-col gap-1">
          {errors.messages.map((message, index) => (
            // Dos líneas pueden traer el mismo mensaje: la llave es su lugar en la lista, que no cambia.
            <li key={index}>{message}</li>
          ))}
        </ul>
      </Notice>
    </div>
  )
}

/** "¿Quién recoge?" mientras la API confirma la fecha y la hora guardadas: lo elegido, el título y la tarjeta de los campos. */
function PickupSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-[900px]:gap-6">
      <Skeleton radius="md" className="h-[72px]" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton radius="md" className="h-36" />
      </div>
      <Skeleton radius="md" className="h-11 w-48 max-[900px]:hidden" />
    </div>
  )
}

function CartDelivery() {
  usePageTitle(TITLE)
  const alertRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const scheduleRef = useRef<HTMLHeadingElement>(null)
  const pickupRef = useRef<HTMLHeadingElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const placedRef = useRef<HTMLHeadingElement>(null)
  const focus = useMemo(
    () => ({ alert: alertRef, name: nameRef, phone: phoneRef, schedule: scheduleRef, pickup: pickupRef, progress: progressRef, placed: placedRef }),
    [],
  )
  const delivery = useDelivery(focus)
  const formId = useId()

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
  const pickupPart = delivery.part === 2
  const summaryProps = { lines: delivery.lines, summary: delivery.summary, paymentNote: paymentNote(delivery.summary), delivery: delivery.deliveryRows }
  return (
    <>
      <CheckoutPageHeader title={TITLE} step="Entrega">
        <p className="text-cuerpo text-mermelada-suave">Elige cómo y cuándo lo recibes.</p>
      </CheckoutPageHeader>
      {/* `overflow-x-clip`: la parte que entra de lado no ensancha la página mientras se desliza. */}
      <div className={`${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 overflow-x-clip py-12 max-[900px]:grid-cols-1 max-[900px]:gap-y-6 max-[600px]:py-8`}>
        <div className="flex min-w-0 flex-col gap-6">
          <div ref={progressRef} className="scroll-mt-28">
            <DeliveryProgress current={delivery.part} />
          </div>
          {/* Una parte a la vez, como un carrusel (tanda 3): la `key` vuelve a montar la parte para que entre deslizándose. Con
              `?paso=2` y una fecha guardada, la parte espera a que la API la confirme. */}
          <LoadingRegion loading={delivery.checking} label="Revisando tu fecha y hora…" skeleton={<PickupSkeleton />}>
            <form
              key={delivery.part}
              id={formId}
              noValidate
              data-testid="parte-entrega"
              className={`flex flex-col gap-8 max-[900px]:gap-6 ${delivery.direction ? ENTER[delivery.direction] : ''}`}
              onSubmit={(event) => {
                event.preventDefault()
                if (pickupPart) void delivery.submit()
                else delivery.toPickup()
              }}
            >
              {pickupPart ? (
                <>
                  {delivery.when && <ScheduleRecap when={delivery.when} onChange={delivery.toSchedule} />}
                  <Pickup
                    name={delivery.pickupName}
                    phone={delivery.pickupPhone}
                    onName={delivery.editName}
                    onPhone={delivery.editPhone}
                    errors={delivery.fieldErrors}
                    nameRef={nameRef}
                    phoneRef={phoneRef}
                    headingRef={pickupRef}
                  />
                  {quote && (
                    <Notice tone="attention" title="Tu pedido queda en pausa por cotización" live={false}>
                      Lleva una decoración que la pastelería cotiza: al enviarlo, apartamos tu pedido sin cobrarte y te decimos el precio.
                    </Notice>
                  )}
                </>
              ) : (
                <>
                  <FulfillmentStrip store={delivery.store} />
                  <DateAndTime
                    calendar={delivery.calendar}
                    onChooseDay={delivery.chooseDay}
                    onChooseSlot={delivery.chooseSlot}
                    error={delivery.scheduleError}
                    headingRef={scheduleRef}
                  />
                </>
              )}
              <div className="flex flex-col gap-4">
                {delivery.errors && <ServerErrors errors={delivery.errors} alertRef={alertRef} />}
                {/* En móvil el botón va en la barra de abajo: uno solo por pantalla. */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-[900px]:hidden">
                  <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
                    {delivery.bar.action}
                  </Button>
                  {!pickupPart && <TextLink to="/carrito">Volver al carrito</TextLink>}
                </div>
                <p role="status" className="text-nota text-mermelada-suave">
                  {STATUS_TEXT[delivery.status]}
                </p>
              </div>
            </form>
          </LoadingRegion>
          <SummaryPanel title={delivery.summaryTitle} {...summaryProps} />
        </div>
        <DeliverySummary {...summaryProps} />
      </div>
      <DeliveryBar label={delivery.bar.label} value={delivery.bar.value} action={delivery.bar.action} form={formId} busy={busy || delivery.checking} />
    </>
  )
}
