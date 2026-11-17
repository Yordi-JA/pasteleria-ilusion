import { useId, useRef } from 'react'
import type { RefObject } from 'react'
import Breadcrumb from '../components/Breadcrumb.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Duya from '../components/Duya.tsx'
import HeroCake from '../components/HeroCake.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import Card from '../components/Card.tsx'
import ProductCard, { compactGrid, featureGrid } from '../components/ProductCard.tsx'
import ProductPhoto from '../components/ProductPhoto.tsx'
import ProductGridSkeleton from '../components/ProductGridSkeleton.tsx'
import { LoadingRegion } from '../components/Skeleton.tsx'
import { useCatalog } from '../viewmodels/useCatalog.ts'
import type { CatalogView } from '../viewmodels/useCatalog.ts'
import { useHeroCake } from '../viewmodels/useHeroCake.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Catálogo'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'

/**
 * El pastel de tres pisos de la portada (libro de marca, "Presencia de marca"), en la escena chica del mockup: gira
 * solo, se arrastra y gira con las flechas, se pausa fuera de pantalla y respeta "reducir movimiento" (D48). Sus pisos
 * no se separan con el scroll: eso es solo de la portada. Lleva su pista para el lector de pantalla (el mockup no
 * muestra pista visible aquí). Si la escena con foco desaparece, el foco pasa a "Realizar pedido", como en la portada.
 */
function CatalogCake({ testId, actions }: { testId: string; actions: RefObject<HTMLDivElement | null> }) {
  const cake = useHeroCake({ separateOnScroll: false })
  const hintId = useId()
  return (
    <>
      <p id={hintId} className="sr-only">
        Arrastra el pastel para girarlo. Usa las flechas izquierda y derecha para girarlo.
      </p>
      <HeroCake cake={cake} hintId={hintId} size="compact" testId={testId} onFocusEscape={() => actions.current?.querySelector<HTMLElement>('a')?.focus()} />
    </>
  )
}

/**
 * Encabezado sobre `fresa` (Catalogo.dc.html): migas, `h1`, la línea que explica que cualquier sabor se pide en seco
 * o envinado al personalizarlo (libro de marca, "Catálogo y vitrina"), "Realizar pedido" y el pastel apoyado en la
 * guirnalda.
 */
function CatalogHeader({ leadDays }: { leadDays: CatalogView['leadDays'] }) {
  const actions = useRef<HTMLDivElement>(null)
  return (
    <section aria-labelledby="catalogo-titulo" className="bg-fresa">
      <div className={`${column} grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-end gap-10 pt-8 max-[960px]:grid-cols-1 max-[960px]:gap-4`}>
        <div className="flex flex-col gap-4 pb-20 max-[960px]:pb-0">
          <Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: TITLE }]} />
          <h1 id="catalogo-titulo" className="font-display text-display">
            {TITLE}
          </h1>
          <p className="max-w-[560px] text-cuerpo text-mermelada-suave">
            Pasteles y postres de nuestra vitrina, con sus precios. Cualquier sabor se puede pedir en seco o envinado al personalizarlo.
          </p>
          <div ref={actions} className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
            <p className="text-nota text-mermelada-suave">
              Vitrina para hoy mismo. Pedidos con <LeadDays days={leadDays} tone="fresa" /> de anticipación.
            </p>
          </div>
        </div>
        <CatalogCake testId="pastel-catalogo" actions={actions} />
      </div>
    </section>
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

/**
 * El pastel mini como una tarjeta más de la cuadrícula, con la forma de las demás (tanda 1, D77): antes era una franja de
 * aviso bajo los pasteles. No es un producto con ficha: desde la tanda 2, "Diseña tu pastel mini" abre el diseñador con el mini
 * ya elegido.
 */
function MiniCard({ price, href }: { price: string; href: string }) {
  return (
    <Card as="article" large className="mt-16 flex h-[calc(100%-4rem)] flex-col gap-2.5 !pt-0">
      {/* Mismo alto que la foto de tres pisos de las demás tarjetas, con el mini más chico y apoyado abajo. */}
      <div className="-mt-16 flex h-[254px] flex-col justify-end">
        <ProductPhoto photo={{ src: null, alt: 'Pastel mini', placeholder: 'Foto del pastel' }} shape="round" className="mx-auto w-full max-w-[200px]" />
        <div aria-hidden="true" className="mx-auto -mt-2.5 h-3.5 w-[40%] rounded-[50%] bg-mermelada/[.16] blur-[10px]" />
      </div>
      <p className="flex min-h-[26px] items-center text-nota text-mermelada-suave">Sabores normales</p>
      <h3 className="font-display text-titulo-2">Pastel mini</h3>
      <p className="flex-1 text-cuerpo text-mermelada-suave">Para unas 3 personas.</p>
      <p className="text-etiqueta tabular-nums">{price}</p>
      <ButtonLink to={href} variant="secondary" className="mt-1.5 w-full">
        Diseña tu pastel mini
      </ButtonLink>
    </Card>
  )
}

function CakesSection({ catalog }: { catalog: CatalogView }) {
  return (
    <section aria-labelledby="catalogo-pasteles" className="bg-nata">
      <div className={`${column} gap-8 pb-20 pt-16 max-[600px]:pb-14 max-[600px]:pt-12`}>
        <SectionTitle id="catalogo-pasteles" title="Pasteles" count={catalog.cakeCount} />
        <ul className={featureGrid}>
          {catalog.cakes.map((product) => (
            <li key={product.key}>
              <ProductCard product={product} />
            </li>
          ))}
          {catalog.miniPrice && (
            <li>
              <MiniCard price={catalog.miniPrice} href={catalog.miniDesignHref} />
            </li>
          )}
        </ul>
      </div>
    </section>
  )
}

function DessertsSection({ catalog }: { catalog: CatalogView }) {
  return (
    <section aria-labelledby="catalogo-postres" className="bg-nata">
      <div className={`${column} gap-8 pb-20 pt-16 max-[600px]:pb-14 max-[600px]:pt-12`}>
        <div className="flex flex-col gap-2">
          <SectionTitle id="catalogo-postres" title="Postres y gelatinas" count={catalog.dessertCount} />
          <p className="text-cuerpo text-mermelada-suave">Flanes, tartas y gelatinas. Las gelatinas en vaso solo se venden cuando hay en vitrina.</p>
        </div>
        <ul className={compactGrid}>
          {catalog.desserts.map((product) => (
            <li key={product.key}>
              <ProductCard product={product} variant="compact" />
            </li>
          ))}
        </ul>
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
      <Duya color="fresa" below="nata" />
      <LoadingRegion loading={catalog.status === 'loading'} label="Cargando el catálogo…" skeleton={<CatalogSkeleton />}>
        <Results catalog={catalog} />
      </LoadingRegion>
    </>
  )
}
