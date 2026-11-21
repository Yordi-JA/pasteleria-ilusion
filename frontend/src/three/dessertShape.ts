import type { CakeBoard, CakeShape, ShapeColor } from './cakeShape.ts'

/**
 * La forma de un postre que dibuja `DessertModel` (D95): la otra familia de la escena, junto a los pisos de `CakeShape`. Tipos y
 * una guarda, sin React ni three, como `cakeShape.ts`: los view-models la arman sin cargar la escena (importan solo los tipos; la
 * guarda la usa la escena). Cada postre se arma en cm, como
 * la fruta (`fruit.ts`), y se escala con `unitsPerCm`, la escala de los moldes: un vaso mide lo que mide un vaso de verdad.
 *
 * Los colores son comida (la crema, la gelatina, la masa, el caramelo), como los `preview_color` del admin y `FRUIT_COLORS`: los
 * pone el view-model (`viewmodels/dessertSamples.ts`) y la escena los resuelve en `palette.ts`.
 */

/**
 * Un vaso de gelatina con tapa y cubos de gelatina de colores (`assets/Catalogo/Mosaico Vaso.jpeg`). La base y los cubos son
 * parámetros, y el estilo dice qué es la base: `solid`, gelatina firme de la que asoman los cubos (la gelatina mosaico, amarilla);
 * `creamy`, un líquido espeso (crema, yogurt) con muchos más cubos, envueltos por él.
 */
export type MosaicCupShape = {
  kind: 'mosaicCup'
  /** La base: gelatina, crema, yogurt… */
  base: ShapeColor
  /** Los colores de los cubos de gelatina, que se reparten entre ellos (uno repetido sale más). Sin ninguno, la base sola. */
  cubes: readonly ShapeColor[]
  /** Sin él, `solid`. */
  style?: 'solid' | 'creamy'
  unitsPerCm: number
}

/**
 * Un vaso de gelatina en capas horizontales, con tapa: la gelatina de Duvalín, que imita el dulce. Las capas van de abajo hacia
 * arriba, parejas y de bordes limpios; la de arriba queda bajo la tapa.
 */
export type LayeredCupShape = {
  kind: 'layeredCup'
  /** El color de cada capa, de abajo hacia arriba. */
  layers: readonly ShapeColor[]
  unitsPerCm: number
}

/**
 * La tarta mini (`assets/Catalogo/Tarta Mini.jpeg`): la base de masa con el borde festoneado, la crema pastelera y, encima, rodajas
 * de kiwi y gajos de fresa con brillo. La fruta es la de `fruit.ts`.
 */
export type MiniTartShape = {
  kind: 'miniTart'
  /** La masa horneada; el borde se tuesta un poco más. */
  crust: ShapeColor
  /** La crema pastelera. */
  cream: ShapeColor
  unitsPerCm: number
}

/**
 * Un flan desmoldado: el flan con la cara de arriba bañada en caramelo y el caramelo que escurre por el costado y forma un charco. El
 * flan napolitano (`assets/Catalogo/Napolitano.jpeg`) es el individual; el Imposible (`assets/Catalogo/Imposible.jpg`), el del tamaño
 * de un pastel, con el pan de chocolate abajo. Va sobre la charola de los pasteles (el usuario la prefirió al recipiente transparente
 * de la foto del napolitano).
 */
export type FlanShape = {
  kind: 'flan'
  /** `individual` (el napolitano) o `whole` (del tamaño de un pastel, el Imposible); sin él, `individual`. */
  size?: 'individual' | 'whole'
  /** El pan bajo el flan (el pan de chocolate del Imposible); sin él, el flan solo. Su alto lo da el tamaño. */
  bread?: ShapeColor
  /** El flan, con las burbujitas tostadas del costado. */
  custard: ShapeColor
  /** La cara de arriba, bañada en caramelo (más clara y anaranjada que el charco). */
  glaze: ShapeColor
  /** El caramelo oscuro del charco y de lo que escurre por el costado. */
  caramel: ShapeColor
  /** La charola bajo el flan y su charco, la misma de los pasteles; sin ella, el charco va sobre la mesa. */
  board?: CakeBoard
  unitsPerCm: number
}

export type DessertShape = MosaicCupShape | LayeredCupShape | MiniTartShape | FlanShape
export type DessertKind = DessertShape['kind']

/** Lo que dibuja la escena: un pastel por pisos o un postre. */
export type SceneShape = CakeShape | DessertShape

/** Si la forma es un postre: solo los postres llevan `kind` (un `CakeShape` no tiene ese campo). */
export function isDessert(shape: SceneShape): shape is DessertShape {
  return 'kind' in shape
}
