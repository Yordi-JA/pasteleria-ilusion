import type { BreadOption, CakeDesignOptions, FillingFlavorOption, FillingPreviewStyle } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { CakeLayer, CakePieces, CakeShape, CakeTier, ShapeColor } from '../three/cakeShape.ts'
import type { SceneColor } from '../three/palette.ts'
import { tierFootprints } from './cakeMolds.ts'
import type { Footprint } from './cakeMolds.ts'
import { decorationShape } from './cakeDecorations.ts'
import { dataColor, piecesFor } from './fillingPieces.ts'
import { DECORATION_STEP } from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La vista previa de "Diseña tu pastel" por etapas, como `design/referencia/pastel-css3d.js` y el libro de marca
 * ("Cotizador 3D"), con lo que pidió la dueña (D50 y D51): el pan con miga, en dos colores si el pan los tiene
 * (choco-vainilla: en cada piso, todo el pan que va debajo del relleno es de vainilla y todo el que va encima, de
 * chocolate); el matiz del tipo (tres leches más claro, envinado hacia el vino); el relleno al centro del costado con
 * su estilo (liso, rebanadas o trozos de fruta, trozos de galleta o granillo; mitad y mitad con dos sabores); con
 * queso o con flan, la crema abajo y el sabor arriba; todo relleno lleva una capa delgada de crema pastelera blanca
 * arriba y otra abajo (D52); desde el paso 5, la cobertura de crema pastelera en su color, sin perlas; y desde el paso 6,
 * la decoración elegida encima de la cobertura, con su color (D53). "Sin decoración" y "Otra decoración" muestran solo
 * la cobertura.
 *
 * Tamaño (D52): el de cada piso sale de los moldes de la pastelería según los kilos (`cakeMolds.ts`) y todos los pisos
 * tienen el mismo alto. El plato y la cámara se acomodan al pastel en la escena.
 *
 * Los colores de la comida son los `preview_color` de la API, que la pastelería edita; los matices, la corteza y el
 * fondo cremoso de algunos rellenos se describen como mezclas con tokens y los resuelve la escena. Sin React ni three.
 */

/** Alto de todos los pisos, sin importar el molde ni los kilos: un poco menos que el de los pisos de antes (de 1.04 a 0.62). */
const TIER_HEIGHT = 0.72
/** Unidades de escena por centímetro de molde: el molde de 12 kg (51.5 cm) llena casi todo el plato de la base. */
const UNITS_PER_CM = 0.068
/**
 * Medidas en cm de un piso cuando la API no manda moldes de esa forma: un tamaño neutro, el mismo para cualquier número
 * de kilos. Es un respaldo para que la vista previa siga dibujando; no es un dato de la pastelería.
 */
const FALLBACK_CM: Record<'round' | 'rectangular', Footprint> = {
  round: { lengthCm: 38, widthCm: 38 },
  rectangular: { lengthCm: 44, widthCm: 29 },
}
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

/** La crema pastelera: blanca, el `betun` de la paleta. Todo relleno la lleva arriba y abajo (D52). */
const PASTRY_CREAM: SceneColor = 'betun'

type FlavorLook = {
  body: ShapeColor
  pieces: CakePieces | null
  /** El fondo ya es crema pastelera (con el sabor y sus trozos encima): no lleva las capas delgadas de crema. */
  creamy?: boolean
}

/**
 * Estilos cuyo fondo es la crema pastelera con un poco del color del sabor, y no el color del sabor solo: el granillo de
 * choco-vainilla, la galleta, las chispas redondas. Ya se ven como crema con el sabor encima (la dueña los aprobó así), así
 * que no llevan las capas delgadas de crema arriba y abajo.
 */
const CREAMY_STYLES: readonly FillingPreviewStyle[] = ['cookie_chunks', 'sprinkles', 'round_chips']

/** Cómo se ve un sabor: el color de la franja y, si los lleva, sus trozos (estilo que elige la pastelería). */
function flavorLook(flavor: FillingFlavorOption): FlavorLook | null {
  const color = dataColor(flavor.previewColor)
  if (!color) return null
  const accent = dataColor(flavor.previewColorSecondary)
  if (!accent || flavor.previewStyle === 'smooth') return { body: color, pieces: null }
  const creamy = CREAMY_STYLES.includes(flavor.previewStyle)
  return { body: creamy ? mix(PASTRY_CREAM, color, CREAMY_BODY) : color, pieces: piecesFor(flavor.previewStyle, color, accent), creamy }
}

/**
 * El relleno incluido de un pan de precio completo (Choco-pingüino, Red velvet): crema pastelera blanca y, encima, lo que
 * la pastelería eligió para ese pan. Se ve desde el paso 3, porque el paso del relleno se salta.
 */
function includedFillingLook(bread: BreadOption): FlavorLook {
  const accent = dataColor(bread.includedFillingColorSecondary)
  return { body: PASTRY_CREAM, pieces: accent ? piecesFor(bread.includedFillingStyle, null, accent) : null }
}

type Bread = { top: ShapeColor; bottom: ShapeColor }

/** Una capa de pan de un solo color, con miga. */
const breadLayer = (height: number, color: ShapeColor): CakeLayer => ({ height, colors: [color], crumb: true })

/** Una capa delgada de crema pastelera, arriba y abajo del sabor. */
const pastryCreamLayer = (height: number): CakeLayer => ({ height, colors: [PASTRY_CREAM] })

