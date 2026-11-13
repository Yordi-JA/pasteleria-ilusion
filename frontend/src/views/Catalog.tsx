import { useId, useRef } from 'react'
import type { RefObject } from 'react'
import Breadcrumb from '../components/Breadcrumb.tsx'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Duya from '../components/Duya.tsx'
import FilterChips from '../components/FilterChips.tsx'
import HeroCake from '../components/HeroCake.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import ProductCard, { compactGrid, featureGrid } from '../components/ProductCard.tsx'
import ProductGridSkeleton from '../components/ProductGridSkeleton.tsx'
import SearchField from '../components/SearchField.tsx'
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
 * no se separan con el scroll: eso es solo de la portada. Cada uno lleva su propia escena, con su pista para el
 * lector de pantalla (el mockup no muestra pista visible aquí). Si la escena con foco desaparece, el foco pasa al
 * enlace de su misma sección ("Realizar pedido"), como en la portada.
 */
function CatalogCake({ testId, onColor = false, actions }: { testId: string; onColor?: boolean; actions: RefObject<HTMLDivElement | null> }) {
  const cake = useHeroCake({ separateOnScroll: false })
  const hintId = useId()
  return (
    <>
      <p id={hintId} className="sr-only">
        Arrastra el pastel para girarlo. Usa las flechas izquierda y derecha para girarlo.
      </p>
      <HeroCake cake={cake} hintId={hintId} size="compact" testId={testId} onColor={onColor} onFocusEscape={() => actions.current?.querySelector<HTMLElement>('a')?.focus()} />
    </>
  )
}

/**
 * Encabezado sobre `fresa` (Catalogo.dc.html): migas, `h1`, la línea que explica que cualquier sabor se pide en seco
 * o envinado al personalizarlo (libro de marca, "Catálogo y vitrina"), "Realizar pedido" y el pastel apoyado en las
 * conchas.
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

/**
 * La barra de filtros, fija arriba al hacer scroll bajo la barra del sitio (libro de marca): tipo de producto y
 * búsqueda. Se queda a la vista aunque cargue: la búsqueda vuelve a pedir y el campo no debe perder el foco.
 */
