import { useRef } from 'react'
import { useParams } from 'react-router'
import AddToCartNotice from '../components/AddToCartNotice.tsx'
import Breadcrumb from '../components/Breadcrumb.tsx'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import ChoiceOption from '../components/ChoiceOption.tsx'
import Duya from '../components/Duya.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import ProductPhoto from '../components/ProductPhoto.tsx'
import QuantityStepper from '../components/QuantityStepper.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import type { ProductCardView } from '../viewmodels/productCards.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useProductDetail } from '../viewmodels/useProductDetail.ts'
import type { ProductDetailView } from '../viewmodels/useProductDetail.ts'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'
const VIEW_NAME = 'Ficha de producto'
const NOT_FOUND = 'No encontramos este producto'

type Ready = NonNullable<ProductDetailView['view']>

/**
 * Encabezado sobre `fresa` (Ficha.dc.html): la foto a la izquierda, que se apoya en las conchas y las cruza, y a la
 * derecha las migas, el tipo, el nombre (`h1`), la descripción y los precios. En móvil el texto va primero.
 */
function Hero({ view }: { view: Ready }) {
  return (
    <section aria-labelledby="ficha-titulo" className="bg-fresa">
      <div className={`${column} grid grid-cols-2 items-end gap-12 pt-10 max-[960px]:grid-cols-1 max-[960px]:gap-6`}>
        {/* La foto baja 21 px sobre las conchas (las cruza) y queda encima de ellas. */}
        <div className="relative z-[2] -mb-[21px] max-[960px]:order-1">
          <ProductPhoto photo={view.photo} shape="tiers3" onFresa className="mx-auto w-full max-w-[460px]" />
          <div aria-hidden="true" className="mx-auto -mt-3 h-4 w-[62%] rounded-[50%] bg-mermelada/[.16] blur-[12px]" />
        </div>
        <div className="flex flex-col gap-4 pb-12 max-[960px]:pb-0">
          <Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: 'Catálogo', to: '/catalogo' }, { label: view.name }]} />
          {(view.kind || view.status) && (
            <p className="flex flex-wrap gap-x-2 text-nota text-mermelada-suave">
              {view.kind && <span>{view.kind}</span>}
              {view.status && <span className="font-semibold">{view.status}</span>}
            </p>
          )}
          <h1 id="ficha-titulo" className="font-display text-display max-[600px]:text-titulo-1">
            {view.name}
          </h1>
          {view.description && <p className="max-w-[520px] text-cuerpo text-mermelada-suave">{view.description}</p>}
          {view.price && <p className="text-titulo-3 tabular-nums">{view.price}</p>}
        </div>
      </div>
    </section>
  )
}

