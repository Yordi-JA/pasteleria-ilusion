import { useRef } from 'react'
import type { RefObject } from 'react'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import LeadDays from '../../components/LeadDays.tsx'
import LineDrawing from '../../components/LineDrawing.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import ShowcaseShelfItem, { Shelf, showcaseGrid } from '../../components/ShowcaseShelfItem.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import type { ShowcaseSection as ShowcaseState } from '../../viewmodels/useHome.ts'
import { addNoticeSpacing, EmptyAfterError, Field, sectionColumn, sectionHeadingOnColor, SectionError } from './sectionLayout.tsx'

const gridClass = `${showcaseGrid} pt-4`

/** Esqueleto liso en `mermelada-suave` (sobre `mermelada` no hay brillo, D43): una fila con foto, repisa y tarjeta. */
function ShowcaseSkeleton() {
  return (
    <div className={gridClass}>
      {[1, 2, 3, 4].map((block) => (
        <div key={block} className="flex flex-col">
          <Skeleton tone="mermelada" radius="md" className="mx-2 aspect-[200/150]" />
          <Shelf field="mermelada" />
          <Skeleton tone="mermelada" radius="sm" className="mt-5 h-[68px]" />
        </div>
      ))}
    </div>
  )
}

/** "Por hoy se vendió todo lo de la vitrina" (VitrinaAgotada.dc.html), dentro de la sección y con sus dos salidas. */
function SoldOut({ leadDays }: { leadDays: ShowcaseState['leadDays'] }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-4 pt-8 text-center">
      {/* Dibujo del toldo en `betun` al 22%, como pide el libro de marca sobre `mermelada`. */}
      <LineDrawing drawing="toldo" className="text-betun opacity-[.22]" />
      <h3 className="font-display text-titulo-2">Por hoy se vendió todo lo de la vitrina</h3>
      <p className="max-w-[480px] text-cuerpo text-sobre-color-suave">
        Puedes hacer un pedido con <LeadDays days={leadDays} tone="mermelada" /> de anticipación, o ver si quedan rebanadas de hoy.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <ButtonLink to={ORDER_LINK.to} variant="onColor">
          {ORDER_LINK.label}
        </ButtonLink>
        <TextLink to="/rebanadas" onColor className="self-center">
          Ver rebanadas de hoy
        </TextLink>
      </div>
    </div>
  )
}

function ShowcaseContent({ section, heading }: { section: ShowcaseState; heading: RefObject<HTMLHeadingElement | null> }) {
  if (section.status === 'error') return <SectionError title="No se pudo cargar la vitrina" onRetry={section.retry} headingRef={heading} />
  if (section.emptyAfterError) return <EmptyAfterError text={section.emptyAfterError} onColor />
  if (section.allSoldOut) return <SoldOut leadDays={section.leadDays} />
  if (section.emptyFilter) return <p className="pt-4 text-cuerpo text-sobre-color-suave">{section.emptyFilter}</p>
  return (
    <ul className={gridClass}>
      {section.items.map((item) => (
        <ShowcaseShelfItem key={item.key} item={item} onAdd={section.add} field="mermelada" />
      ))}
    </ul>
  )
}

/** La vitrina de la portada: la sección destacada en `mermelada` a media página, con los filtros Todo, Pasteles y Postres. */
export default function ShowcaseSection({ section }: { section: ShowcaseState }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Field field="mermelada" labelledBy="vitrina-titulo" className="bg-mermelada text-sobre-color">
      <div className={`${sectionColumn} pb-[88px] pt-20 max-[600px]:pb-14 max-[600px]:pt-14`}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="vitrina-titulo" ref={heading} tabIndex={-1} className={sectionHeadingOnColor}>
              Vitrina
            </h2>
            <p className="text-cuerpo text-sobre-color-suave">Pasteles y postres listos para llevar.</p>
          </div>
          {section.filters.length > 0 && (
            <fieldset>
              <legend className="sr-only">Filtrar la vitrina</legend>
              <div className="flex flex-wrap gap-2">
                {section.filters.map((option) => (
                  <ChoiceOption
                    key={option.value}
                    variant="chip"
                    onColor
                    name="filtro-vitrina"
                    value={option.value}
                    label={option.label}
                    checked={option.checked}
                    onChange={() => section.setFilter(option.value)}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </div>
        <AddToCartNotice feedback={section.feedback} className={addNoticeSpacing} />
        <LoadingRegion loading={section.status === 'loading'} label="Cargando la vitrina…" skeleton={<ShowcaseSkeleton />}>
          <ShowcaseContent section={section} heading={heading} />
        </LoadingRegion>
        <TextLink to="/vitrina" onColor className="mt-8">
          Ver toda la vitrina
        </TextLink>
      </div>
    </Field>
  )
}
