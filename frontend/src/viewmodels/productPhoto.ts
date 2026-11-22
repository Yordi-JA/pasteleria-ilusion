import type { CartOffering } from '../models/cart.ts'
import { photoUrl } from '../models/catalog.ts'
import type { ProductCategory } from '../models/catalog.ts'
import { dessertModelImage } from './dessertSamples.ts'

/** Lo que una pantalla sabe de la foto de un producto, listo para `ProductPhoto`. */
export type PhotoView = {
  /** Dirección de la foto, o `null` mientras falta (PENDIENTE). */
  src: string | null
  /** Texto alternativo de la foto real: el nombre del producto como se muestra. */
  alt: string
  /** Lo que dice el hueco mientras falta: "Foto del pastel", "Foto del postre" o "Foto de la rebanada". */
  placeholder: string
  /** La imagen fija del modelo (D86), recortada al pastel (`MODEL_FRAME`); las fotos no lo llevan. */
  model?: boolean
}

/** El hueco de cada categoría (libro de marca, "Fotografía"). */
export const PHOTO_PLACEHOLDER: Record<ProductCategory, string> = { cake: 'Foto del pastel', dessert: 'Foto del postre' }

export function photoView(file: string | null, alt: string, placeholder: string): PhotoView {
  return { src: file ? photoUrl(file) : null, alt, placeholder }
}

/**
 * El nombre de la imagen o de la escena del modelo: no es una foto, así que dice que es la ilustración ("Tres leches de durazno,
 * ilustración del pastel"; "Flan napolitano, ilustración del postre"). Lo comparten la tarjeta y la ficha (`modelLabel`).
 */
export function modelAlt(name: string, category: ProductCategory): string {
  return `${name}, ilustración del ${category === 'cake' ? 'pastel' : 'postre'}`
}

/** Lo que una tarjeta sabe de la imagen de su producto. */
export type CatalogImageSource = {
  slug: string
  /** El nombre como se muestra en la tarjeta (en la vitrina, con su presentación). */
  name: string
  category: ProductCategory
  photo: string | null
  /** La imagen del modelo que da la API (solo los pasteles con muestra, D86). */
  modelImage: string | null
}

/**
 * La imagen de una tarjeta del catálogo y de la portada (D86): la imagen fija del modelo si la hay; si no, la foto; sin ninguna, el
 * hueco. La de un pastel la da la API (`model_image`, si la pastelería la muestra); la de un postre con modelo (D95) es la que guarda
 * `npm run render:modelos`, por su `slug` (`dessertModelImage`), porque el backend solo guarda muestras de pasteles.
 */
export function catalogImageView({ slug, name, category, photo, modelImage }: CatalogImageSource): PhotoView {
  const placeholder = PHOTO_PLACEHOLDER[category]
  const model = modelImage ?? dessertModelImage(slug)
  if (model) return { ...photoView(model, modelAlt(name, category), placeholder), model: true }
  return photoView(photo, name, placeholder)
}

/**
 * El archivo de la imagen que el carrito guarda con una línea del catálogo, el mismo orden que `catalogImageView`: la imagen del
 * modelo (la de la API o la de un postre con modelo) y, sin ella, la foto; `null` sin ninguna (se ve el hueco).
 */
export function cartImageFile({ slug, photo, modelImage }: Pick<CatalogImageSource, 'slug' | 'photo' | 'modelImage'>): string | null {
  return modelImage ?? dessertModelImage(slug) ?? photo
}

/** La presentación para el carrito con su imagen (`cartImageFile`), si la tiene. */
export function withCartImage(offering: CartOffering, source: Pick<CatalogImageSource, 'slug' | 'photo' | 'modelImage'>): CartOffering {
  const image = cartImageFile(source)
  return image ? { ...offering, image } : offering
}

/**
 * Los dos encuadres, en px. Las fotos de `public/fotos/` (D86, medidas en las 8): un cuadrado de 1200 px con el pastel de 958 px
 * de ancho, centrado, y su base en y = 1101. Las imágenes del modelo (tanda 6): 1200 × 1000, la proporción de la caja de la
 * tarjeta grande (360/300), con el pastel de 1140 px de ancho, centrado, y su base en el borde de abajo. `three/stillFraming.ts`
 * dibuja con estas mismas medidas; `cake-render.spec.ts` revisa que coincidan.
 */
export const PHOTO_FRAME = { width: 1200, height: 1200, cakeWidth: 958, bottom: 1101 } as const
export const MODEL_FRAME = { width: 1200, height: 1000, cakeWidth: 1140, bottom: 1000 } as const

/**
 * Cómo se agranda una foto en la caja de la tarjeta grande para que su pastel mida y se apoye como el de la imagen del modelo, y
 * la fila se lea pareja (tanda 6). La caja tiene la proporción de `MODEL_FRAME`; la foto, cuadrada, se agranda hasta que su
 * pastel ocupe el mismo ancho y se sube hasta que su base quede en la del modelo. Lo transparente de arriba y de abajo sale de la
 * caja sin taparle nada a nadie. `width` es en % del ancho de la caja y `top`, en % de su alto.
 */
export const PHOTO_FILL = (() => {
  const scale = (MODEL_FRAME.cakeWidth / MODEL_FRAME.width) * (PHOTO_FRAME.width / PHOTO_FRAME.cakeWidth)
  // La base de la foto agrandada, medida desde su borde de arriba, en altos de la caja.
  const base = (PHOTO_FRAME.bottom / PHOTO_FRAME.width) * scale * (MODEL_FRAME.width / MODEL_FRAME.height)
  const percent = (value: number) => `${(value * 100).toFixed(3)}%`
  return { width: percent(scale), top: percent(MODEL_FRAME.bottom / MODEL_FRAME.height - base) }
})()