function FilterBar({ catalog, searchInput }: { catalog: CatalogView; searchInput: RefObject<HTMLInputElement | null> }) {
  return (
    <div data-testid="filtros-catalogo" className="sticky top-[100px] z-20 border-b border-relieve bg-betun py-4 max-[600px]:top-[84px] max-[600px]:py-3">
      <div className={`${column} !flex-row flex-wrap items-center justify-between gap-3`}>
        <FilterChips legend="Tipo de producto" name="categoria" options={catalog.filters} onChange={catalog.setFilter} />
        <SearchField
          label="Buscar en el catálogo"
          placeholder="Ej. durazno, imposible, flan"
          value={catalog.search.text}
          maxLength={catalog.search.maxLength}
          onChange={catalog.search.type}
          onSubmit={catalog.search.submit}
          inputRef={searchInput}
          className="w-[340px] max-[600px]:w-full"
        />
      </div>
    </div>
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
        <SectionTitle id="catalogo-pasteles" title="Pasteles" count={catalog.cakeCount} />
        <ul className={featureGrid}>
          {catalog.cakes.map((product) => (
            <li key={product.key}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
        {catalog.mini && (
          <div className="flex flex-col gap-1 rounded-lg border border-relieve bg-betun px-6 py-5 max-[600px]:px-4">
            <p className="font-display text-titulo-3">{catalog.mini}</p>
            <p className="text-cuerpo text-mermelada-suave">
              En cualquier sabor normal. No hay mini con queso ni con flan. Elige «Mini» en la ficha del sabor que quieras.
            </p>
          </div>
        )}
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

/** "¿No encuentras el pastel que imaginas?": la sección destacada en `mermelada` a media página (mockup). */
function DesignBand() {
  const actions = useRef<HTMLDivElement>(null)
  return (
    <section aria-labelledby="catalogo-imaginas" className="bg-mermelada text-sobre-color">
      <div className={`${column} grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-10 py-16 max-[960px]:grid-cols-1 max-[960px]:gap-2 max-[600px]:py-12`}>
        <div ref={actions} className="flex flex-col gap-4">
          <h2 id="catalogo-imaginas" className="font-display text-titulo-1">
            ¿No encuentras el pastel que imaginas?
          </h2>
          <p className="max-w-[560px] text-cuerpo text-sobre-color-suave">Arma tu pastel: elige pisos, sabor, relleno y decoración, y ve el precio antes de confirmar.</p>
          <ButtonLink to={ORDER_LINK.to} variant="onColor" className="self-start">
            {ORDER_LINK.label}
          </ButtonLink>
        </div>
        <CatalogCake testId="pastel-imaginas" onColor actions={actions} />
      </div>
    </section>
  )
}

/** Dibujo de línea de la duya (`assets/motivos/dibujo-duya.svg`) en `mermelada` al 30%, para el catálogo sin resultados. */
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

/** Sin resultados (libro de marca, "Estados"): el dibujo, la frase y una o dos salidas. */
function EmptyResults({ catalog, onCleared }: { catalog: CatalogView; onCleared: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <PipingDrawing />
      <h2 className="max-w-[560px] font-display text-titulo-2">{catalog.emptyMessage}</h2>
      {catalog.canClearSearch && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            variant="secondary"
            onClick={() => {
              catalog.search.clear()
              onCleared()
            }}
          >
            Borrar búsqueda
          </Button>
          {catalog.canSearchAll && (
            <Button
              variant="secondary"
              onClick={() => {
                catalog.setFilter('all')
                onCleared()
              }}
            >
              Buscar en todo el catálogo
            </Button>
          )}
        </div>
      )}
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

/** Lo que va entre la barra de filtros y la guirnalda, según el estado de la carga. */
function Results({ catalog, focusSearch }: { catalog: CatalogView; focusSearch: () => void }) {
  if (catalog.status === 'error') {
    return (
      <div className={`${column} py-16`}>
        <LoadErrorNotice
          title="No se pudo cargar el catálogo"
          onRetry={() => {
            focusSearch()
            catalog.retry()
          }}
        />
      </div>
    )
  }
  const updating = catalog.status === 'updating'
  const showCakes = catalog.cakes.length > 0
  const showDesserts = catalog.desserts.length > 0
  return (
    <>
      {/* Mientras llega otra búsqueda, los resultados anteriores quedan tenues y ocupados. */}
      <div aria-busy={updating || undefined} className={`motion-safe:transition-opacity ${updating ? 'opacity-60' : ''}`}>
        {catalog.empty && (
          <div className={`${column} bg-nata`}>
            <EmptyResults catalog={catalog} onCleared={focusSearch} />
          </div>
        )}
        {showCakes && <CakesSection catalog={catalog} />}
      </div>
      <Duya type="perlas" color="nata" below="mermelada" />
      <DesignBand />
      <Duya type="perlas" color="mermelada" below="nata" />
      {showDesserts ? (
        <div aria-busy={updating || undefined} className={`motion-safe:transition-opacity ${updating ? 'opacity-60' : ''}`}>
          <DessertsSection catalog={catalog} />
        </div>
      ) : (
        // Campo `nata` de cierre: la guirnalda cuelga de `nata` y la sección `mermelada` no queda pegada al pie.
        <div aria-hidden="true" className="h-12 bg-nata" />
      )}
    </>
  )
}

/** `/catalogo`: el catálogo con sus filtros y su búsqueda en la URL (D59). */
export default function Catalog() {
  usePageTitle(TITLE)
  const catalog = useCatalog()
  const searchInput = useRef<HTMLInputElement>(null)
  const focusSearch = () => searchInput.current?.focus()
  return (
    <>
      <CatalogHeader leadDays={catalog.leadDays} />
      <Duya type="concha" color="fresa" below="betun" />
      <FilterBar catalog={catalog} searchInput={searchInput} />
      {/* Anuncia cuántos resultados hay al terminar cada búsqueda o filtro; siempre montada para que se lea. */}
      <p role="status" data-testid="resultados-catalogo" className="sr-only">
        {catalog.announcement}
      </p>
      <LoadingRegion loading={catalog.status === 'loading'} label="Cargando el catálogo…" skeleton={<CatalogSkeleton />}>
        <Results catalog={catalog} focusSearch={focusSearch} />
      </LoadingRegion>
    </>
  )
}
