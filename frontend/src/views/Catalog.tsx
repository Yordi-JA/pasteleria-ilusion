import ButtonLink from '../components/ButtonLink.tsx'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import ProductCard, { compactGrid, featureGrid } from '../components/ProductCard.tsx'
import ProductGridSkeleton from '../components/ProductGridSkeleton.tsx'
import Reveal from '../components/Reveal.tsx'
import { LoadingRegion } from '../components/Skeleton.tsx'
import { useCatalog } from '../viewmodels/useCatalog.ts'
import type { CatalogView } from '../viewmodels/useCatalog.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Catálogo'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'

/**
 * Encabezado sobre `fresa` (Catalogo.dc.html) con el dibujo del pastel de pisos, como la vitrina y las rebanadas: migas, `h1`,
 * la línea que explica que cualquier sabor se pide en seco o envinado al personalizarlo (libro de marca, "Catálogo y vitrina"),
 * "Realizar pedido" y los días de anticipación. La tanda 6 quitó el pastel 3D: las tarjetas de abajo ya llevan los pasteles.
 */
function CatalogHeader({ leadDays }: { leadDays: CatalogView['leadDays'] }) {
  return (
    <IllustratedHeader title={TITLE} titleId="catalogo-titulo" drawing="pisos">
      <p className="max-w-[560px] text-cuerpo text-mermelada-suave">
        Pasteles y postres de nuestra vitrina, con sus precios. Cualquier sabor se puede pedir en seco o envinado al personalizarlo.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
        <p className="text-nota text-mermelada-suave">
          Vitrina para hoy mismo. Pedidos con <LeadDays days={leadDays} tone="fresa" /> de anticipación.
        </p>
      </div>
    </IllustratedHeader>
  )
}

function SectionTitle({ id, title, count }: { id: string; title: string; count: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="font-display text-titulo-1">
        {title}
      </h2>
      <p className="text-cuerpo text-mermelada-suave">{count}</p>
    </div>
  )
}

function CakesSection({ catalog }: { catalog: CatalogView }) {
  return (
    <section aria-labelledby="catalogo-pasteles" className="bg-nata">
      <div className={`${column} gap-8 pb-20 pt-16 max-[600px]:pb-14 max-[600px]:pt-12`}>
        <Reveal>
          <SectionTitle id="catalogo-pasteles" title="Pasteles" count={catalog.cakeCount} />
        </Reveal>
        <Reveal as="ul" stagger className={featureGrid}>
          {catalog.cakes.map((product) => (
            <li key={product.key}>
              <ProductCard product={product} />
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

function DessertsSection({ catalog }: { catalog: CatalogView }) {
  return (
    <section aria-labelledby="catalogo-postres" className="bg-nata">
      <div className={`${column} gap-8 pb-20 pt-16 max-[600px]:pb-14 max-[600px]:pt-12`}>
        <Reveal className="flex flex-col gap-2">
          <SectionTitle id="catalogo-postres" title="Postres y gelatinas" count={catalog.dessertCount} />
          <p className="text-cuerpo text-mermelada-suave">Flanes, tartas y gelatinas. Las gelatinas en vaso solo se venden cuando hay en vitrina.</p>
        </Reveal>
        <Reveal as="ul" stagger className={compactGrid}>
          {catalog.desserts.map((product) => (
            <li key={product.key}>
              <ProductCard product={product} variant="compact" />
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

/** Dibujo de línea de la duya (`assets/motivos/dibujo-duya.svg`) en `mermelada` al 30%, para el catálogo vacío. */
function PipingDrawing() {
  return (
    <svg viewBox="0 0 64 64" width="112" height="112" aria-hidden="true" className="opacity-30" fill="none" strokeWidth={2}>
      <g className="stroke-mermelada" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20c3-8 12-12 19-10l17 33-5 4z" />
        <path d="M12 20c-3-3-1-8 3-8M43 47l5 5 3-3-5-5" />
        <path d="M44 58c2-4 8-4 10 0M46 58c1-2 5-2 6 0" />
      </g>
    </svg>
  )
}

/** Catálogo vacío (libro de marca, "Estados"): el dibujo y la frase. */
function EmptyCatalog() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <PipingDrawing />
      <h2 className="max-w-[560px] font-display text-titulo-2">Por ahora no hay productos en el catálogo.</h2>
    </div>
  )
}

function CatalogSkeleton() {
  return (
    <div className={`${column} gap-8 pb-20 pt-16`}>
      <ProductGridSkeleton count={6} />
    </div>
  )
}

/** Lo que va entre el encabezado y el pie, según el estado de la carga. */
function Results({ catalog }: { catalog: CatalogView }) {
  if (catalog.status === 'error') {
    return (
      <div className={`${column} py-16`}>
        <LoadErrorNotice title="No se pudo cargar el catálogo" onRetry={catalog.retry} />
      </div>
    )
  }
  return (
    <>
      {catalog.empty && (
        <div className={`${column} bg-nata`}>
          <EmptyCatalog />
        </div>
      )}
      {catalog.cakes.length > 0 && <CakesSection catalog={catalog} />}
      {catalog.desserts.length > 0 && <DessertsSection catalog={catalog} />}
    </>
  )
}

/**
 * `/catalogo`: los pasteles y los postres, en dos secciones (D59). La tanda 1 de correcciones (D77) quitó la barra de
 * filtros, la búsqueda y la banda "¿No encuentras el pastel que imaginas?": el catálogo es corto y "Realizar pedido" ya
 * está en el encabezado.
 */
export default function Catalog() {
  usePageTitle(TITLE)
  const catalog = useCatalog()
  return (
    <>
      <CatalogHeader leadDays={catalog.leadDays} />
      <LoadingRegion loading={catalog.status === 'loading'} label="Cargando el catálogo…" skeleton={<CatalogSkeleton />}>
        <Results catalog={catalog} />
      </LoadingRegion>
    </>
  )
}
