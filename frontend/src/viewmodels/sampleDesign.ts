import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { ProductDetail, SampleDesign, SampleDetails } from '../models/catalog.ts'
import type { CakeBoard, CakeDetails, CakeShape, CakeTopping } from '../three/cakeShape.ts'
import type { DataColor } from '../three/palette.ts'
import { prefilledDraft } from './cakeDesignPrefill.ts'
import { designPreview } from './cakeDesignPreview.ts'
import { deriveDesign, REVIEW_STEP } from './cakeDesignSteps.ts'
import { UNITS_PER_CM } from './cakeMolds.ts'
import { sizeOption } from './cakeSizes.ts'

/**
 * La forma del pastel de la imagen fija del catálogo (D86): el pastel de vitrina del producto, con su tipo, pan y relleno, más su
 * muestra del modelo (cobertura, decoración, peinado y fruta). Pasa por las mismas funciones que la vista previa de "Diseña tu
 * pastel" (`prefilledDraft`, `deriveDesign` y `designPreview` en la revisión), así la imagen es el mismo modelo que ve el cliente.
 * La fruta solo la agrega esta función: el diseñador nunca la pone. Funciones puras, sin React.
 */

/** Todos los pasos confirmados: la imagen es el pastel terminado, como en la revisión. */
const ALL_STEPS = Array.from({ length: REVIEW_STEP }, (_, i) => i + 1)

/** Sin mensaje: la imagen no lleva letras que medir. */
const NO_MESSAGE = { lines: [] }

export type SampleShape = { shape: CakeShape; error: null } | { shape: null; error: string }

const failed = (error: string): SampleShape => ({ shape: null, error })

/** La fruta de la muestra para la escena (`three/fruit.ts`); `null` sin fruta. */
export function sampleTopping(sample: Pick<SampleDesign, 'fruitLayout' | 'fruits'> & { details?: Pick<SampleDetails, 'fruitDensity'> }): CakeTopping | null {
  if (!sample.fruitLayout || sample.fruits.length === 0) return null
  const density = sample.details?.fruitDensity ?? 1
  return { kind: 'fruit', layout: sample.fruitLayout, fruits: sample.fruits, unitsPerCm: UNITS_PER_CM, ...(density !== 1 ? { density } : {}) }
}

/**
 * El borrador del pastel de vitrina con la muestra, o el motivo por el que no se puede dibujar. No inventa nada: sin muestra, sin
 * un tipo o un pan vigentes, sin el tamaño de vitrina o con una decoración que ya no está, no hay imagen.
 */
export function sampleDraft(product: ProductDetail, options: CakeDesignOptions): { draft: CakeDesignDraft; error: null } | { draft: null; error: string } {
  const sample = product.sampleDesign
  if (!sample) return { draft: null, error: 'Este pastel no tiene muestra del modelo.' }
  const prefill = prefilledDraft(product, options)
  if (!prefill.applied.includes('tipo') || !prefill.applied.includes('pan') || prefill.ignored.length > 0) {
    return { draft: null, error: 'El tipo, el pan o el relleno del pastel ya no están en "Diseña tu pastel".' }
  }
  const showcase = sizeOption(options, 'showcase')
  if (!showcase?.diameterCm) return { draft: null, error: 'Falta el molde del pastel de vitrina.' }
  if (!sample.decoration || !options.decorations.some((option) => option.slug === sample.decoration)) {
    return { draft: null, error: 'La decoración de la muestra ya no está en "Diseña tu pastel".' }
  }
  const servings = product.offerings.find((offering) => offering.presentation === 'whole')?.servings ?? showcase.servings
  return {
    error: null,
    draft: {
      ...prefill.draft,
      people: servings ?? prefill.draft.people,
      cakeSize: 'showcase',
      // El pastel de vitrina de su producto, como "Personalizar este pastel" (tanda 2): su tipo, pan y relleno no se cambian.
      source: { slug: product.slug, name: product.name, servings },
      coverageColor: sample.coverageColor,
      sideComb: sample.sideComb,
      decoration: sample.decoration,
      decorationColor: sample.decorationColor,
      confirmed: ALL_STEPS,
    },
  }
}

