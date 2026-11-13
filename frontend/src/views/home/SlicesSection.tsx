import { useRef } from 'react'
import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import Button from '../../components/Button.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import Card from '../../components/Card.tsx'
import { focusRing } from '../../components/focus.ts'
import ProductPhoto from '../../components/ProductPhoto.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import type { SliceItemView } from '../../viewmodels/todayItems.ts'
import type { SlicesSection as SlicesState } from '../../viewmodels/useHome.ts'
import { addNoticeSpacing, EmptyAfterError, Field, sectionColumn, sectionHeading, SectionError } from './sectionLayout.tsx'

// Cuatro columnas en escritorio; hasta 960 px, una fila que se desliza de lado con tarjetas de 240 px (mockup).
const rowClass = 'grid grid-cols-4 gap-6 max-[960px]:flex max-[960px]:[&>*]:flex-[0_0_240px]'
// El contenedor que se desliza: enfocable para moverlo con las flechas del teclado, con su nombre y el anillo de foco.
const scrollerClass = `rounded-md max-[960px]:overflow-x-auto max-[960px]:pb-2 ${focusRing}`

function SliceCard({ item, onAdd }: { item: SliceItemView; onAdd: SlicesState['add'] }) {
  return (
    <li>
      <Card as="article" className="flex h-full flex-col gap-2.5">
        <ProductPhoto photo={item.photo} shape="slice" />
        <h3 className="font-display text-titulo-3">{item.name}</h3>
        <p className="text-etiqueta tabular-nums">{item.price}</p>
        {item.soldOut ? (
          <p className="text-etiqueta text-mermelada">Agotada por hoy</p>
        ) : (
          <p className="text-nota font-semibold text-mermelada-suave">{item.remaining}</p>
        )}
        <div className="mt-auto pt-1">
          {item.soldOut ? (
            <Button variant="secondary" disabled className="w-full">
              Agotada
            </Button>
          ) : (
            <Button
              variant="secondary"
              aria-label={`Agregar al pedido: ${item.offering.name}`}
              onClick={() => onAdd(item)}
              className="w-full"
            >
              Agregar al pedido
            </Button>
          )}
        </div>
      </Card>
    </li>
  )
}

/**
 * Una sola rebanada, lo de casi todos los días (regla 2, D60): una tarjeta ancha y a su lado "¿Lo quieres completo?",
 * como en `/rebanadas`, en lugar de una tarjeta y tres columnas vacías.
 */
function SingleSlice({ item, onAdd }: { item: SliceItemView; onAdd: SlicesState['add'] }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6 max-[960px]:grid-cols-1">
      <Card as="article" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-6 max-[600px]:grid-cols-1 max-[600px]:gap-3">
        <ProductPhoto photo={item.photo} shape="slice" />
        <div className="flex flex-col gap-2.5">
          <h3 className="font-display text-titulo-3">{item.name}</h3>
          <p className="text-etiqueta tabular-nums">{item.price}</p>
          {item.soldOut ? (
            <p className="text-etiqueta text-mermelada">Agotada por hoy</p>
          ) : (
            <p className="text-nota font-semibold text-mermelada-suave">{item.remaining}</p>
          )}
          <div className="pt-1">
            {item.soldOut ? (
              <Button variant="secondary" disabled className="w-full">
                Agotada
              </Button>
            ) : (
              <Button variant="secondary" aria-label={`Agregar al pedido: ${item.offering.name}`} onClick={() => onAdd(item)} className="w-full">
                Agregar al pedido
              </Button>
            )}
          </div>
        </div>
      </Card>
      <aside aria-labelledby="portada-rebanada-completo" className="flex flex-col gap-2.5 rounded-lg border border-relieve bg-betun p-6 max-[600px]:p-4">
        <h3 id="portada-rebanada-completo" className="font-display text-titulo-3">
          ¿Lo quieres completo?
        </h3>
        <p className="text-cuerpo text-mermelada-suave">Encarga {item.name} completo y elige la fecha al terminar tu pedido.</p>
        <ButtonLink to={item.productHref} variant="secondary" aria-label={`Encargarlo completo: ${item.name}`} className="self-start">
          Encargarlo completo
        </ButtonLink>
      </aside>
    </div>
  )
}

function SlicesSkeleton() {
  // En móvil la fila es más ancha que la pantalla: el esqueleto se recorta en lugar de desbordar la página.
  return (
    <div className={`${rowClass} max-[960px]:overflow-hidden`}>
      {[1, 2, 3, 4].map((block) => (
        <Card key={block} className="flex flex-col gap-2.5">
          <Skeleton radius="md" className="aspect-[200/120] w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton radius="md" className="h-11 w-full" />
        </Card>
      ))}
    </div>
  )
}

/** "[Fecha de hoy], hasta agotar existencias." La fecha es un dato: mientras carga va en esqueleto. */
function DateLine({ section }: { section: SlicesState }) {
  if (section.date) return <>{section.date}, hasta agotar existencias.</>
  if (section.status === 'loading') {
    return (
      <>
        <Skeleton inline className="h-[1em] w-44 align-[-0.15em]" />, hasta agotar existencias.
      </>
    )
  }
  return <>Hasta agotar existencias.</>
}

/** "Rebanadas de hoy" sobre `nata`, con el símbolo como estampa junto al título (Main.dc.html). */
export default function SlicesSection({ section }: { section: SlicesState }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Field field="nata" labelledBy="rebanadas-titulo" className="bg-nata">
      <div className={`${sectionColumn} py-20 max-[600px]:py-14`}>
        <div className="mb-8 flex items-center gap-5">
          <img src={symbol} alt="" width={88} height={88} className="h-[88px] w-[88px] shrink-0 -rotate-[8deg]" />
          <div className="flex flex-col gap-1.5">
            <h2 id="rebanadas-titulo" ref={heading} tabIndex={-1} className={sectionHeading}>
              Rebanadas de hoy
            </h2>
            <p className="text-cuerpo text-mermelada-suave">
              <DateLine section={section} />
            </p>
          </div>
        </div>
        <AddToCartNotice feedback={section.feedback} className={addNoticeSpacing} />
        <LoadingRegion loading={section.status === 'loading'} label="Cargando las rebanadas de hoy…" skeleton={<SlicesSkeleton />}>
          {section.status === 'error' ? (
            <SectionError title="No se pudieron cargar las rebanadas de hoy" onRetry={section.retry} headingRef={heading} />
          ) : section.emptyAfterError ? (
            <EmptyAfterError text={section.emptyAfterError} />
          ) : section.items.length === 1 ? (
            <SingleSlice item={section.items[0]} onAdd={section.add} />
          ) : (
            <div role="region" aria-label="Tarjetas de las rebanadas de hoy" tabIndex={0} className={scrollerClass}>
              <ul className={rowClass}>
                {section.items.map((item) => (
                  <SliceCard key={item.key} item={item} onAdd={section.add} />
                ))}
              </ul>
            </div>
          )}
        </LoadingRegion>
        <TextLink to="/rebanadas" className="mt-8">
          Ver todas las rebanadas
        </TextLink>
      </div>
    </Field>
  )
}
