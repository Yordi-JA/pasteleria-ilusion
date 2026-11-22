import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useReferenceSent } from '../viewmodels/useReferenceSent.ts'
import OrderTimeline from './orders/OrderTimeline.tsx'
import { StateCard } from './payment/PaymentStates.tsx'
import { column, ReferenceSummary, sectionTitle, twoColumns } from './reference/ReferenceParts.tsx'

const TITLE = 'Recibimos tu solicitud'

/** La misma estructura que la pantalla: "Qué sigue" y "Lo que nos enviaste". */
function SentSkeleton() {
  return (
    <div className={twoColumns}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton radius="md" className="h-96 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton radius="md" className="h-80 w-full" />
      </div>
    </div>
  )
}

/**
 * `/pedido/referencia/enviada?solicitud=<id>` (D70, mockup `SolicitudEnviada`): la solicitud recibida, su número, la
 * línea de "Qué sigue" y lo que se mandó. El sitio sí manda el correo (D70): la frase dice el de la cuenta.
 */
export default function ReferenceSent() {
  usePageTitle(TITLE)
  const sent = useReferenceSent()
  const { load, view } = sent

  let body
  if (load.status === 'missing') {
    body = (
      <StateCard title="No encontramos tu solicitud">
        <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver en qué va cada solicitud.</p>
        <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
      </StateCard>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu solicitud" onRetry={sent.retry} />
      </div>
    )
  } else if (view) {
    body = (
      <div className={twoColumns}>
        <section aria-labelledby="enviada-sigue" className="flex min-w-0 flex-col gap-4">
          <h2 id="enviada-sigue" className={sectionTitle}>
            Qué sigue
          </h2>
          <Card large className="flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-display text-titulo-2">Solicitud #{view.id}</h3>
              <p className="text-nota font-semibold">{view.statusLabel}</p>
            </div>
            <OrderTimeline steps={view.steps} labelledBy="enviada-sigue" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink to={view.quotePath}>Ver mi solicitud</ButtonLink>
              <TextLink to="/catalogo">Seguir viendo el catálogo</TextLink>
            </div>
          </Card>
        </section>
        <ReferenceSummary title="Lo que nos enviaste" headingId="enviada-referencia" photos={view.photos} description={view.description} facts={view.facts} />
      </div>
    )
  }

  return (
    <>
      <IllustratedHeader title={TITLE} titleId="enviada-titulo" drawing="toldo">
        <p className="max-w-[560px] text-cuerpo text-mermelada-suave">
          Te enviaremos la cotización a {sent.email ?? 'tu correo'} en máximo 1 hora. También la verás en tu cuenta.
        </p>
      </IllustratedHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu solicitud…" skeleton={<SentSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
