import { useRef } from 'react'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import Button from '../../components/Button.tsx'
import Card from '../../components/Card.tsx'
import ProductPhoto from '../../components/ProductPhoto.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import type { FeaturedItemView, FeaturedSection as FeaturedState } from '../../viewmodels/useHome.ts'
import { addNoticeSpacing, EmptyAfterError, Field, sectionColumn, sectionHeading, SectionError } from './sectionLayout.tsx'

type ItemProps = { item: FeaturedItemView; onAdd: FeaturedState['add'] }

function AddButton({ item, onAdd }: ItemProps) {
  const { addable } = item
  if (!addable) return null
  return (
    <Button variant="secondary" aria-label={`Agregar al pedido: ${addable.label}`} onClick={() => onAdd(addable)} className="shrink-0">
      Agregar al pedido
    </Button>
  )
}

/** La tarjeta grande: el primero de los pasteles de la casa, con la foto al centro y su sombra de contacto. */
function LargeCard({ item, onAdd }: ItemProps) {
  return (
    <Card as="article" large className="flex flex-col gap-4">
      <div className="pt-6">
        <ProductPhoto photo={item.photo} shape="tiers3" className="mx-auto w-full max-w-[420px]" />
        <div aria-hidden="true" className="mx-auto -mt-2.5 h-3.5 w-[70%] rounded-[50%] bg-mermelada/[.16] blur-[12px]" />
      </div>
      <h3 className="font-display text-titulo-2">{item.name}</h3>
      {item.summary && <p className="text-cuerpo text-mermelada-suave">{item.summary}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {item.price && <p className="text-titulo-3 font-semibold tabular-nums">{item.price}</p>}
        <AddButton item={item} onAdd={onAdd} />
      </div>
    </Card>
  )
}

/** Una fila de la lista: foto chica a la izquierda, nombre, descripción, precio y botón. */
function Row({ item, onAdd }: ItemProps) {
  return (
    <li className="border-b border-relieve py-6">
      <article className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-5 max-[600px]:grid-cols-[72px_minmax(0,1fr)] max-[600px]:gap-4">
        <ProductPhoto photo={item.photo} shape="tiers2" />
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-titulo-3">{item.name}</h3>
          {item.summary && <p className="text-nota text-mermelada-suave">{item.summary}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {item.price && <p className="text-cuerpo font-semibold tabular-nums">{item.price}</p>}
            <AddButton item={item} onAdd={onAdd} />
          </div>
        </div>
      </article>
    </li>
  )
}

const grid = 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-8 max-[960px]:grid-cols-1'

/** Esqueleto con la forma de la sección: la tarjeta grande y tres filas. */
function FeaturedSkeleton() {
  return (
    <div className={grid}>
      <Card large className="flex flex-col gap-4">
        <Skeleton radius="md" className="mx-auto mt-6 aspect-[360/300] w-full max-w-[420px]" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-5/6" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-16" />
          <Skeleton radius="md" className="h-11 w-44" />
        </div>
      </Card>
      <div className="flex flex-col">
        {[1, 2, 3].map((row) => (
          <div key={row} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-5 border-b border-relieve py-6 max-[600px]:grid-cols-[72px_minmax(0,1fr)]">
            <Skeleton radius="md" className="aspect-[200/150] w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton radius="md" className="h-11 w-40 self-end" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** "Pasteles de la casa" sobre `nata`: hasta cuatro, uno grande y tres en lista, como el mockup. */
export default function FeaturedSection({ section }: { section: FeaturedState }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [first, ...rest] = section.items
  return (
    <Field field="nata" labelledBy="casa-titulo" className="bg-nata">
      <div className={`${sectionColumn} py-20 max-[600px]:py-14`}>
        <div className="mb-10 flex flex-col gap-2 max-[600px]:mb-8">
          <h2 id="casa-titulo" ref={heading} tabIndex={-1} className={sectionHeading}>
            Pasteles de la casa
          </h2>
          <p className="text-cuerpo text-mermelada-suave">Combinaciones de la casa. Pídelas así o cambia lo que quieras al realizar tu pedido.</p>
        </div>
        <AddToCartNotice feedback={section.feedback} className={addNoticeSpacing} />
        <LoadingRegion loading={section.status === 'loading'} label="Cargando los pasteles de la casa…" skeleton={<FeaturedSkeleton />}>
          {section.status === 'error' ? (
            <div className="flex flex-col gap-6">
              <SectionError title="No se pudieron cargar los pasteles de la casa" onRetry={section.retry} headingRef={heading} />
              <TextLink to="/catalogo">Ver el catálogo completo</TextLink>
            </div>
          ) : section.emptyAfterError ? (
            <div className="flex flex-col gap-6">
              <EmptyAfterError text={section.emptyAfterError} />
              <TextLink to="/catalogo">Ver el catálogo completo</TextLink>
            </div>
          ) : (
            <div className={grid}>
              {first && <LargeCard item={first} onAdd={section.add} />}
              <div className="flex flex-col">
                {rest.length > 0 && (
                  <ul className="flex flex-col">
                    {rest.map((item) => (
                      <Row key={item.key} item={item} onAdd={section.add} />
                    ))}
                  </ul>
                )}
                <TextLink to="/catalogo" className="mt-5">
                  Ver el catálogo completo
                </TextLink>
              </div>
            </div>
          )}
        </LoadingRegion>
      </div>
    </Field>
  )
}