/**
 * La charola de cartón negro de las 8 fotos de la pastelería (tanda 4b; el usuario pidió que se quede negra). No es un color de la
 * marca ni de la comida: es el objeto de la foto, como el fondo transparente, y solo existe en las imágenes del catálogo.
 */
export const SAMPLE_BOARD: CakeBoard = { color: '#2c2c2c' }

const asColor = (hex: string) => hex as DataColor

/** Los detalles de la muestra para la escena (`three/sampleDetails.ts`); `undefined` si no lleva ninguno. */
export function sampleDetails(details: SampleDetails, coverage: string): CakeDetails | undefined {
  const result: CakeDetails = {
    ...(details.topColor || details.topGlossy ? { top: { color: asColor(details.topColor ?? coverage), glossy: details.topGlossy } } : {}),
    ...(details.ring ? { ring: { color: asColor(details.ring.color), width: details.ring.width } } : {}),
    ...(details.sideGlossy ? { sideGlossy: true } : {}),
    ...(details.sideTexture ? { sideTexture: details.sideTexture } : {}),
    ...(details.band ? { band: { color: asColor(details.band.color), height: details.band.height } } : {}),
    ...(details.drizzle ? { drizzle: { kind: details.drizzle.kind, color: asColor(details.drizzle.color) } } : {}),
    ...(details.shells
      ? { shells: { place: details.shells.place, colors: details.shells.colors.map(asColor), ...(details.edgeInset > 0 ? { inset: details.edgeInset } : {}) } }
      : {}),
    ...(details.dustingColor ? { dusting: asColor(details.dustingColor) } : {}),
    ...(details.sideBits ? { sideBits: { kind: details.sideBits.kind, color: asColor(details.sideBits.color) } } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Lo que la imagen del catálogo agrega al pastel del diseñador: la charola en lugar de la base, el tamaño de las piezas del borde,
 * la fruta y los detalles de las fotos. Devuelve otra forma; la del diseñador no cambia (sigue con su base).
 */
export function withSampleLook(shape: CakeShape, sample: SampleDesign): CakeShape {
  const { decoration } = shape
  const size = sample.details.edgeSize
  const sprinkles = sample.details.sprinkleDensity
  const inset = sample.details.edgeInset
  const sized =
    decoration && (decoration.kind === 'rosettes' || decoration.kind === 'shells') && (size !== 1 || inset > 0)
      ? { ...decoration, ...(size !== 1 ? { size } : {}), ...(decoration.kind === 'rosettes' && inset > 0 ? { inset } : {}) }
      : decoration?.kind === 'sprinkles' && sprinkles !== 1
        ? { ...decoration, density: sprinkles }
        : decoration
  const topping = sampleTopping(sample)
  const details = sampleDetails(sample.details, sample.coverageColor)
  return {
    ...shape,
    stand: false,
    fitStand: false,
    board: SAMPLE_BOARD,
    ...(sized ? { decoration: sized } : {}),
    ...(topping ? { topping } : {}),
    ...(details ? { details } : {}),
  }
}

/** La forma de la imagen fija: el pastel terminado del diseñador con lo que agrega la muestra (`withSampleLook`). */
export function sampleShape(product: ProductDetail, options: CakeDesignOptions): SampleShape {
  const { draft, error } = sampleDraft(product, options)
  if (!draft || !product.sampleDesign) return failed(error ?? 'Este pastel no tiene muestra del modelo.')
  const design = deriveDesign(draft, options, null)
  if (!design.coverage) return failed('La muestra no tiene color de cobertura.')
  const shape = designPreview({ draft, design, options, current: REVIEW_STEP, defaultBread: null, metrics: NO_MESSAGE, waferImage: null })
  return { shape: withSampleLook(shape, product.sampleDesign), error: null }
}
