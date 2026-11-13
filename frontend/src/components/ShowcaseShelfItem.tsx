import { Handbag } from '@phosphor-icons/react'
import type { ShowcaseItemView } from '../viewmodels/todayItems.ts'
import type { Addable } from '../viewmodels/useAddToCart.ts'
import { focusRing } from './focus.ts'
import ProductPhoto from './ProductPhoto.tsx'
import TextLink from './TextLink.tsx'

export type ShowcaseShelfItemProps = {
  item: ShowcaseItemView
  onAdd: (item: Addable) => void
  /**
   * El campo sobre el que va la vitrina. `mermelada` (la portada): repisa `betun` y tarjeta sin borde. `nata`
   * (`/vitrina`, libro de marca "Catálogo y vitrina"): repisa `relieve` con sombra suave y tarjeta `betun` con borde.
   */
  field: 'mermelada' | 'nata'
  /** "Quedan [n]" bajo el precio, como `Vitrina.dc.html`; la portada no lo lleva (`Main.dc.html`). */
  showRemaining?: boolean
  /** El nivel del nombre: `h3` bajo el `h2` de la sección de la portada, `h2` bajo el `h1` de `/vitrina`. */
  titleAs?: 'h2' | 'h3'
}

/** Cuatro columnas y dos hasta 960 px, también en móvil (mockups de la portada y de la vitrina). */
export const showcaseGrid = 'grid grid-cols-4 gap-x-6 gap-y-12 max-[960px]:grid-cols-2'

const shelf = {
  mermelada: 'bg-betun shadow-[0_6px_0_theme(colors.mermelada-profunda)]',
  nata: 'bg-relieve shadow-[0_4px_0_theme(colors.mermelada/12%)]',
}

const card = {
  mermelada: '',
  nata: 'border border-relieve',
}

/** La repisa sobre la que se apoyan los pasteles; las de una fila se tocan y se leen como una sola. */
export function Shelf({ field }: { field: ShowcaseShelfItemProps['field'] }) {
  return <div aria-hidden="true" className={`-mx-3 h-3.5 ${shelf[field]}`} />
}

/**
 * Una partida de la vitrina: el pastel sobre la repisa y, debajo, su tarjeta con el nombre, el precio y "Agregar al
 * pedido". Las tarjetas de una fila miden lo mismo (la del rebanado, con sus dos enlaces, es la más alta). El rebanado (D60) dice "Rebanado" y, en lugar del botón, lleva a sus rebanadas y a la ficha para
 * encargarlo completo. Lo agotado dice "Agotada por hoy" y no se agrega.
 */
export default function ShowcaseShelfItem({ item, onAdd, field, showRemaining = false, titleAs: Title = 'h3' }: ShowcaseShelfItemProps) {
  const sliced = item.kind === 'sliced' && !item.soldOut
  return (
    <li>
      <article className="flex h-full flex-col">
        <div className="px-2">
          <ProductPhoto photo={item.photo} shape="tiers2" />
        </div>
        <Shelf field={field} />
        <div
          className={`mt-5 flex flex-1 items-center justify-between gap-2 rounded-sm bg-betun py-3 pl-3.5 pr-3 text-mermelada max-[600px]:pl-3 max-[600px]:pr-2 ${card[field]}`}
        >
          <div className="flex min-w-0 flex-col">
            <Title className="break-words font-display text-titulo-3 max-[600px]:hyphens-auto max-[600px]:text-cuerpo max-[600px]:font-semibold max-[600px]:leading-snug">
              {item.label}
            </Title>
            {sliced && <p className="text-nota font-semibold text-mermelada-suave">Rebanado</p>}
            <p className="text-etiqueta tabular-nums text-mermelada-suave">{item.price}</p>
            {item.soldOut ? (
              <p className="text-etiqueta text-mermelada">Agotada por hoy</p>
            ) : (
              showRemaining && item.remaining && <p className="text-nota text-mermelada-suave">{item.remaining}</p>
            )}
            {item.kind === 'sliced' && !item.soldOut && (
              <div className="mt-1 flex flex-wrap gap-x-4">
                <TextLink to={item.slicesHref} aria-label={`Ver las rebanadas: ${item.label}`}>
                  Ver las rebanadas
                </TextLink>
                <TextLink to={item.orderHref} aria-label={`Encargarlo completo: ${item.label}`}>
                  Encargarlo completo
                </TextLink>
              </div>
            )}
          </div>
          {item.kind === 'stock' && !item.soldOut && (
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
