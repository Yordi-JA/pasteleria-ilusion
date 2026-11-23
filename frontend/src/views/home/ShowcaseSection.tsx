import { useRef } from 'react'
import type { RefObject } from 'react'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import FilterChips from '../../components/FilterChips.tsx'
import LeadDays from '../../components/LeadDays.tsx'
import LineDrawing from '../../components/LineDrawing.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import Reveal from '../../components/Reveal.tsx'
import ShowcaseShelfItem, { Shelf, showcaseGrid } from '../../components/ShowcaseShelfItem.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import type { ShowcaseSection as ShowcaseState } from '../../viewmodels/useHome.ts'
import { addNoticeSpacing, EmptyAfterError, Field, sectionColumn, sectionHeading, SectionError } from './sectionLayout.tsx'

const gridClass = `${showcaseGrid} pt-4`

/** Esqueleto de `fresa-claro` con brillo, sobre `fresa`: una fila con foto, repisa y tarjeta. */
function ShowcaseSkeleton() {
  return (
    <div className={gridClass}>
      {[1, 2, 3, 4].map((block) => (
        <div key={block} className="flex flex-col">
          <Skeleton tone="fresa" radius="md" className="mx-2 aspect-[200/150]" />
          <Shelf field="nata" />
          <Skeleton tone="fresa" radius="sm" className="mt-5 h-[68px]" />
        </div>
      ))}
    </div>
  )
}

/** "Por hoy se vendió todo lo de la vitrina" (VitrinaAgotada.dc.html), dentro de la sección y con sus dos salidas. */
function SoldOut({ leadDays }: { leadDays: ShowcaseState['leadDays'] }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-4 pt-8 text-center">
      {/* Dibujo del toldo en `mermelada` al 30%, como en `/vitrina`. */}
      <LineDrawing drawing="toldo" className="text-mermelada opacity-30" />
      <h3 className="font-display text-titulo-2">Por hoy se vendió todo lo de la vitrina</h3>
      <p className="max-w-[480px] text-cuerpo text-mermelada-suave">
        Puedes hacer un pedido con <LeadDays days={leadDays} tone="fresa" /> de anticipación, o ver si quedan rebanadas de hoy.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <ButtonLink to={ORDER_LINK.to} variant="secondary">
          {ORDER_LINK.label}
        </ButtonLink>
        <TextLink to="/rebanadas" className="self-center">
          Ver rebanadas de hoy
        </TextLink>
      </div>
    </div>
  )
}

function ShowcaseContent({ section, heading }: { section: ShowcaseState; heading: RefObject<HTMLHeadingElement | null> }) {
  if (section.status === 'error') return <SectionError title="No se pudo cargar la vitrina" onRetry={section.retry} headingRef={heading} />
  if (section.emptyAfterError) return <EmptyAfterError text={section.emptyAfterError} />
  if (section.allSoldOut) return <SoldOut leadDays={section.leadDays} />
  if (section.emptyFilter) return <p className="pt-4 text-cuerpo text-mermelada-suave">{section.emptyFilter}</p>
  return (
    // En cascada por partidas (D90): la repisa se queda y solo se mueven el pastel y su etiqueta, así las repisas de una fila
    // siguen leyéndose como una sola.
    <Reveal as="ul" stagger className={gridClass}>
      {section.items.map((item) => (
        <ShowcaseShelfItem key={item.key} item={item} onAdd={section.add} field="nata" />
      ))}
    </Reveal>
  )
}

/** La vitrina de la portada: la sección destacada en `fresa` a media página, con los filtros Todo, Pasteles y Postres. */
export default function ShowcaseSection({ section }: { section: ShowcaseState }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Field field="fresa" labelledBy="vitrina-titulo" className="bg-fresa">
      <div className={`${sectionColumn} pb-[88px] pt-20 max-[600px]:pb-14 max-[600px]:pt-14`}>
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="vitrina-titulo" ref={heading} tabIndex={-1} className={sectionHeading}>
              Vitrina
            </h2>
            <p className="text-cuerpo text-mermelada-suave">Pasteles y postres listos para llevar.</p>
          </div>
          {section.filters.length > 0 && (
            <FilterChips
              legend="Filtrar la vitrina"
              name="filtro-vitrina"
              options={section.filters}
              onChange={section.setFilter}
              segmented
              className="w-full max-w-[360px]"
            />
          )}
        </Reveal>
        <AddToCartNotice feedback={section.feedback} className={addNoticeSpacing} />
        <LoadingRegion loading={section.status === 'loading'} label="Cargando la vitrina…" skeleton={<ShowcaseSkeleton />}>
          <ShowcaseContent section={section} heading={heading} />
        </LoadingRegion>
        <TextLink to="/vitrina" className="mt-8">
          Ver toda la vitrina
        </TextLink>
      </div>
    </Field>
  )
}
