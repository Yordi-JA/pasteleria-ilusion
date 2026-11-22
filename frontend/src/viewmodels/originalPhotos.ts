import { photoUrl } from '../models/catalog.ts'
import type { ProductDetail } from '../models/catalog.ts'

/**
 * La foto original de un producto, la que tomó la pastelería con su fondo (`assets/SABORES/`), para la tarjeta "Pastel" de la
 * ficha. No es la foto recortada de `public/fotos/<slug>.webp` (sin fondo, la que usan la vitrina y las rebanadas) ni la imagen del
 * modelo. Como `dessertSamples.ts`, va por el `slug` del producto y sin petición a la API: la pastelería todavía no tiene dónde
 * subirla en el admin. Un producto que no está en la lista no tiene foto original y su ficha no muestra la tarjeta.
 *
 * Todas van encuadradas igual (22 de noviembre): un cuadrado de 900 px con el pastel y su charola a todo lo ancho, centrado, con
 * poco fondo. El archivo es `public/fotos/<slug>-original.webp`.
 */
const ORIGINAL_PHOTOS: ReadonlySet<string> = new Set([
  'choco-pinguino',
  'tres-leches-con-flan-y-cajeta',
  'tres-leches-con-flan-y-zarzamora',
  'tres-leches-con-queso-y-chocolate',
  'tres-leches-con-queso-y-zarzamora',
  'tres-leches-de-blueberry',
  'tres-leches-de-cajeta',
  'tres-leches-de-capuchino',
  'tres-leches-de-choco-vainilla',
  'tres-leches-de-chocolate',
  'tres-leches-de-durazno',
  'tres-leches-de-fresa',
  'tres-leches-de-galleta',
  'tres-leches-de-zarzamora',
])

/** El lado del cuadrado de cada foto original, en px: con él la imagen guarda su lugar antes de llegar. */
export const ORIGINAL_PHOTO_SIDE = 900

export type OriginalPhotoView = {
  /** El título de la tarjeta: "Pastel" o "Postre". */
  heading: string
  src: string
  /** "Foto del Tres leches de fresa". */
  alt: string
  width: number
  height: number
}

/** Si ese producto tiene foto original: el esqueleto de la ficha lo sabe por el `slug`, antes de que llegue el producto. */
export function hasOriginalPhoto(slug: string): boolean {
  return ORIGINAL_PHOTOS.has(slug)
}

/** La foto original de ese producto lista para la tarjeta, o `null` si no tiene. */
export function originalPhoto(product: Pick<ProductDetail, 'slug' | 'name' | 'category'>): OriginalPhotoView | null {
  if (!hasOriginalPhoto(product.slug)) return null
  const src = photoUrl(`${product.slug}-original.webp`)
  if (!src) return null
  const cake = product.category === 'cake'
  return {
    heading: cake ? 'Pastel' : 'Postre',
    src,
    alt: cake ? `Foto del ${product.name}` : `Foto del postre ${product.name}`,
    width: ORIGINAL_PHOTO_SIDE,
    height: ORIGINAL_PHOTO_SIDE,
  }
}
