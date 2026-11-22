import { useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useParams } from 'react-router'
import AddToCartNotice from '../components/AddToCartNotice.tsx'
import Breadcrumb from '../components/Breadcrumb.tsx'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import ChoiceOption from '../components/ChoiceOption.tsx'
import Duya from '../components/Duya.tsx'
import HeroCake from '../components/HeroCake.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import ProductPhoto from '../components/ProductPhoto.tsx'
import QuantityStepper from '../components/QuantityStepper.tsx'
import Reveal from '../components/Reveal.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import type { ProductCardView } from '../viewmodels/productCards.ts'
import { useHeroCake } from '../viewmodels/useHeroCake.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useProductDetail } from '../viewmodels/useProductDetail.ts'
import type { ProductDetailView } from '../viewmodels/useProductDetail.ts'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'
const VIEW_NAME = 'Ficha de producto'
const NOT_FOUND = 'No encontramos este producto'

type Ready = NonNullable<ProductDetailView['view']>

/**
 * Encabezado sobre `fresa` (Ficha.dc.html): la foto a la izquierda (`media`), que se apoya en la guirnalda y la cruza, y a la derecha
 * el nombre (`h1`), la descripción y, si los hay, los estados de hoy ("En vitrina hoy", "Rebanado hoy"), que pide la regla de la
 * ficha (22 de noviembre: sin migas, sin el tipo ni "Ver la foto"; la barra ya dice dónde estás y la foto original va en la tarjeta
 * "Pastel"). En escritorio el texto va centrado en vertical con la foto o el modelo: con dos piezas,
 * pegado abajo quedaba a media altura del pastel. En móvil el texto va primero.
 */
