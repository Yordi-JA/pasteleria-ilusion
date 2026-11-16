import { useMemo, useRef } from 'react'
import Button from '../../components/Button.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import Card from '../../components/Card.tsx'
import CheckoutPageHeader from '../../components/CheckoutPageHeader.tsx'
import { focusRing } from '../../components/focus.ts'
import LoadErrorNotice from '../../components/LoadErrorNotice.tsx'
import Notice from '../../components/Notice.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import { parseRequestId } from '../../viewmodels/referenceView.ts'
import { usePageTitle } from '../../viewmodels/usePageTitle.ts'
import { useQuoteDelivery } from '../../viewmodels/useQuoteDelivery.ts'
import { StateCard } from '../payment/PaymentStates.tsx'
import { SlotPicker } from './DateAndTime.tsx'
import { Fulfillment, Pickup } from './DeliveryParts.tsx'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
const grid = `${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} radius="md" className="h-16" />
      ))}
    </div>
  )
}

/**
 * `/pedido/entrega?cotizacion=<id>` (D70): la entrega de una cotización aceptada. El día es el del evento y no se cambia;
 * se eligen la hora y quién recoge, y "Continuar al pago" crea el pedido con `accept/` y lleva al pago (D68). Reutiliza
 * las partes de la entrega del carrito (D66) sin tocar su flujo.
 */
export default function QuoteDelivery({ title, rawId }: { title: string; rawId: string }) {
  usePageTitle(title)
  const alertRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const scheduleRef = useRef<HTMLHeadingElement>(null)
  const placedRef = useRef<HTMLHeadingElement>(null)
  const focus = useMemo(() => ({ alert: alertRef, name: nameRef, phone: phoneRef, schedule: scheduleRef, placed: placedRef }), [])
  const page = useQuoteDelivery(parseRequestId(rawId), focus)
  const { load, block, slots } = page

  let body
  if (load.status === 'missing') {
    body = (
      <StateCard title="No encontramos esta solicitud">
        <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver tus solicitudes.</p>
        <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
      </StateCard>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu cotización" onRetry={page.retry} />
      </div>
    )
  } else if (block === 'accepted') {
    body = (
      <StateCard title="Ya aceptaste esta cotización">
        <p className="text-cuerpo text-mermelada-suave">Ya es tu pedido. Ahí ves su pago y su entrega.</p>
        {page.orderPath && <ButtonLink to={page.orderPath}>Ver mi pedido</ButtonLink>}
      </StateCard>
    )
  } else if (block) {
    const text = {
      not_ready: ['Tu cotización todavía no está lista', 'Te avisamos por correo en cuanto la tengamos. Hasta entonces no se cobra nada.'],
      expired: ['Esta cotización venció', 'Ya no se puede aceptar. Pide una nueva desde tu solicitud o por WhatsApp.'],
      cancelled: ['Cancelaste esta solicitud', 'No se te cobró nada. Si quieres, envía otra referencia.'],
    }[block]
    body = (
      <StateCard title={text[0]}>
        <p className="text-cuerpo text-mermelada-suave">{text[1]}</p>
        <ButtonLink to={page.quotePath}>Volver a tu solicitud</ButtonLink>
      </StateCard>
    )
  } else if (load.status === 'ready' && page.summary) {
    const summary = page.summary
    const busy = page.status !== 'idle'
    body = (
      <div className={grid}>
        <form
          noValidate
          className="flex min-w-0 flex-col gap-12"
          onSubmit={(event) => {
            event.preventDefault()
            void page.submit()
          }}
        >
          <Fulfillment store={page.store} />
          <section aria-labelledby="fecha-hora" className="flex flex-col gap-4">
            <h2 id="fecha-hora" ref={scheduleRef} tabIndex={-1} className={`self-start rounded-sm font-display text-titulo-2 ${focusRing}`}>
              Fecha y hora
            </h2>
            <Card large className="flex flex-col gap-5">
              {page.fieldErrors.schedule && <p className="text-nota font-semibold text-error">{page.fieldErrors.schedule}</p>}
              <div className="flex flex-col gap-1">
                <h3 className="text-etiqueta">Fecha</h3>
                <p data-testid="dia-del-evento" className="font-display text-titulo-3">
                  {page.eventDay}, el día de tu evento
                </p>
                <p className="text-nota text-mermelada-suave">La fecha es la de tu solicitud. Para cambiarla, escríbenos antes de aceptar.</p>
              </div>
              {slots.status === 'error' ? (
                <LoadErrorNotice title="No pudimos cargar los horarios" onRetry={slots.reload} />
              ) : (
                <LoadingRegion loading={slots.status === 'loading'} label="Cargando los horarios…" skeleton={<SlotsSkeleton />}>
                  {slots.open ? (
                    <SlotPicker calendar={slots} onChooseSlot={page.chooseSlot} />
                  ) : (
                    <Notice tone="attention" title="Ese día ya no tiene horarios" live={false}>
                      Escríbenos por WhatsApp desde tu solicitud y lo resolvemos contigo.
                    </Notice>
                  )}
                </LoadingRegion>
              )}
            </Card>
          </section>
          <Pickup
            name={page.pickupName}
            phone={page.pickupPhone}
            onName={page.editName}
            onPhone={page.editPhone}
            errors={page.fieldErrors}
            nameRef={nameRef}
            phoneRef={phoneRef}
          />
          <div className="flex flex-col gap-4">
            {page.errors && (
              <div ref={alertRef} tabIndex={-1} className={`rounded-md ${focusRing}`}>
                <Notice tone="error" title={page.errors.title}>
                  <ul className="flex flex-col gap-1">
                    {page.errors.messages.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button type="submit" disabled={busy}>
                Continuar al pago
              </Button>
              <TextLink to={page.quotePath}>Volver a tu solicitud</TextLink>
            </div>
            <p role="status" className="text-nota text-mermelada-suave">
              {busy ? 'Creando tu pedido…' : ''}
            </p>
          </div>
        </form>
        <section aria-labelledby="entrega-resumen" className="flex min-w-0 flex-col gap-4">
          <h2 id="entrega-resumen" className="font-display text-titulo-2">
            Resumen
          </h2>
          <Card large className="flex flex-col gap-4">
            <p className="flex items-start justify-between gap-4 border-y border-relieve py-3 text-cuerpo">
              <span className="flex flex-col">
                <span className="font-semibold">{summary.rows.line.label}</span>
                <span className="text-nota text-mermelada-suave">Solicitud #{page.requestId}</span>
              </span>
              <span className="font-semibold tabular-nums">{summary.rows.line.amount}</span>
            </p>
            <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-titulo-3">
              <span>Total del pedido</span>
              <span className="tabular-nums">{summary.rows.total}</span>
            </p>
            <p className="text-nota text-mermelada-suave">{summary.payToday}</p>
          </Card>
        </section>
      </div>
    )
  }

  return (
    <>
      <CheckoutPageHeader title={title}>
        <p className="text-cuerpo text-mermelada-suave">
          Solicitud #{page.requestId}: elige la hora del día de tu evento y quién recoge.
        </p>
      </CheckoutPageHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu cotización…" skeleton={<div className={`${column} py-12`}><Skeleton radius="md" className="h-96 w-full" /></div>}>
        {body}
      </LoadingRegion>
    </>
  )
}
