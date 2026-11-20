import type { ReactNode } from 'react'
import type { ProductCardView } from '../viewmodels/productCards.ts'
import ButtonLink from './ButtonLink.tsx'
import Card from './Card.tsx'
import ProductPhoto from './ProductPhoto.tsx'

type ProductCardProps = {
  product: ProductCardView
  /**
   * `feature`: la tarjeta grande de los pasteles, con la foto que sobresale arriba (mockup del catálogo; más alta desde la
   * tanda 6). `compact`: la de los postres, más chica, con la silueta redonda.
   */
  variant?: 'feature' | 'compact'
  /** Una acción más bajo el precio (por ejemplo, "Agregar al pedido" en la vitrina); el catálogo no la lleva. */
  action?: ReactNode
}

/** Tipo, canal de venta, "En vitrina hoy" y "Rebanado hoy": datos de producto en texto pequeño, sin pastillas (libro de marca). */
function Tags({ kind, statuses }: Pick<ProductCardView, 'kind' | 'statuses'>) {
  if (!kind && statuses.length === 0) return null
  return (
    <p className="flex min-h-[26px] flex-wrap items-center gap-x-2 text-nota text-mermelada-suave">
      {kind && <span>{kind}</span>}
      {statuses.map((status) => (
        <span key={status} className="font-semibold">
          {status}
        </span>
      ))}
    </p>
  )
}

/** "Ver pastel" para el ojo; para el lector, también de cuál ("Ver pastel: Tres leches de durazno"). */
function ViewLink({ product, className }: { product: ProductCardView; className: string }) {
  return (
    <ButtonLink to={product.href} variant="secondary" aria-label={`${product.linkLabel}: ${product.name}`} className={className}>
      {product.linkLabel}
    </ButtonLink>
  )
}

/**
 * Tarjeta de un producto del catálogo: foto (o su hueco), tipo, nombre (`h3`), descripción, precios y el enlace a la
 * ficha. No sabe de la API: recibe un `ProductCardView` ya listo.
 */
export default function ProductCard({ product, variant = 'feature', action }: ProductCardProps) {
  if (variant === 'compact') {
    return (
      <Card as="article" className="tarjeta-elevable flex h-full flex-col gap-2 !p-4">
        <ProductPhoto photo={product.photo} shape="round" />
        <Tags kind={product.kind} statuses={product.statuses} />
        <h3 className="font-display text-titulo-3">{product.name}</h3>
        {product.summary && <p className="flex-1 text-nota text-mermelada-suave">{product.summary}</p>}
        {product.price && <p className="text-etiqueta tabular-nums">{product.price}</p>}
        {product.secondaryPrice && <p className="text-nota tabular-nums text-mermelada-suave">{product.secondaryPrice}</p>}
        {action}
        <ViewLink product={product} className="mt-1 w-full" />
      </Card>
    )
  }
  return (
    <Card as="article" large className={featureCard}>
      <div className={featurePhotoSlot}>
        <ProductPhoto photo={product.photo} shape="tiers3" fillBox className="w-full" />
        <div aria-hidden="true" className="mx-auto -mt-2.5 h-3.5 w-[66%] rounded-[50%] bg-mermelada/[.16] blur-[10px]" />
      </div>
      <Tags kind={product.kind} statuses={product.statuses} />
      <h3 className="font-display text-titulo-2">{product.name}</h3>
      {product.summary && <p className="flex-1 text-cuerpo text-mermelada-suave">{product.summary}</p>}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {product.price && <p className="text-etiqueta tabular-nums">{product.price}</p>}
        {product.secondaryPrice && <p className="text-nota tabular-nums text-mermelada-suave">{product.secondaryPrice}</p>}
      </div>
      {action}
      <ViewLink product={product} className="mt-1.5 w-full" />
    </Card>
  )
}

/**
 * La tarjeta grande y el lugar de su foto, que comparte la tarjeta del pastel mini del catálogo. El gesto de la marca (libro de
 * marca, "Presencia de marca"): el pastel cruza el borde de arriba de la tarjeta. La tarjeta baja 96 px dentro de su celda y el
 * lugar de la foto sube lo mismo, así lo que sobresale nunca invade la fila de arriba. La caja (360/300) mide lo mismo en todas
 * las tarjetas, hasta 320 px (288 px en móvil, para que el pastel no toque los lados): la imagen del modelo la llena con su
 * charola abajo, la foto se acomoda igual (`fillBox`) y el hueco es la silueta del mockup, así cada fila se apoya en la misma
 * línea. La sombra de contacto va debajo, al 66 % de la caja: el 70 % del pastel, que ocupa el 95 % (libro de marca).
 * `foto-sobresaliente` (D90, `index.css`): con el mouse encima, el pastel (el primer hijo) sube más que la tarjeta y su sombra
 * (el último hijo) se angosta; por eso el lugar de la foto lleva siempre esos dos hijos, en ese orden.
 */
export const featureCard = 'tarjeta-elevable mt-24 flex h-[calc(100%-6rem)] flex-col gap-2.5 !pt-0'
export const featurePhotoSlot = 'foto-sobresaliente -mt-24 mx-auto w-full max-w-[320px] max-[600px]:max-w-[288px]'

/** Cuadrícula de las tarjetas grandes: tres columnas, dos hasta 960 px y una en móvil (mockup). */
export const featureGrid = 'grid grid-cols-3 gap-x-8 gap-y-10 max-[960px]:grid-cols-2 max-[600px]:grid-cols-1'

/** Cuadrícula de las tarjetas compactas: cuatro columnas y dos hasta 960 px, también en móvil (mockup). */
export const compactGrid = 'grid grid-cols-4 gap-x-6 gap-y-12 max-[960px]:grid-cols-2 max-[600px]:gap-x-4 max-[600px]:gap-y-8'