/** "Elige tu pastel": presentación, cuándo, cantidad y "Agregar al pedido" (el botón principal de la ficha). */
function ChooseCard({ detail, view }: { detail: ProductDetailView; view: Ready }) {
  const { actions } = detail
  return (
    <Card large className="flex flex-col gap-5">
      {view.presentations.length > 0 ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-etiqueta">Presentación</legend>
            {view.presentations.map((option) => (
              <ChoiceOption
                key={option.id}
                name="presentacion"
                value={String(option.id)}
                label={option.label}
                description={option.description ?? undefined}
                trailing={option.price}
                checked={option.checked}
                onChange={() => actions.choosePresentation(option.id)}
              />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-etiqueta">¿Cuándo lo quieres?</legend>
            {view.fulfillments.map((option) => (
              <ChoiceOption
                key={option.value}
                name="cuando"
                value={option.value}
                label={option.label}
                description={option.description ?? undefined}
                disabled={option.disabledReason !== null}
                disabledReason={option.disabledReason ?? undefined}
                checked={option.checked}
                onChange={() => actions.chooseFulfillment(option.value)}
              />
            ))}
          </fieldset>
          {view.canAdd ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-relieve pt-5">
                <QuantityStepper value={view.quantity} max={view.maxQuantity} itemName={view.name} onChange={actions.setQuantity} />
                {view.unitPrice && <p className="text-titulo-3 tabular-nums">{view.unitPrice}</p>}
              </div>
              <Button onClick={actions.addToOrder} className="w-full">
                Agregar al pedido
              </Button>
            </>
          ) : (
            <p className="border-t border-relieve pt-5 text-cuerpo text-mermelada-suave">Hoy no se puede agregar: solo se vende en la vitrina y hoy no hay.</p>
          )}
        </>
      ) : (
        <p className="text-cuerpo text-mermelada-suave">Por ahora este producto no tiene presentaciones a la venta.</p>
      )}
      <AddToCartNotice feedback={detail.feedback} />
    </Card>
  )
}

/** "¿Lo quieres seco, envinado o más grande?": avisa las condiciones antes de abrir "Diseña tu pastel". */
function PersonalizeCard({ personalize }: { personalize: NonNullable<Ready['personalize']> }) {
  const { minKg, leadDays } = personalize
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-relieve bg-nata p-6 max-[600px]:p-4">
      <h3 className="font-display text-titulo-3">{personalize.title}</h3>
      <p className="text-cuerpo text-mermelada-suave">
        Parte de este sabor y cámbialo a tu gusto. Pedidos desde{' '}
        {minKg === undefined ? <Skeleton inline className="h-[1em] w-10 align-[-0.15em]" /> : minKg === null ? <Pending what="kilos" /> : `${minKg} kg`}, con precio por kilo
        y <LeadDays days={leadDays} /> de anticipación.
      </p>
      <ButtonLink to={personalize.href} variant="secondary" className="self-start">
        Personalizar este pastel
      </ButtonLink>
    </div>
  )
}

/** Conservación y Transporte: lo que falta lleva el marcador de pendiente (regla 1 de AGENTS.md). */
function DetailsCard({ view }: { view: Ready }) {
  return (
    <Card large>
      <dl className="flex flex-col">
        <div className="flex flex-col gap-1 border-b border-relieve pb-3.5">
          <dt className="text-etiqueta">Conservación</dt>
          <dd className="text-cuerpo text-mermelada-suave">{view.storageNotes ?? <Pending what="Conservación" />}</dd>
        </div>
        <div className="flex flex-col gap-1 pt-3.5">
          <dt className="text-etiqueta">Transporte</dt>
          <dd className="text-cuerpo text-mermelada-suave">{view.transportNotes ?? <Pending what="Transporte" />}</dd>
        </div>
      </dl>
    </Card>
  )
}

function RelatedCard({ product }: { product: ProductCardView }) {
  return (
    <Card as="article" large className="flex h-full flex-col gap-2.5 !p-5">
      <div className="rounded-md bg-harina px-6 py-3">
        <ProductPhoto photo={product.photo} shape="tiers2" className="mx-auto max-w-[200px]" />
      </div>
      <h3 className="font-display text-titulo-3">{product.name}</h3>
      {product.price && <p className="text-etiqueta tabular-nums">{product.price}</p>}
      <TextLink to={product.href} aria-label={`${product.linkLabel}: ${product.name}`} className="mt-auto">
        {product.linkLabel}
      </TextLink>
    </Card>
  )
}

