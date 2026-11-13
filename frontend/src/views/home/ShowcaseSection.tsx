import { Handbag } from '@phosphor-icons/react'
import { useRef } from 'react'
import type { RefObject } from 'react'
import AddToCartNotice from '../../components/AddToCartNotice.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing } from '../../components/focus.ts'
import LeadDays from '../../components/LeadDays.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import ProductPhoto from '../../components/ProductPhoto.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import TextLink from '../../components/TextLink.tsx'
import type { ShowcaseItemView, ShowcaseSection as ShowcaseState } from '../../viewmodels/useHome.ts'
import { addNoticeSpacing, EmptyAfterError, Field, sectionColumn, sectionHeadingOnColor, SectionError } from './sectionLayout.tsx'

const gridClass = 'grid grid-cols-4 gap-x-6 gap-y-12 pt-4 max-[960px]:grid-cols-2'

/** La repisa `betun` sobre la que se apoyan los pasteles; las de una fila se tocan y se leen como una sola. */
function Shelf() {
  return <div aria-hidden="true" className="-mx-3 h-3.5 bg-betun shadow-[0_6px_0_theme(colors.mermelada-profunda)]" />
}

function ShowcaseItem({ item, onAdd }: { item: ShowcaseItemView; onAdd: ShowcaseState['add'] }) {
  return (
    <li>
      <article className="flex h-full flex-col">
        <div className="px-2">
          <ProductPhoto photo={item.photo} shape="tiers2" />
        </div>
        <Shelf />
        <div className="mt-5 flex items-center justify-between gap-2 rounded-sm bg-betun py-3 pl-3.5 pr-3 text-mermelada max-[600px]:pl-3 max-[600px]:pr-2">
          <div className="flex min-w-0 flex-col">
            <h3 className="break-words font-display text-titulo-3 max-[600px]:hyphens-auto max-[600px]:text-cuerpo max-[600px]:font-semibold max-[600px]:leading-snug">
              {item.label}
            </h3>
            <p className="text-etiqueta tabular-nums text-mermelada-suave">{item.price}</p>
            {item.soldOut && <p className="text-etiqueta text-mermelada">Agotada por hoy</p>}
          </div>
          {!item.soldOut && (
            <button
              type="button"
              aria-label={`Agregar al pedido: ${item.label}`}
              onClick={() => onAdd(item)}
              className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md bg-mermelada text-sobre-color hover:bg-mermelada-profunda motion-safe:transition-colors motion-safe:active:translate-y-px ${focusRing}`}
            >
              <Handbag size={20} weight="regular" aria-hidden="true" />
            </button>
          )}
        </div>
      </article>
    </li>
  )
}

/** Esqueleto liso en `mermelada-suave` (sobre `mermelada` no hay brillo, D43): una fila con foto, repisa y tarjeta. */
function ShowcaseSkeleton() {
  return (
    <div className={gridClass}>
      {[1, 2, 3, 4].map((block) => (
        <div key={block} className="flex flex-col">
          <Skeleton tone="mermelada" radius="md" className="mx-2 aspect-[200/150]" />
          <Shelf />
          <Skeleton tone="mermelada" radius="sm" className="mt-5 h-[68px]" />
        </div>
      ))}
    </div>
  )
}

/** Dibujo de línea del toldo (`assets/motivos/dibujo-toldo.svg`) en `betun` al 22%, como pide el libro de marca sobre `mermelada`. */
function AwningDrawing() {
  return (
    <svg viewBox="0 0 64 64" width="112" height="112" aria-hidden="true" className="opacity-[.22]" fill="none" strokeWidth={2}>
      <g className="stroke-betun" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 12h44v4H10zM10 16v16M54 16v16M21 16v16M32 16v16M43 16v16" />
        <path d="M10 32q5.5 6 11 0t11 0 11 0 11 0" />
        <path d="M14 40v16M50 40v16M12 56h40M28 56V44h8v12" />
      </g>
    </svg>
  )
}

/** "Por hoy se vendió todo lo de la vitrina" (VitrinaAgotada.dc.html), dentro de la sección y con sus dos salidas. */
function SoldOut({ leadDays }: { leadDays: ShowcaseState['leadDays'] }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-4 pt-8 text-center">
      <AwningDrawing />
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
        <ShowcaseItem key={item.key} item={item} onAdd={section.add} />
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
