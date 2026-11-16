import { useMemo, useRef } from 'react'
import Breadcrumb from '../components/Breadcrumb.tsx'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import { focusRing } from '../components/focus.ts'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import type { ValidityView } from '../viewmodels/referenceView.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useQuote } from '../viewmodels/useQuote.ts'
import { StateCard } from './payment/PaymentStates.tsx'
import { column, ReferenceSummary, sectionTitle, twoColumns, WhatsAppLink } from './reference/ReferenceParts.tsx'

/** La misma estructura que la cotización: dos columnas de tarjetas. */
function QuoteSkeleton() {
  return (
    <div className={twoColumns}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton radius="md" className="h-96 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton radius="md" className="h-80 w-full" />
      </div>
    </div>
  )
}

function ValidityLine({ validity }: { validity: ValidityView }) {
  if (validity.kind === 'pending') {
    return (
      <p className="text-nota text-mermelada-suave">
        Esta cotización es válida hasta el <Pending what="vigencia" />.
      </p>
    )
  }
  if (validity.kind === 'until') return <p className="text-nota text-mermelada-suave">Esta cotización es válida hasta el {validity.text}.</p>
  return null
}

/**
 * `/cuenta/cotizaciones/:id` (D70, mockup `Cotizacion`): la solicitud con su estado en palabras; con la cotización lista,
 * el precio, la nota de la pastelería, el anticipo, el resto y la vigencia (PENDIENTE con su marcador), "Aceptar y
 * pagar", "Pedir un cambio" y "Escribir por WhatsApp". "Cancelar solicitud" no está en el mockup: es un botón secundario
 * que pregunta antes, en la misma tarjeta. Pide sesión; una solicitud ajena (404) no muestra nada de ella.
 */
