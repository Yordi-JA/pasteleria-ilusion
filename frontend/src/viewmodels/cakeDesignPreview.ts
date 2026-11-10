import type { BreadOption, CakeDesignOptions, FillingFlavorOption } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { CakeLayer, CakePieces, CakeShape, CakeTier, ShapeColor } from '../three/cakeShape.ts'
import type { DataColor, SceneColor } from '../three/palette.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La vista previa de "Diseña tu pastel" por etapas, como `design/referencia/pastel-css3d.js` y el libro de marca
 * ("Cotizador 3D"), con lo que pidió la dueña (D50 y D51): el pan con miga, en dos colores si el pan los tiene
 * (choco-vainilla: en cada piso, todo el pan que va debajo del relleno es de vainilla y todo el que va encima, de
 * chocolate); el matiz del tipo (tres leches más claro, envinado hacia el vino); el relleno al centro del costado con
 * su estilo (liso, rebanadas o trozos de fruta, trozos de galleta o granillo; mitad y mitad con dos sabores); con
 * queso o con flan, la crema abajo y el sabor arriba; y, desde el paso 5, la cobertura de crema pastelera en su
 * color, sin perlas (la duya es de la decoración, paso 6).
 *
 * Los colores de la comida son los `preview_color` de la API, que la pastelería edita; los matices, la corteza y el
 * fondo cremoso de algunos rellenos se describen como mezclas con tokens y los resuelve la escena. Sin React ni three.
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
/** Fondo de crema de los rellenos con trozos de galleta o granillo: `betun` con un poco del color del sabor. */
const CREAMY_BODY = 0.35
/** Respaldo del pan si ninguna opción trae color: un token, nunca un color inventado. */
const FALLBACK_BREAD: SceneColor = 'harina'

const mix = (from: ShapeColor, toward: ShapeColor, amount: number): ShapeColor => ({ mix: [from, toward], amount })

/** Los colores de la API ya llegan validados como `#rrggbb` (`models/cakeDesign.ts`). */
function dataColor(value: string | null | undefined): DataColor | null {
  return value ? (value as DataColor) : null
}

function tierSize(index: number) {
  const last = TIER_SIZES[TIER_SIZES.length - 1]
  return TIER_SIZES[index] ?? { radius: last.radius * 0.8 ** (index - TIER_SIZES.length + 1), height: last.height }
}

/** Cómo se ve un sabor: el color de la franja y, si los lleva, sus trozos (estilo que elige la pastelería). */
function flavorLook(flavor: FillingFlavorOption): { body: ShapeColor; pieces: CakePieces | null } | null {
  const color = dataColor(flavor.previewColor)
  if (!color) return null
  const accent = dataColor(flavor.previewColorSecondary)
  if (!accent || flavor.previewStyle === 'smooth') return { body: color, pieces: null }
  switch (flavor.previewStyle) {
    case 'fruit_slices':
      return { body: color, pieces: { style: 'fruit_slices', colors: [accent] } }
    case 'fruit_chunks':
      return { body: color, pieces: { style: 'fruit_chunks', colors: [accent] } }
    case 'cookie_chunks':
      return { body: mix('betun', color, CREAMY_BODY), pieces: { style: 'cookie_chunks', colors: [accent] } }
    case 'sprinkles':
      return { body: mix('betun', color, CREAMY_BODY), pieces: { style: 'sprinkles', colors: [accent, color] } }
  }
}

type Bread = { top: ShapeColor; bottom: ShapeColor }

/** Una capa de pan de un solo color, con miga. */
const breadLayer = (height: number, color: ShapeColor): CakeLayer => ({ height, colors: [color], crumb: true })

type FillingLook = { flavors: { body: ShapeColor; pieces: CakePieces | null }[]; cream: ShapeColor | null }

/**
 * Las capas del costado de abajo hacia arriba: corteza, pan, relleno (si hay), pan y corteza. En un pan de dos
 * colores, el pan de abajo (y su corteza) es todo del color de abajo y el de arriba, todo del de arriba (D51).
 */
function layers(bread: Bread, filling: FillingLook | null): CakeLayer[] {
  const crustBottom: CakeLayer = { height: 0.04, colors: [mix(bread.bottom, CRUST.toward, CRUST.amount)], crumb: true }
  const crustTop: CakeLayer = { height: 0.05, colors: [mix(bread.top, CRUST.toward, CRUST.amount)], crumb: true }
  if (!filling || filling.flavors.length === 0) {
    return [crustBottom, breadLayer(0.46, bread.bottom), breadLayer(0.45, bread.top), crustTop]
  }
  const [first, second] = filling.flavors
  const flavorLayer = (height: number): CakeLayer =>
    second
      ? { height, colors: [first.body, second.body], pieces: [first.pieces, second.pieces] }
      : { height, colors: [first.body], pieces: [first.pieces] }
  if (filling.cream) {
    // Con queso o con flan (decisión de la dueña, D50): la crema abajo y el sabor arriba, en el mismo espesor.
    return [crustBottom, breadLayer(0.32, bread.bottom), { height: 0.14, colors: [filling.cream] }, flavorLayer(0.14), breadLayer(0.31, bread.top), crustTop]
  }
  return [crustBottom, breadLayer(0.38, bread.bottom), flavorLayer(0.16), breadLayer(0.37, bread.top), crustTop]
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
  const top = dataColor(bread?.previewColor) ?? dataColor(defaultBread?.previewColor) ?? FALLBACK_BREAD
  // Un pan de dos colores trae el de abajo aparte (el admin lo controla); sin él, es de un solo color.
  const bottom = dataColor(bread?.previewColorBottom) ?? top
  const tint = design.cakeType ? TYPE_TINT[design.cakeType.value] : undefined
  const tinted = (color: ShapeColor) => (tint ? mix(color, tint.toward, tint.amount) : color)
  const breadColors: Bread = { top: tinted(top), bottom: bottom === top ? tinted(top) : tinted(bottom) }

  const showFilling = !design.fillingIncluded && design.base !== null && design.flavors.length > 0
  const looks = showFilling ? design.flavors.map(flavorLook).filter((look): look is NonNullable<typeof look> => look !== null) : []
  const filling: FillingLook | null = looks.length ? { flavors: looks, cream: dataColor(design.base?.previewColor) } : null
  const frosting = current >= 5 && design.coverage ? (dataColor(design.coverage.previewColor) ?? undefined) : undefined

  const count = Math.min(Math.max(draft.tiers, 1), Math.max(design.maxTiers, 1))
  const sides = layers(breadColors, filling)
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
    // La cobertura es solo crema pastelera: las perlas y la duya llegan con la decoración (paso 6, D50).
    festoons: false,
    stand: true,
    candle: false,
    form: draft.form,
    scale: Math.min(1, FIT_HEIGHT / height) * byKg,
  }
}
