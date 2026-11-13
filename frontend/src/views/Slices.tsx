import { useRef } from 'react'
import AddToCartNotice from '../components/AddToCartNotice.tsx'
import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LineDrawing from '../components/LineDrawing.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import { ORDER_LINK } from '../components/navigation.ts'
import ProductPhoto from '../components/ProductPhoto.tsx'
import QuantityStepper from '../components/QuantityStepper.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useSlices } from '../viewmodels/useSlices.ts'
import type { SlicePageItem, SlicesView } from '../viewmodels/useSlices.ts'

const TITLE = 'Rebanadas de hoy'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'
// Cuatro columnas y dos hasta 960 px, también en móvil (mockup).
const gridClass = 'grid grid-cols-4 gap-6 max-[960px]:grid-cols-2 max-[600px]:gap-3'

/** "[Fecha de hoy]. Disponibles hasta agotar existencias." La fecha es un dato: mientras carga va en esqueleto. */
function Lead({ slices }: { slices: SlicesView }) {
  const text = 'Disponibles hasta agotar existencias.'
  return (
    <p className="max-w-[620px] text-cuerpo text-mermelada-suave">
      {slices.date ? (
        `${slices.date}. ${text}`
      ) : slices.status === 'loading' ? (
        <>
          <Skeleton inline tone="fresa" className="h-[1em] w-44 align-[-0.15em]" />. {text}
        </>
      ) : (
        text
      )}
    </p>
  )
}

/** Cuántas quedan, o "Agotada por hoy" (D47). */
function Stock({ item }: { item: SlicePageItem }) {
  if (item.soldOut) return <p className="text-etiqueta text-mermelada">Agotada por hoy</p>
  return <p className="text-nota font-semibold text-mermelada-suave">{item.remaining}</p>
}

/** El contador y "Agregar al pedido"; una agotada solo lleva el botón desactivado "Agotada", como la portada (D47). */
function AddControls({ item, slices }: { item: SlicePageItem; slices: SlicesView }) {
  if (item.soldOut) {
    return (
      <Button variant="secondary" disabled className="w-full">
        Agotada
      </Button>
    )
  }
  return (
    <>
      <QuantityStepper
        value={item.quantity}
        max={item.stepMax}
        itemName={item.offering.name}
        onChange={(value) => slices.setQuantity(item.key, value)}
        className="w-full justify-between"
      />
      <Button variant="secondary" aria-label={`Agregar al pedido: ${item.offering.name}`} onClick={() => slices.add(item)} className="w-full">
        Agregar al pedido
      </Button>
    </>
  )
}

/** Una tarjeta de la cuadrícula (Rebanadas.dc.html). */
function SliceCard({ item, slices }: { item: SlicePageItem; slices: SlicesView }) {
  return (
    <li>
      <Card as="article" className="flex h-full flex-col gap-2.5 !p-4 max-[600px]:!p-3">
        <ProductPhoto photo={item.photo} shape="slice" />
        <h2 className="font-display text-titulo-3 max-[600px]:text-cuerpo max-[600px]:font-semibold max-[600px]:leading-snug">{item.name}</h2>
        <p className="text-etiqueta tabular-nums">{item.price}</p>
        <Stock item={item} />
        <div className="mt-auto flex flex-col gap-2.5 pt-1">
          <AddControls item={item} slices={slices} />
        </div>
      </Card>
    </li>
  )
}

/**
 * Una sola rebanada, lo de casi todos los días (regla 2, D60): una tarjeta ancha, con la foto junto a los datos, y al
 * lado "¿Lo quieres completo?", que lleva a la ficha para encargar el pastel completo (el rebanado no se vende
 * completo). Así la pantalla no queda con tres columnas vacías.
 */
