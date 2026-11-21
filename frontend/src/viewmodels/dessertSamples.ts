import type { ShapeColor } from '../three/cakeShape.ts'
import type { DessertShape, FlanShape, LayeredCupShape, MiniTartShape, MoldRingShape, MosaicCupShape } from '../three/dessertShape.ts'
import { UNITS_PER_CM } from './cakeMolds.ts'
import { SAMPLE_BOARD } from './sampleDesign.ts'

/**
 * El modelo 3D de los postres del catálogo (D95), por el `slug` de su producto, sin petición a la API: como el pastel de la portada
 * (`homeCake.ts`), es arte fijo en el código. Los pasteles toman su modelo de su muestra (`ProductSampleDesign`, D86), que el backend
 * solo acepta en pasteles; los postres todavía no tienen una en la base de datos, así que su forma vive aquí. Un postre que no está
 * en la lista no tiene modelo: la ficha conserva su foto. Si la pastelería le cambia el `slug` a un producto, su modelo deja de
 * verse (no falla).
 *
 * Los colores son comida, como `FRUIT_COLORS` de `three/fruit.ts` y los `preview_color` del admin: no son colores de la marca. Los
 * tomé de las fotos de la pastelería (`assets/Catalogo/`) y, donde no hay foto, los propuse para que se lean sobre el campo `fresa` de
 * la ficha. Sin React ni three.
 */

/** Un vaso de gelatina con cubos: su base, los colores de sus cubos y si la base es gelatina firme o un líquido espeso. */
export function mosaicCup({ base, cubes, style = 'solid' }: { base: ShapeColor; cubes: readonly ShapeColor[]; style?: MosaicCupShape['style'] }): MosaicCupShape {
  return { kind: 'mosaicCup', base, cubes, style, unitsPerCm: UNITS_PER_CM }
}

/**
 * Los cubos de gelatina de los vasos (`Mosaico Vaso.jpeg`): verde casi negro (la mitad: va dos veces en la lista), rojo y naranja.
 * Los mismos en todos los vasos de cubos hasta que la pastelería diga otra cosa.
 */
const MOSAIC_GREEN = '#053a17'
const GELATIN_CUBES: readonly ShapeColor[] = [MOSAIC_GREEN, '#c4232b', MOSAIC_GREEN, '#e3721c']

/** La gelatina mosaico (`Mosaico Vaso.jpeg`): gelatina amarilla clara, firme, con los cubos. */
const GELATIN_MOSAIC = mosaicCup({ base: '#ead592', cubes: GELATIN_CUBES })

/**
 * Los vasos de crema y de yogurt: un líquido espeso con muchos cubos envueltos. Propuse los colores (no hay foto): crema blanca cálida,
 * yogurt de fresa rosa y yogurt de durazno naranja claro, con el tono justo para no perderse en el campo `fresa` de la ficha.
 */
const MOSAIC_WITH_CREAM = mosaicCup({ base: '#faf5ea', cubes: GELATIN_CUBES, style: 'creamy' })
const MOSAIC_WITH_STRAWBERRY_YOGURT = mosaicCup({ base: '#ec98af', cubes: GELATIN_CUBES, style: 'creamy' })
const MOSAIC_WITH_PEACH_YOGURT = mosaicCup({ base: '#f5b57a', cubes: GELATIN_CUBES, style: 'creamy' })

/** La gelatina de Duvalín: tres capas, de abajo hacia arriba café claro, rosa y amarillo, como el dulce. */
const DUVALIN: LayeredCupShape = { kind: 'layeredCup', layers: ['#c99a6c', '#f0a0b8', '#f2d67c'], unitsPerCm: UNITS_PER_CM }

/** "Tarta de frutas" (`Tarta Mini.jpeg`, la mini): masa dorada y crema pastelera; la fruta es la de `three/fruit.ts`. */
const FRUIT_TART: MiniTartShape = { kind: 'miniTart', crust: '#e2b46c', cream: '#f3dc8c', unitsPerCm: UNITS_PER_CM }