/** Las capas del relleno entre el pan: el sabor, con una capa delgada de crema pastelera arriba y otra abajo si hace falta. */
function flavorWithCream(flavorLayer: CakeLayer, creamy: boolean, thickness: { flavor: number; cream: number }): CakeLayer[] {
  return creamy
    ? [{ ...flavorLayer, height: thickness.flavor + 2 * thickness.cream }]
    : [pastryCreamLayer(thickness.cream), { ...flavorLayer, height: thickness.flavor }, pastryCreamLayer(thickness.cream)]
}

type FillingLook = {
  flavors: FlavorLook[]
  /** La crema de la base con queso o con flan; `null` en la base normal. */
  cream: ShapeColor | null
  /** El relleno viene con el pan: una sola franja de crema con sus trozos, sin las capas delgadas. */
  included?: boolean
}

/**
 * Las capas del costado de abajo hacia arriba: corteza, pan, relleno (si hay), pan y corteza. En un pan de dos
 * colores, el pan de abajo (y su corteza) es todo del color de abajo y el de arriba, todo del de arriba (D51). El
 * relleno lleva una capa delgada de crema pastelera arriba y otra abajo del sabor, salvo los que ya son crema (D52).
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
  if (filling.included) {
    return [crustBottom, breadLayer(0.36, bread.bottom), flavorLayer(0.2), breadLayer(0.35, bread.top), crustTop]
  }
  // Con dos sabores, las capas de crema son de todo el piso: basta que uno de los dos no sea ya crema.
  const creamy = filling.flavors.every((flavor) => flavor.creamy)
  if (filling.cream) {
    // Con queso o con flan (decisión de la dueña, D50): la crema de la base abajo y el sabor arriba.
    return [
      crustBottom,
      breadLayer(0.28, bread.bottom),
      { height: 0.12, colors: [filling.cream] },
      ...flavorWithCream(flavorLayer(0), creamy, { flavor: 0.13, cream: 0.04 }),
      breadLayer(0.3, bread.top),
      crustTop,
    ]
  }
  return [crustBottom, breadLayer(0.34, bread.bottom), ...flavorWithCream(flavorLayer(0), creamy, { flavor: 0.15, cream: 0.04 }), breadLayer(0.34, bread.top), crustTop]
}

/** Cuánto más chico es cada piso que el de abajo en el tamaño de respaldo (el área baja a 0.64). */
const FALLBACK_STEP = 0.8
/** Medidas plausibles de un piso en cm (también las que salen de interpolar o de repartir): un molde mal escrito en el admin no saca el pastel de la tarjeta ni lo borra. */
const MIN_CM = 15
const MAX_CM = 150

/**
 * Los pisos de la forma pedida con el tamaño que dan los moldes para esos kilos; sin moldes, el tamaño de respaldo, también
 * escalonado: cada piso más chico que el de abajo.
 */
function tierSizes(options: CakeDesignOptions, form: 'round' | 'rectangular', kg: number, count: number): Footprint[] {
  return (
    tierFootprints(options.cakeMolds, form, kg, count) ??
    Array.from({ length: count }, (_, index) => ({
      lengthCm: FALLBACK_CM[form].lengthCm * FALLBACK_STEP ** index,
      widthCm: FALLBACK_CM[form].widthCm * FALLBACK_STEP ** index,
    }))
  )
}

/** Un piso con las medidas de su molde: el radio en redondo; en rectangular, la mitad del largo y del ancho. */
function tierShape(size: Footprint, form: 'round' | 'rectangular'): Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth' | 'height'> {
  const cm = (value: number) => Math.min(MAX_CM, Math.max(MIN_CM, value))
  const halfLength = (cm(size.lengthCm) * UNITS_PER_CM) / 2
  const halfWidth = (cm(size.widthCm) * UNITS_PER_CM) / 2
  if (form === 'round') return { radius: halfLength, height: TIER_HEIGHT }
  return { radius: halfWidth, halfWidth: halfLength, halfDepth: halfWidth, height: TIER_HEIGHT }
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
  const looks = showFilling ? design.flavors.map(flavorLook).filter((look): look is FlavorLook => look !== null) : []
  const filling: FillingLook | null = design.fillingIncluded && design.bread
    ? { flavors: [includedFillingLook(design.bread)], cream: null, included: true }
    : looks.length
      ? { flavors: looks, cream: dataColor(design.base?.previewColor) }
      : null
  const frosting = current >= 5 && design.coverage ? (dataColor(design.coverage.previewColor) ?? undefined) : undefined

  const count = Math.min(Math.max(draft.tiers, 1), Math.max(design.maxTiers, 1))
  const sides = layers(breadColors, filling)
  // Sin kilos de la API todavía, el pastel se ve como el más chico.
  const kg = design.kg ?? options.limits.minCustomKg
  const tiers: CakeTier[] = tierSizes(options, draft.form, kg, count).map((size) => ({
    ...tierShape(size, draft.form),
    ...(frosting ? { frosting } : { layers: sides }),
  }))
  // La decoración va sobre la cobertura: sin ella (pasos 1 a 4) no se dibuja, aunque ya esté elegida.
  const decoration = frosting && current >= DECORATION_STEP ? decorationShape(draft, design, options) : null
  return {
    tiers,
    // La cobertura es solo crema pastelera: la duya y las perlas llegan con la decoración (paso 6), que lleva las suyas.
    festoons: false,
    ...(decoration ? { decoration } : {}),
    stand: true,
    candle: false,
    form: draft.form,
    // La base mide un poco más que el piso de abajo: crece y se achica con él.
    fitStand: true,
  }
}