function HeroLayout({ view, heading, media }: { view: Ready; heading?: RefObject<HTMLHeadingElement | null>; media: ReactNode }) {
  return (
    <section aria-labelledby="ficha-titulo" className="bg-fresa">
      <div className={`${column} grid grid-cols-2 items-center gap-12 pt-10 max-[960px]:grid-cols-1 max-[960px]:gap-6`}>
        {/* La foto baja 21 px sobre la guirnalda (la cruza) y queda encima de ella. */}
        <div className="relative z-[2] -mb-[21px] max-[960px]:order-1">
          {media}
          <div aria-hidden="true" className="mx-auto -mt-3 h-4 w-[62%] rounded-[50%] bg-mermelada/[.16] blur-[12px]" />
        </div>
        <div className="flex flex-col gap-4">
          {/* Enfocable desde el código: recibe el foco si la escena lo tenía y desaparece. */}
          <h1 ref={heading} id="ficha-titulo" tabIndex={-1} className="font-display text-display outline-none max-[600px]:text-titulo-1">
            {view.name}
          </h1>
          {view.description && <p className="max-w-[520px] text-cuerpo text-mermelada-suave">{view.description}</p>}
          {/* "En vitrina hoy" y "Rebanado hoy" (reglas de negocio, la ficha): texto pequeño, sin pastillas de color. */}
          {view.statuses.length > 0 && (
            <p className="flex flex-wrap gap-x-3 text-nota font-semibold text-mermelada-suave">
              {view.statuses.map((status) => (
                <span key={status}>{status}</span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * El encabezado con el modelo 3D del producto en el lugar de la foto (D95): la escena de la portada (`HeroCake`, D48) en la caja de
 * la foto, que gira sola, se arrastra, gira con las flechas, se pausa fuera de pantalla y respeta "reducir movimiento". Mientras
 * llega se ve un esqueleto de la caja; sin WebGL 2 o si falla, la foto recortada o su hueco.
 */
function ModelHero({ view, model }: { view: Ready; model: NonNullable<Ready['model']> }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const cake = useHeroCake({ shape: model.shape })
  const hintId = useId()
  const media = (
    <div className="mx-auto w-full max-w-[460px]">
      <p id={hintId} className="sr-only">
        Arrástralo para girarlo. Usa las flechas izquierda y derecha para girarlo.
      </p>
      <HeroCake
        cake={cake}
        hintId={hintId}
        size="product"
        testId="ficha-modelo"
        label={model.label}
        onFocusEscape={() => heading.current?.focus()}
        // La caja de la escena es más baja que la de la foto: la foto (o su hueco) cabe por su alto, centrada.
        fallback={<ProductPhoto photo={view.photo} shape="tiers3" onFresa className="mx-auto aspect-[360/300] !h-full !w-auto" />}
      />
    </div>
  )
  return <HeroLayout view={view} heading={heading} media={media} />
}

/** El encabezado: con el modelo 3D del producto si lo tiene (D95); si no, con su foto o su hueco. */
function Hero({ view }: { view: Ready }) {
  if (view.model) return <ModelHero view={view} model={view.model} />
  return <HeroLayout view={view} media={<ProductPhoto photo={view.photo} shape="tiers3" onFresa className="mx-auto w-full max-w-[460px]" />} />
}

/** "Elige tu pastel": presentación, cuándo, cantidad y "Agregar al pedido" (el botón principal de la ficha). */
function ChooseCard({ detail, view }: { detail: ProductDetailView; view: Ready }) {
  const { actions } = detail
  return (
    <Card large className="flex flex-col gap-5">
      {view.slicedToday && (
        // Ya está al cargar la ficha: no es una región viva (D43).
        <Notice title="Hoy se vende en rebanadas" live={false}>
          <p>Llévate una rebanada hoy de la vitrina, o encarga el pastel completo.</p>
          <TextLink to="/rebanadas">Ver rebanadas de hoy</TextLink>
        </Notice>
      )}
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
                disabled={option.disabledReason !== null}
                disabledReason={option.disabledReason ?? undefined}
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
            <p className="border-t border-relieve pt-5 text-cuerpo text-mermelada-suave">
              {view.pricePending ? 'Por ahora no se puede agregar: su precio está por confirmar.' : 'Hoy no se puede agregar: solo se vende en la vitrina y hoy no hay.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-cuerpo text-mermelada-suave">Por ahora este producto no tiene presentaciones a la venta.</p>
      )}
      <AddToCartNotice feedback={detail.feedback} />
    </Card>
  )
}

/**
 * "¿Lo quieres seco, envinado o más grande?": avisa las condiciones antes de abrir "Diseña tu pastel". Un pastel que sale en la
 * vitrina (tanda 2) se personaliza con su tipo, pan y relleno: solo se eligen la cobertura, la decoración y el mensaje.
 */
function PersonalizeCard({ personalize }: { personalize: NonNullable<Ready['personalize']> }) {
  const { minKg, leadDays } = personalize
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-relieve bg-nata p-6 max-[600px]:p-4">
      <h3 className="font-display text-titulo-3">{personalize.title}</h3>
      {personalize.showcase ? (
        <p className="text-cuerpo text-mermelada-suave">
          Elige su cobertura, su decoración y su mensaje. Pedidos con <LeadDays days={leadDays} /> de anticipación.
        </p>
      ) : (
        <p className="text-cuerpo text-mermelada-suave">
          Parte de este sabor y cámbialo a tu gusto. Pedidos desde{' '}
          {minKg === undefined ? <Skeleton inline className="h-[1em] w-10 align-[-0.15em]" /> : minKg === null ? <Pending what="kilos" /> : `${minKg} kg`}, con precio
          por kilo y <LeadDays days={leadDays} /> de anticipación.
        </p>
      )}
      <ButtonLink to={personalize.href} variant="secondary" className="self-start">
        Personalizar este pastel
      </ButtonLink>
    </div>
  )
}

/**
 * "Pastel" (o "Postre"): la foto original del producto, con su fondo, cuadrada y a todo lo ancho de la tarjeta (22 de noviembre,
 * en lugar de Conservación y Transporte). Guarda su lugar con su medida antes de llegar y se pide al acercarse, porque queda bajo
 * el encabezado. Mientras llega, el fondo `harina` de la caja.
 */
function OriginalPhotoCard({ photo }: { photo: NonNullable<Ready['originalPhoto']> }) {
  return (
    <Card large className="!p-3">
      <img
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className="block aspect-square h-auto w-full rounded-md bg-harina object-cover"
      />
    </Card>
  )
}

function RelatedCard({ product }: { product: ProductCardView }) {
  return (
    <Card as="article" large className="tarjeta-elevable flex h-full flex-col gap-2.5 !p-5">
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
      <Reveal className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1">
        <section aria-labelledby="ficha-elige" className="flex flex-col gap-4">
          <h2 id="ficha-elige" className="font-display text-titulo-2">
            Elige tu pastel
          </h2>
          <ChooseCard detail={detail} view={view} />
          {view.personalize && <PersonalizeCard personalize={view.personalize} />}
        </section>
        {view.originalPhoto && (
          <section aria-labelledby="ficha-foto" className="flex flex-col gap-4">
            <h2 id="ficha-foto" className="font-display text-titulo-2">
              {view.originalPhoto.heading}
            </h2>
            <OriginalPhotoCard photo={view.originalPhoto} />
          </section>
        )}
      </Reveal>
      {view.related.length > 0 && (
        <section aria-labelledby="ficha-relacionados" className="flex flex-col gap-6">
          <h2 id="ficha-relacionados" className="font-display text-titulo-2">
            También te puede gustar
          </h2>
          <Reveal as="ul" stagger className="grid grid-cols-3 gap-6 max-[960px]:grid-cols-1">
            {view.related.map((product) => (
              <li key={product.key}>
                <RelatedCard product={product} />
              </li>
            ))}
          </Reveal>
        </section>
      )}
    </div>
  )
}

/**
 * FichaCargando con el armado de la ficha (22 de noviembre): el encabezado con la caja de la foto, el nombre y la descripción, y
 * abajo "Elige tu pastel" y, si el producto la tiene, la tarjeta de la foto original.
 */
function DetailSkeleton({ withPhoto }: { withPhoto: boolean }) {
  return (
    <>
      <div className="bg-fresa">
        <div className={`${column} grid grid-cols-2 items-center gap-12 pb-12 pt-10 max-[960px]:grid-cols-1 max-[960px]:gap-6`}>
          <Skeleton tone="fresa" radius="md" className="mx-auto aspect-[460/340] w-full max-w-[460px] max-[960px]:order-1" />
          <div className="flex flex-col gap-4">
            <Skeleton tone="fresa" className="h-12 w-5/6 max-[600px]:h-9" />
            <Skeleton tone="fresa" className="h-4 w-3/5" />
          </div>
        </div>
      </div>
      <Duya color="fresa" />
      <div className={`${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 pb-20 pt-14 max-[960px]:grid-cols-1 max-[600px]:pb-14`}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-1/3" />
          <Card large className="flex flex-col gap-3">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton radius="md" className="h-16" />
            <Skeleton radius="md" className="h-16" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton radius="md" className="h-16" />
            <Skeleton radius="md" className="h-11" />
          </Card>
        </div>
        {withPhoto && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-7 w-1/4" />
            <Card large className="!p-3">
              <Skeleton radius="md" className="aspect-square w-full" />
            </Card>
          </div>
        )}
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
      <Duya color="fresa" />
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
    <LoadingRegion loading={status === 'loading'} label="Cargando el producto…" skeleton={<DetailSkeleton withPhoto={detail.withOriginalPhoto} />}>
      {view && (
        <>
          <Hero view={view} />
          <Duya color="fresa" />
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
