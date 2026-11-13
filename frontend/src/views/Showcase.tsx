import { useRef } from 'react'
import type { ReactNode } from 'react'
import AddToCartNotice from '../components/AddToCartNotice.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import FilterChips from '../components/FilterChips.tsx'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LineDrawing from '../components/LineDrawing.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import ProductGridSkeleton from '../components/ProductGridSkeleton.tsx'
import ShowcaseShelfItem, { showcaseGrid } from '../components/ShowcaseShelfItem.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useShowcase } from '../viewmodels/useShowcase.ts'
import type { ShowcaseView } from '../viewmodels/useShowcase.ts'

const TITLE = 'Vitrina'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'

/** "[Fecha de hoy]. Lo que hay hoy…": la fecha es un dato, en esqueleto mientras carga (como "Rebanadas de hoy"). */
function Lead({ showcase }: { showcase: ShowcaseView }) {
  const text = 'Lo que hay hoy en la pastelería para llevar. Las existencias se actualizan durante el día.'
  return (
    <p className="max-w-[620px] text-cuerpo text-mermelada-suave">
      {showcase.date ? (
        `${showcase.date}. ${text}`
      ) : showcase.status === 'loading' ? (
        <>
          <Skeleton inline tone="fresa" className="h-[1em] w-44 align-[-0.15em]" />. {text}
        </>
      ) : (
        text
      )}
    </p>
  )
}

/** VitrinaCargando: la fila de los chips y ocho tarjetas, en cuatro columnas y dos en móvil. */
function ShowcaseSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton radius="sm" className="h-11 w-56" />
      <ProductGridSkeleton count={8} variant="compact" />
    </div>
  )
}

/** Vacío o agotado (libro de marca, "Estados"): el toldo, la frase y sus salidas. */
function ShowcaseState({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <LineDrawing drawing="toldo" className="text-mermelada opacity-30" />
      <h2 className="font-display text-titulo-2">{title}</h2>
      <p className="max-w-[480px] text-cuerpo text-mermelada-suave">{children}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">{actions}</div>
    </div>
  )
}

function Content({ showcase, onRetry }: { showcase: ShowcaseView; onRetry: () => void }) {
  if (showcase.status === 'error') return <LoadErrorNotice title="No se pudo cargar la vitrina" onRetry={onRetry} />
  if (showcase.empty) {
    return (
      <ShowcaseState title="Por ahora no hay nada en la vitrina" actions={<ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>}>
        Puedes hacer un pedido con <LeadDays days={showcase.leadDays} /> de anticipación.
      </ShowcaseState>
    )
  }
  if (showcase.allSoldOut) {
    return (
      <ShowcaseState
        title="Por hoy se vendió todo lo de la vitrina"
        actions={
          <>
            <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
            <ButtonLink to="/rebanadas" variant="secondary">
              Ver rebanadas de hoy
            </ButtonLink>
          </>
        }
      >
        Puedes hacer un pedido con <LeadDays days={showcase.leadDays} /> de anticipación, o ver si quedan rebanadas de hoy.
      </ShowcaseState>
    )
  }
  if (showcase.emptyFilter) return <p className="text-cuerpo text-mermelada-suave">{showcase.emptyFilter}</p>
  return (
    <ul className={`${showcaseGrid} pt-2`}>
      {showcase.items.map((item) => (
        <ShowcaseShelfItem key={item.key} item={item} onAdd={showcase.add} field="nata" showRemaining titleAs="h2" />
      ))}
    </ul>
  )
}

/**
 * "¿No está lo que buscas?" (mockup): salida al catálogo y a "Realizar pedido". Con la vitrina vacía o agotada, el
 * botón principal ya es "Realizar pedido" de arriba, así que aquí los dos van como secundarios (uno principal por
 * pantalla, libro de marca).
 */
function NotHereCard({ primary }: { primary: boolean }) {
  return (
    <Card large className="flex flex-wrap items-center justify-between gap-5 !p-7 max-[600px]:!p-5">
      <div className="flex max-w-[620px] flex-col gap-1.5">
        <h2 className="font-display text-titulo-2">¿No está lo que buscas?</h2>
        <p className="text-cuerpo text-mermelada-suave">En el catálogo están todos los pasteles y postres que preparamos por encargo.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/catalogo" variant={primary ? 'primary' : 'secondary'}>
          Ver el catálogo
        </ButtonLink>
        <ButtonLink to={ORDER_LINK.to} variant="secondary">
          {ORDER_LINK.label}
        </ButtonLink>
      </div>
    </Card>
  )
}

/** `/vitrina`: lo que hay hoy para llevar, sobre `nata`, con repisas y el rebanado en su lugar (D60). */
export default function Showcase() {
  usePageTitle(TITLE)
  const showcase = useShowcase()
  const heading = useRef<HTMLHeadingElement>(null)
  const retry = () => {
    heading.current?.focus()
    showcase.retry()
  }
  const loading = showcase.status === 'loading'
  return (
    <>
      <IllustratedHeader title={TITLE} titleId="vitrina-titulo" drawing="toldo" headingRef={heading}>
        <Lead showcase={showcase} />
      </IllustratedHeader>
      <div className={`${column} pb-20 pt-12 max-[600px]:pb-14 max-[600px]:pt-10`}>
        {showcase.filters.length > 0 && <FilterChips legend="Filtrar la vitrina" name="filtro-vitrina" options={showcase.filters} onChange={showcase.setFilter} className="mb-8" />}
        {/*
          Siempre montado y en el flujo: una región viva oculta no se anuncia (D43). Queda fijo bajo la barra al bajar,
          así el aviso se ve aunque se agregue desde la última repisa; flota sobre las tarjetas y lleva su sombra.
        */}
        <AddToCartNotice feedback={showcase.feedback} sticky onDismiss={showcase.dismiss} />
        <LoadingRegion loading={loading} label="Cargando la vitrina…" skeleton={<ShowcaseSkeleton />}>
          <Content showcase={showcase} onRetry={retry} />
        </LoadingRegion>
        {!loading && (
          <div className="mt-16 max-[600px]:mt-12">
            <NotHereCard primary={!showcase.empty && !showcase.allSoldOut} />
          </div>
        )}
      </div>
    </>
  )
}
