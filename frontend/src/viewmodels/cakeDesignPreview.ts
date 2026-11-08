import type { BreadOption, CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { CakeLayer, CakeShape, CakeTier, ShapeColor } from '../three/cakeShape.ts'
import type { DataColor, SceneColor } from '../three/palette.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La vista previa de "Diseña tu pastel" por etapas, como `design/referencia/pastel-css3d.js` y el libro de marca
 * ("Cotizador 3D"): el pan con su forma y sus pisos; el matiz del tipo (tres leches más claro, envinado hacia el
 * vino); el color del pan; el relleno como franja al centro del costado (mitad y mitad con dos sabores, entre capas de
 * crema con queso o flan); y, desde el paso 5, la cobertura en su color con la fila de perlas de abajo.
 *
 * Los colores de la comida son los `preview_color` de la API, que la pastelería edita; los matices y la corteza se
 * mezclan con tokens de la marca. Sin React ni three.
 */

/** Radio y alto de cada piso, de abajo hacia arriba, en unidades de escena (100 px del prototipo). */
const TIER_SIZES = [
  { radius: 1.5, height: 1.04 },
  { radius: 1.18, height: 0.9 },
  { radius: 0.9, height: 0.8 },
  { radius: 0.66, height: 0.7 },
  { radius: 0.46, height: 0.62 },
] as const
/** Alto que cabe sin achicar el pastel: los pisos de más se escalan para caber, como el prototipo (300 px). */
const FIT_HEIGHT = 3
/** Con pocos kilos el pastel se ve un poco más chico; con el máximo en línea, completo. */
const SMALLEST_SCALE = 0.85
/** Matiz del pan por tipo de pastel: hacia `betun` (tres leches) o hacia `mermelada`, el vino (envinado). */
const TYPE_TINT: Record<string, { toward: SceneColor; amount: number }> = {
  tres_leches: { toward: 'betun', amount: 0.12 },
  envinado: { toward: 'mermelada', amount: 0.2 },
}
const CRUST = { toward: 'mermelada' as const, amount: 0.18 }
/** Respaldo del pan si ninguna opción trae color: un token, nunca un color inventado. */
const FALLBACK_BREAD: SceneColor = 'harina'

/** Los colores de la API ya llegan validados como `#rrggbb` (`models/cakeDesign.ts`). */
function dataColor(value: string | null | undefined): DataColor | null {
  return value ? (value as DataColor) : null
}

const mixColors = (from: ShapeColor, toward: SceneColor, amount: number): ShapeColor => ({ mix: [from, toward], amount })

function tierSize(index: number) {
  const last = TIER_SIZES[TIER_SIZES.length - 1]
  return TIER_SIZES[index] ?? { radius: last.radius * 0.8 ** (index - TIER_SIZES.length + 1), height: last.height }
}

function layers(bread: ShapeColor, filling: ShapeColor[], cream: ShapeColor | null): CakeLayer[] {
  const crust = mixColors(bread, CRUST.toward, CRUST.amount)
  const top: CakeLayer = { height: 0.05, colors: [crust] }
  const bottom: CakeLayer = { height: 0.04, colors: [crust] }
  if (filling.length === 0) {
    return [bottom, { height: 0.46, colors: [bread] }, { height: 0.45, colors: [bread] }, top]
  }
  const flavors: CakeLayer['colors'] = filling.length === 2 ? [filling[0], filling[1]] : [filling[0]]
  if (cream) {
    return [
      bottom,
      { height: 0.32, colors: [bread] },
      { height: 0.07, colors: [cream] },
      { height: 0.14, colors: flavors },
      { height: 0.07, colors: [cream] },
      { height: 0.31, colors: [bread] },
      top,
    ]
  }
  return [bottom, { height: 0.38, colors: [bread] }, { height: 0.16, colors: flavors }, { height: 0.37, colors: [bread] }, top]
}

type PreviewInput = {
  draft: CakeDesignDraft
  design: DesignDerived
  options: CakeDesignOptions
  current: number
  /** El pan que se muestra mientras no se elige uno (el del estimado): "Paso 1: solo el pan de vainilla". */
  defaultBread: BreadOption | null
}

export function designPreview({ draft, design, options, current, defaultBread }: PreviewInput): CakeShape {
  const bread = design.bread ?? defaultBread
  const plain = dataColor(bread?.previewColor) ?? dataColor(defaultBread?.previewColor) ?? FALLBACK_BREAD
  const tint = design.cakeType ? TYPE_TINT[design.cakeType.value] : undefined
  const breadColor = tint ? mixColors(plain, tint.toward, tint.amount) : plain

  const showFilling = !design.fillingIncluded && design.base !== null && design.flavors.length > 0
  const filling = showFilling ? design.flavors.map((flavor) => dataColor(flavor.previewColor)).filter((c): c is DataColor => c !== null) : []
  const cream = showFilling ? dataColor(design.base?.previewColor) : null
  const frosting = current >= 5 && design.coverage ? (dataColor(design.coverage.previewColor) ?? undefined) : undefined

  const count = Math.min(Math.max(draft.tiers, 1), Math.max(design.maxTiers, 1))
  const sides = layers(breadColor, filling, cream)
  const tiers: CakeTier[] = Array.from({ length: count }, (_, index) => ({
    ...tierSize(index),
    ...(frosting ? { frosting } : { layers: sides }),
  }))
  const height = tiers.reduce((sum, tier) => sum + tier.height, 0)
  // Sin kilos de la API todavía, el pastel se ve como el más chico.
  const kg = design.kg ?? options.limits.minCustomKg
  const byKg = SMALLEST_SCALE + (1 - SMALLEST_SCALE) * Math.min(1, kg / Math.max(options.limits.maxOnlineKg, 1))
  return {
    tiers,
    festoons: frosting ? 'bottom' : false,
    stand: true,
    candle: false,
    form: draft.form,
    scale: Math.min(1, FIT_HEIGHT / height) * byKg,
  }
}
