import { useRef } from 'react'
import type { ReactNode } from 'react'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import Pending from '../components/Pending.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { useBasesInfo } from '../viewmodels/useBasesInfo.ts'
import type { BasesInfoState, BasesInfoView } from '../viewmodels/useBasesInfo.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Bases en préstamo'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-[88px] pt-14 max-[600px]:px-4 max-[600px]:pb-14 max-[600px]:pt-10'
const sectionTitle = 'font-display text-titulo-2'
// Los renglones de las bases y de las condiciones llevan una línea `relieve` debajo, como el mockup.
const row = 'border-b border-relieve py-3.5'

/** El plazo para devolver la base ("15 días"), o el marcador de pendiente si la API no dio uno válido (regla 1). */
function Period({ view }: { view: BasesInfoView }) {
  return view.returnPeriod ?? <Pending what="días" />
}

/** La frase del encabezado. El plazo es un dato: mientras carga va en esqueleto, y si no llegó, la frase no lo dice. */
function Lead({ bases }: { bases: BasesInfoState }) {
  const first = 'Los pedidos llevan base según los kilos.'
  const rest = (period: ReactNode) => <> Dejas un depósito y te lo devolvemos si la regresas en {period} con tu nota.</>
  return (
    <p className="max-w-[620px] text-cuerpo text-mermelada-suave">
      {first}
      {bases.view
        ? rest(<Period view={bases.view} />)
        : bases.status === 'loading' && rest(<Skeleton inline tone="fresa" className="h-[1em] w-16 align-[-0.15em]" />)}
    </p>
  )
}

/** "Cómo funciona": tres pasos en línea con su perla; en móvil se apilan y la línea se va (BasesInfo.dc.html). */
function HowItWorks({ view }: { view: BasesInfoView }) {
  const steps = [
    { title: 'Se cobra con tu pedido', text: 'Junto con el anticipo, y queda retenido.' },
    { title: 'Devuelves la base', text: <>Hasta <Period view={view} /> después de la entrega, con tu nota.</> },
    { title: 'Te devolvemos el importe', text: 'Al regresar la base y presentar tu nota.' },
  ]
  return (
    <section aria-labelledby="bases-como-funciona" className="flex flex-col gap-8">
      <h2 id="bases-como-funciona" className={sectionTitle}>
        Cómo funciona
      </h2>
      <Card large className="!p-7 max-[600px]:!p-5">
        <ol aria-label="Cómo funciona el préstamo" className="flex gap-6 max-[700px]:flex-col max-[700px]:gap-2">
          {steps.map((step, index) => (
            <li key={step.title} className="relative flex min-w-0 flex-1 flex-col gap-1.5 pt-7">
              <span aria-hidden="true" className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full bg-mermelada" />
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="absolute left-5 right-2 top-3 h-0.5 bg-fresa max-[700px]:hidden" />
              )}
              <h3 className="font-display text-titulo-3">{step.title}</h3>
              <p className="text-cuerpo text-mermelada-suave">{step.text}</p>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}

/**
 * "Depósito según los kilos": cada base de la pastelería, de menos a más kilos, con su depósito y su nota, y al final lo
 * que se cobra arriba de la más grande. Sin bases, lo dice en lugar de dejar la tarjeta vacía.
 */
function Deposits({ view }: { view: BasesInfoView }) {
  return (
    <section aria-labelledby="bases-depositos" className="flex flex-col gap-8">
      <h2 id="bases-depositos" className={sectionTitle}>
        Depósito según los kilos
      </h2>
      <Card large className="!px-7 !py-2 max-[600px]:!px-5">
        {view.rows.length > 0 ? (
          <ul>
            {view.rows.map((stand) => (
              <li key={stand.key} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 ${row}`}>
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-display text-titulo-3">{stand.title}</h3>
                  {stand.note && <p className="text-cuerpo text-mermelada-suave">{stand.note}</p>}
                </div>
                <p className="whitespace-nowrap text-cuerpo font-semibold tabular-nums">{stand.deposit}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-cuerpo text-mermelada-suave">Por ahora no tenemos bases para préstamo. Escríbenos por WhatsApp.</p>
        )}
      </Card>
    </section>
  )
}

/** "Condiciones del préstamo". Lo que la pastelería no ha definido va con el marcador de pendiente (regla 1). */
function Conditions({ view }: { view: BasesInfoView }) {
  const conditions = [
    { term: 'Plazo para devolverla', value: <><Period view={view} /> después de entregado el pedido</> },
    { term: 'Si regresa dañada', value: view.damagedPolicy ?? <Pending what="Condiciones" /> },
    { term: 'Cuándo se libera el depósito', value: 'Al regresar la base y presentar tu nota (el PDF de tu pedido).' },
    { term: 'Pedidos que llevan base', value: view.fromKg ?? <Pending what="Kilos" /> },
  ]
  return (
    <section aria-labelledby="bases-condiciones" className="flex flex-col gap-8">
      <h2 id="bases-condiciones" className={sectionTitle}>
        Condiciones del préstamo
      </h2>
      <Card large className="!p-7 max-[600px]:!p-5">
        <dl>
          {conditions.map(({ term, value }) => (
            <div key={term} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 ${row}`}>
              <dt className="text-cuerpo font-semibold">{term}</dt>
              <dd className="whitespace-pre-line text-cuerpo text-mermelada-suave">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  )
}

/** "¿Tu pedido necesita base?": no depende de los datos, así que se ve también si la carga falla. */
function OrderCta() {
  return (
    <Card as="section" large aria-labelledby="bases-pedido" className="flex flex-wrap items-center justify-between gap-5 !p-7 max-[600px]:!p-5">
      <div className="flex flex-col gap-1.5">
        <h2 id="bases-pedido" className="font-display text-titulo-2 font-semibold">
          ¿Tu pedido necesita base?
        </h2>
        <p className="text-cuerpo text-mermelada-suave">Tu depósito se calcula según los kilos de tu pastel.</p>
      </div>
      <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
    </Card>
  )
}

/** El esqueleto con la forma de la pantalla: los tres títulos y sus tarjetas. */
function BasesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton radius="md" className="h-36 w-full" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton radius="md" className="h-72 w-full" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton radius="md" className="h-56 w-full" />
    </div>
  )
}

/** `/bases` (BasesInfo.dc.html): las bases de la pastelería con su depósito y las condiciones del préstamo. Sin 3D. */
export default function BasesInfo() {
  usePageTitle(TITLE)
  const bases = useBasesInfo()
  const heading = useRef<HTMLHeadingElement>(null)
  const retry = () => {
    heading.current?.focus()
    bases.retry()
  }
  return (
    <>
      <IllustratedHeader title={TITLE} titleId="bases-titulo" drawing="base" headingRef={heading}>
        <Lead bases={bases} />
      </IllustratedHeader>
      <div className={column}>
        <LoadingRegion loading={bases.status === 'loading'} label="Cargando las bases…" skeleton={<BasesSkeleton />} className="flex flex-col gap-8">
          {bases.status === 'error' && <LoadErrorNotice title="No se pudieron cargar las bases" onRetry={retry} />}
          {bases.view && (
            <>
              <HowItWorks view={bases.view} />
              <Deposits view={bases.view} />
              <Conditions view={bases.view} />
            </>
          )}
        </LoadingRegion>
        <OrderCta />
      </div>
    </>
  )
}
