import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { ProductDetail } from '../models/catalog.ts'
import type { SceneShape } from '../three/dessertShape.ts'
import { dessertSample } from './dessertSamples.ts'
import { modelAlt } from './productPhoto.ts'
import { sampleShape } from './sampleDesign.ts'

/**
 * El modelo 3D de un producto del catálogo (D95), el mismo para su imagen fija (`/muestra/modelo/:slug`, D86) y para la ficha: un
 * postre con modelo (`dessertSamples.ts`) o el pastel de vitrina con su muestra (`sampleShape`). Funciones puras, sin React.
 */

export type ProductModel = { shape: SceneShape; error: null } | { shape: null; error: string }

/**
 * La forma del producto, o el motivo por el que no hay. Un postre no necesita las opciones de "Diseña tu pastel"; un pastel sí, y sin
 * ellas (todavía cargando, o fallaron) no hay forma.
 */
export function productModel(product: ProductDetail, options: CakeDesignOptions | null): ProductModel {
  const dessert = dessertSample(product.slug)
  if (dessert) return { shape: dessert, error: null }
  if (!options) return { shape: null, error: 'Faltan las opciones de "Diseña tu pastel".' }
  return sampleShape(product, options)
}

/**
 * El nombre accesible del modelo: como el texto alternativo de su imagen fija en el catálogo (`catalogImageView`), dice que es la
 * ilustración y no una foto: "Tres leches de durazno, ilustración del pastel".
 */
export function modelLabel(product: Pick<ProductDetail, 'name' | 'category'>): string {
  return modelAlt(product.name, product.category)
}