/**
 * "Flan napolitano" (`Napolitano.jpeg`, el individual): flan claro, cara de arriba anaranjada y caramelo oscuro, sobre la charola negra
 * de los pasteles (`SAMPLE_BOARD`) en lugar del recipiente transparente de la foto (lo pidió el usuario).
 */
const NAPOLITAN_FLAN: FlanShape = { kind: 'flan', custard: '#f1cf92', glaze: '#e0761d', caramel: '#7a320c', board: SAMPLE_BOARD, unitsPerCm: UNITS_PER_CM }

/**
 * "Imposible" (`Imposible.jpg`): del tamaño de un pastel, el pan de chocolate oscuro abajo y el flan dorado arriba, más alto, con la
 * cara de arriba cubierta de caramelo ámbar que apenas escurre por la orilla; sobre la charola negra de los pasteles, como el
 * napolitano. Los colores, de la foto.
 */
const IMPOSIBLE: FlanShape = {
  kind: 'flan',
  size: 'whole',
  bread: '#3b2419',
  custard: '#e9c27c',
  glaze: '#b9773a',
  caramel: '#8e4a14',
  board: SAMPLE_BOARD,
  unitsPerCm: UNITS_PER_CM,
}

/**
 * "Posible" (D98): el Imposible con el pan de vainilla en lugar del de chocolate, con las mismas medidas, el mismo flan y el mismo
 * caramelo. No hay foto: propuse un amarillo pálido, más claro y apagado que el flan dorado, para que el corte entre los dos se lea.
 */
const POSIBLE: FlanShape = { ...IMPOSIBLE, bread: '#efe2bb' }

/**
 * "Gelatina de molde" (D98, `Mosaico.jpeg`): desmoldada de un molde de anillo acanalado, con la capa amarilla gruesa arriba y, de
 * arriba hacia abajo, dos tandas de crema, rosa y naranja en el costado; sobre la charola negra de los pasteles. Los colores, de la
 * foto; otro sabor es otra lista de capas.
 */
const MOLD_GELATIN: MoldRingShape = {
  kind: 'moldRing',
  layers: ['#f08a1c', '#ec8fa0', '#f7ecd2', '#f08a1c', '#ec8fa0', '#f7ecd2'],
  crown: '#f6c514',
  board: SAMPLE_BOARD,
  unitsPerCm: UNITS_PER_CM,
}

/**
 * Los postres con modelo, por el `slug` de su producto (semillas `0009_seed_catalog` y `0059_seed_cup_gelatins`): los cinco vasos de
 * gelatina (el mosaico normal, el de crema, los de yogurt de durazno y de fresa y el de Duvalín), la tarta, el flan napolitano, el
 * Imposible, el Posible y la gelatina de molde: todos los postres del catálogo.
 */
const DESSERT_SAMPLES: Readonly<Record<string, DessertShape>> = {
  'mosaico-con-crema': MOSAIC_WITH_CREAM,
  'mosaico-con-yogurt-de-fresa': MOSAIC_WITH_STRAWBERRY_YOGURT,
  'gelatina-de-duvalin': DUVALIN,
  'tarta-de-frutas': FRUIT_TART,
  'flan-napolitano': NAPOLITAN_FLAN,
  imposible: IMPOSIBLE,
  'gelatina-mosaico': GELATIN_MOSAIC,
  'mosaico-con-yogurt-de-durazno': MOSAIC_WITH_PEACH_YOGURT,
  posible: POSIBLE,
  'gelatina-de-molde': MOLD_GELATIN,
}

/** El modelo del postre de ese producto, o `null` si no tiene. */
export function dessertSample(slug: string): DessertShape | null {
  return Object.hasOwn(DESSERT_SAMPLES, slug) ? DESSERT_SAMPLES[slug] : null
}

/**
 * El archivo de la imagen fija del modelo de ese postre en `/fotos/`, el que guarda `npm run render:modelos -- <slug>`
 * (`scripts/render-models.mjs`), o `null` si no tiene modelo. La API no la da (solo guarda muestras de pasteles): la tarjeta la
 * toma de aquí.
 */
export function dessertModelImage(slug: string): string | null {
  return dessertSample(slug) ? `${slug}-modelo.webp` : null
}
