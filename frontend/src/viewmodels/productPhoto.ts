import { photoUrl } from '../models/catalog.ts'
import type { ProductCategory } from '../models/catalog.ts'

/** Lo que una pantalla sabe de la foto de un producto, listo para `ProductPhoto`. */
export type PhotoView = {
  /** Dirección de la foto, o `null` mientras falta (PENDIENTE). */
  src: string | null
  /** Texto alternativo de la foto real: el nombre del producto como se muestra. */
  alt: string
  /** Lo que dice el hueco mientras falta: "Foto del pastel", "Foto del postre" o "Foto de la rebanada". */
  placeholder: string
}

/** El hueco de cada categoría (libro de marca, "Fotografía"). */
export const PHOTO_PLACEHOLDER: Record<ProductCategory, string> = { cake: 'Foto del pastel', dessert: 'Foto del postre' }

export function photoView(file: string | null, alt: string, placeholder: string): PhotoView {
  return { src: file ? photoUrl(file) : null, alt, placeholder }
}