export default function Quote() {
  const confirmRef = useRef<HTMLHeadingElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const focus = useMemo(() => ({ confirm: confirmRef, cancel: cancelRef, alert: alertRef, done: doneRef }), [])
  const page = useQuote(focus)
  const { load, view, store } = page
  usePageTitle(page.title)

  let body
  if (load.status === 'missing') {
    body = (
      <StateCard title="No encontramos esta solicitud">
        <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver en qué va cada solicitud.</p>
        <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
      </StateCard>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu solicitud" onRetry={page.retry} />
      </div>
    )
  } else if (view) {
    const quote = view.quote
    const expired = quote?.validity.kind === 'expired'
    body = (
      <div className={twoColumns}>
        <section aria-labelledby="cotizacion-tuya" className="flex min-w-0 flex-col gap-4">
          <h2 id="cotizacion-tuya" className={sectionTitle}>
            Tu cotización
          </h2>
          <Card large className="flex flex-col gap-5">
            {page.cancelError && (
              <div ref={alertRef} tabIndex={-1} className={`rounded-md ${focusRing}`}>
                <Notice tone="error" title="No pudimos cancelar tu solicitud">
                  {page.cancelError}
                </Notice>
              </div>
            )}

            {view.status === 'in_review' && (
              <div className="flex flex-col gap-2">
                <p className="text-cuerpo font-semibold">Estamos preparando tu cotización.</p>
                <p className="text-cuerpo text-mermelada-suave">Te la mandamos por correo en máximo 1 hora y también la ves aquí. Hasta que la aceptes no se cobra nada.</p>
              </div>
            )}

            {view.status === 'quote_ready' && quote && (
              <>
                <table className="w-full border-collapse text-cuerpo">
                  <caption className="sr-only">Precio de tu cotización</caption>
                  <tbody>
                    <tr className="border-y border-relieve">
                      <th scope="row" className="py-3 pr-4 text-left font-semibold">
                        {quote.rows.line.label}
                        <span className="block text-nota font-normal text-mermelada-suave">{quote.rows.line.detail}</span>
                      </th>
                      <td className="py-3 text-right align-top font-semibold tabular-nums">{quote.rows.line.amount}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="pt-4 text-left font-display text-titulo-3">
                        Total del pedido
                      </th>
                      <td className="pt-4 text-right font-display text-titulo-3 tabular-nums">{quote.rows.total}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="pt-3 text-left font-normal text-mermelada-suave">
                        {quote.rows.advance.label}
                      </th>
                      <td className="pt-3 text-right font-semibold tabular-nums">{quote.rows.advance.amount}</td>
                    </tr>
                    {quote.rows.base && (
                      <tr>
                        <th scope="row" className="pt-1 text-left font-normal text-mermelada-suave">
                          {quote.rows.base.label}
                          <span className="block text-nota">Depósito, se libera al devolverla</span>
                        </th>
                        <td className="pt-1 text-right align-top font-semibold tabular-nums">{quote.rows.base.amount}</td>
                      </tr>
                    )}
                    <tr>
                      <th scope="row" className="pt-1 text-left font-semibold">
                        {quote.rows.payToday.label}
                      </th>
                      <td className="pt-1 text-right font-semibold tabular-nums">{quote.rows.payToday.amount}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="pt-1 text-left font-normal text-mermelada-suave">
                        {quote.rows.payLater.label}
                      </th>
                      <td className="pt-1 text-right font-semibold tabular-nums">{quote.rows.payLater.amount}</td>
                    </tr>
                  </tbody>
                </table>
                {quote.note && (
                  <div className="rounded-md bg-harina px-4 py-3 text-nota">
                    <p className="font-semibold">Nota de la pastelería</p>
                    <p className="whitespace-pre-line break-words">{quote.note}</p>
                  </div>
                )}
                {expired && (
                  <Notice tone="attention" title="Esta cotización venció" live={false}>
                    Ya no se puede aceptar. Pide una nueva y la revisamos con gusto.
                  </Notice>
                )}
                {view.acceptPath && (
                  <ButtonLink to={view.acceptPath} className="w-full">
                    Aceptar y pagar
                  </ButtonLink>
                )}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <WhatsAppLink store={store} message={view.changeMessage} variant="button">
                    Pedir un cambio
                  </WhatsAppLink>
                  {store.whatsapp && (
                    <WhatsAppLink store={store} message={view.talkMessage}>
                      Escribir por WhatsApp
                    </WhatsAppLink>
                  )}
                </div>
                <ValidityLine validity={quote.validity} />
              </>
            )}

            {view.status === 'accepted' && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-cuerpo font-semibold">Ya es tu pedido #{view.orderId}.</p>
                <p className="text-cuerpo text-mermelada-suave">Ahí ves su pago, su entrega y en qué va.</p>
                {view.orderPath && <ButtonLink to={view.orderPath}>Ver mi pedido</ButtonLink>}
              </div>
            )}

            {view.status === 'cancelled' && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-cuerpo">Cancelaste esta solicitud. No se te cobró nada.</p>
                <TextLink to="/pedido/referencia">Enviar otra referencia</TextLink>
              </div>
            )}

            {view.status === 'in_review' && (
              <WhatsAppLink store={store} message={view.talkMessage}>
                Escribir por WhatsApp
              </WhatsAppLink>
            )}

            {view.canCancel && (
              <div className="flex flex-col items-start gap-3 border-t border-relieve pt-4">
                {page.confirming ? (
                  <div className="flex w-full flex-col gap-3 rounded-md border-2 border-cajeta p-4">
                    <h3 ref={confirmRef} tabIndex={-1} className={`self-start rounded-sm text-cuerpo font-semibold ${focusRing}`}>
                      ¿Cancelas tu solicitud?
                    </h3>
                    <p className="text-nota text-mermelada-suave">No se cobra nada y borramos tus fotos. Si cambias de idea, envía otra referencia.</p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={() => void page.confirmCancel()} disabled={page.cancelling}>
                        Sí, cancelar solicitud
                      </Button>
                      <Button variant="secondary" onClick={page.keep} disabled={page.cancelling}>
                        No, conservarla
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button ref={cancelRef} variant="secondary" onClick={page.askCancel}>
                    Cancelar solicitud
                  </Button>
                )}
              </div>
            )}
            <p ref={doneRef} tabIndex={-1} role="status" className={`rounded-sm text-nota font-semibold ${focusRing}`}>
              {page.cancelled ? 'Cancelamos tu solicitud.' : ''}
            </p>
          </Card>
        </section>
        <ReferenceSummary title="Tu referencia" headingId="cotizacion-referencia" photos={view.photos} description={view.description} facts={view.facts} />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={page.title}
        before={<Breadcrumb items={[{ label: 'Mi cuenta', to: '/cuenta' }, { label: 'Mis pedidos', to: '/cuenta' }, { label: page.title }]} />}
      >
        {view ? (
          <>
            <p className="text-cuerpo text-mermelada-suave">{view.dates}</p>
            <p data-testid="estado-solicitud" className="text-etiqueta font-semibold">
              {view.statusLabel}
            </p>
          </>
        ) : (
          load.status === 'loading' && (
            <div aria-hidden="true" className="flex flex-col gap-3">
              <Skeleton tone="fresa" className="h-5 w-80 max-w-full" />
              <Skeleton tone="fresa" className="h-4 w-36" />
            </div>
          )
        )}
      </PageHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu solicitud…" skeleton={<QuoteSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