function Body({ detail, view }: { detail: ProductDetailView; view: Ready }) {
  return (
    <div className={`${column} gap-8 pb-20 pt-14 max-[600px]:pb-14`}>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1">
        <section aria-labelledby="ficha-elige" className="flex flex-col gap-4">
          <h2 id="ficha-elige" className="font-display text-titulo-2">
            Elige tu pastel
          </h2>
          <ChooseCard detail={detail} view={view} />
          {view.personalize && <PersonalizeCard personalize={view.personalize} />}
        </section>
        <section aria-labelledby="ficha-detalles" className="flex flex-col gap-4">
          <h2 id="ficha-detalles" className="font-display text-titulo-2">
            Detalles
          </h2>
          <DetailsCard view={view} />
        </section>
      </div>
      {view.related.length > 0 && (
        <section aria-labelledby="ficha-relacionados" className="flex flex-col gap-6">
          <h2 id="ficha-relacionados" className="font-display text-titulo-2">
            También te puede gustar
          </h2>
          <ul className="grid grid-cols-3 gap-6 max-[960px]:grid-cols-1">
            {view.related.map((product) => (
              <li key={product.key}>
                <RelatedCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** FichaCargando: el encabezado con la foto y las líneas, y abajo los detalles y dos relacionados. */
function DetailSkeleton() {
  return (
    <>
      <div className="bg-fresa">
        <div className={`${column} grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-7 pb-14 pt-8 max-[960px]:grid-cols-1`}>
          <Skeleton tone="fresa" radius="md" className="aspect-[500/350] w-full max-[960px]:order-1" />
          <div className="flex flex-col gap-4">
            <Skeleton tone="fresa" className="h-3 w-1/3" />
            <Skeleton tone="fresa" className="h-8 w-5/6" />
            <Skeleton tone="fresa" className="h-3 w-3/5" />
            <Skeleton tone="fresa" className="h-5 w-1/4" />
            <div className="flex flex-col gap-3 rounded-lg bg-betun p-5">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton radius="md" className="h-12" />
              <Skeleton radius="md" className="h-12" />
              <Skeleton radius="md" className="h-11" />
            </div>
          </div>
        </div>
      </div>
      <Duya type="concha" color="fresa" />
      <div className={`${column} grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-7 py-10 max-[960px]:grid-cols-1`}>
        <Card large className="flex flex-col gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-3/4" />
        </Card>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-1/2" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((block) => (
              <Card key={block} className="flex flex-col gap-3">
                <Skeleton radius="md" className="aspect-[180/100] w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/** El producto no existe o ya no está activo (404 de la API): como `NotFound`, con salida al catálogo. */
function ProductNotFound() {
  return (
    <PageHeader title={NOT_FOUND} before={<Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: 'Catálogo', to: '/catalogo' }]} />}>
      <p className="text-cuerpo text-mermelada-suave">Puede que ya no esté a la venta. Mira lo que hay en el catálogo.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <TextLink to="/catalogo">Ver el catálogo</TextLink>
        <TextLink to="/">Ir a inicio</TextLink>
      </div>
    </PageHeader>
  )
}

function ProductError({ onRetry }: { onRetry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <div className="bg-fresa">
        <div className={`${column} gap-4 pb-12 pt-8`}>
          <Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: 'Catálogo', to: '/catalogo' }]} />
          <h1 ref={heading} tabIndex={-1} className="font-display text-titulo-1 outline-none">
            {VIEW_NAME}
          </h1>
        </div>
      </div>
      <Duya type="concha" color="fresa" />
      <div className={`${column} py-12`}>
        <LoadErrorNotice
          title="No se pudo cargar este producto"
          onRetry={() => {
            heading.current?.focus()
            onRetry()
          }}
        />
      </div>
    </>
  )
}

function ProductDetailContent({ slug }: { slug: string }) {
  const detail = useProductDetail(slug)
  const { status, view } = detail
  usePageTitle(status === 'notFound' ? NOT_FOUND : (view?.name ?? VIEW_NAME))
  if (status === 'notFound') return <ProductNotFound />
  if (status === 'error') return <ProductError onRetry={detail.retry} />
  return (
    <LoadingRegion loading={status === 'loading'} label="Cargando el producto…" skeleton={<DetailSkeleton />}>
      {view && (
        <>
          <Hero view={view} />
          <Duya type="concha" color="fresa" />
          <Body detail={detail} view={view} />
        </>
      )}
    </LoadingRegion>
  )
}

/** `/pasteles/:slug`: la ficha de un producto. Al pasar a otro (un relacionado), la elección empieza de nuevo. */
export default function ProductDetail() {
  const { slug = '' } = useParams()
  return <ProductDetailContent key={slug} slug={slug} />
}