function SingleSlice({ item, slices }: { item: SlicePageItem; slices: SlicesView }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6 max-[960px]:grid-cols-1">
      <Card as="article" large className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-8 max-[600px]:grid-cols-1 max-[600px]:gap-4">
        <ProductPhoto photo={item.photo} shape="slice" />
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-titulo-2">{item.name}</h2>
          <p className="text-etiqueta tabular-nums">{item.price}</p>
          <Stock item={item} />
          <div className="flex flex-col gap-2.5 pt-2">
            <AddControls item={item} slices={slices} />
          </div>
        </div>
      </Card>
      <aside aria-labelledby="rebanadas-completo" className="flex flex-col gap-2.5 rounded-lg border border-relieve bg-nata p-6 max-[600px]:p-4">
        <h2 id="rebanadas-completo" className="font-display text-titulo-3">
          ¿Lo quieres completo?
        </h2>
        <p className="text-cuerpo text-mermelada-suave">Encarga {item.name} completo y elige la fecha al terminar tu pedido.</p>
        <ButtonLink to={item.productHref} variant="secondary" aria-label={`Encargarlo completo: ${item.name}`} className="self-start">
          Encargarlo completo
        </ButtonLink>
      </aside>
    </div>
  )
}

/** Sin rebanadas hoy (libro de marca, "Estados"): la rebanada, la frase y dos salidas. */
function NoSlices({ leadDays }: { leadDays: SlicesView['leadDays'] }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <LineDrawing drawing="rebanada" className="text-mermelada opacity-30" />
      <h2 className="font-display text-titulo-2">Hoy no hay rebanadas</h2>
      <p className="max-w-[480px] text-cuerpo text-mermelada-suave">
        Mira lo que hay en la vitrina, o haz un pedido con <LeadDays days={leadDays} /> de anticipación.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
        <ButtonLink to="/vitrina" variant="secondary">
          Ver la vitrina
        </ButtonLink>
      </div>
    </div>
  )
}

function SlicesSkeleton() {
  return (
    <div className={gridClass}>
      {[1, 2, 3, 4].map((block) => (
        <Card key={block} className="flex flex-col gap-2.5 !p-4">
          <Skeleton radius="md" className="aspect-[200/120] w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton radius="md" className="h-11 w-full" />
          <Skeleton radius="md" className="h-11 w-full" />
        </Card>
      ))}
    </div>
  )
}

function Content({ slices, onRetry }: { slices: SlicesView; onRetry: () => void }) {
  if (slices.status === 'error') return <LoadErrorNotice title="No se pudieron cargar las rebanadas de hoy" onRetry={onRetry} />
  if (slices.layout === 'empty') return <NoSlices leadDays={slices.leadDays} />
  if (slices.layout === 'single') return <SingleSlice item={slices.items[0]} slices={slices} />
  return (
    <ul className={gridClass}>
      {slices.items.map((item) => (
        <SliceCard key={item.key} item={item} slices={slices} />
      ))}
    </ul>
  )
}

/** `/rebanadas`: las rebanadas de hoy, con su contador y "Agregar al pedido". */
export default function Slices() {
  usePageTitle(TITLE)
  const slices = useSlices()
  const heading = useRef<HTMLHeadingElement>(null)
  const retry = () => {
    heading.current?.focus()
    slices.retry()
  }
  return (
    <>
      <IllustratedHeader title={TITLE} titleId="rebanadas-titulo" drawing="rebanada" headingRef={heading}>
        <Lead slices={slices} />
      </IllustratedHeader>
      <div className={`${column} pb-20 pt-12 max-[600px]:pb-14 max-[600px]:pt-10`}>
        {/*
          Siempre montado y en el flujo: una región viva oculta no se anuncia (D43). Queda fijo bajo la barra al bajar,
          así el aviso se ve aunque se agregue desde la última repisa; flota sobre las tarjetas y lleva su sombra.
        */}
        <AddToCartNotice feedback={slices.feedback} sticky onDismiss={slices.dismiss} />
        <LoadingRegion loading={slices.status === 'loading'} label="Cargando las rebanadas de hoy…" skeleton={<SlicesSkeleton />}>
          <Content slices={slices} onRetry={retry} />
        </LoadingRegion>
      </div>
    </>
  )
}
