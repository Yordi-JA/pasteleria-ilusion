import type { SceneColor } from './palette.ts'

/**
 * Un color de la forma: un token, un color de la pastelería o la mezcla de dos (el matiz del tipo de pastel, la
 * corteza). Lo resuelve `palette.ts` dentro de la escena, así el view-model no carga nada de `src/three/`.
 */
export type ShapeColor = SceneColor | { mix: readonly [ShapeColor, ShapeColor]; amount: number }

/**
 * La forma del pastel que dibuja `CakeModel`, la misma de la portada y de "Diseña tu pastel". Solo tipos, sin React
 * ni three: los view-models arman un `CakeShape` sin cargar la escena. Las medidas van en unidades de escena: 1 unidad
 * son 100 px del mockup (`Main.dc.html`).
 *
 * "Diseña tu pastel" lo arma por etapas, como `design/referencia/pastel-css3d.js`: sin cobertura, cada piso muestra
 * sus capas por el costado (pan, relleno y la crema de la base); con cobertura, la crema en su color y la fila de
 * perlas de abajo. La portada usa siempre la etapa final. El tamaño de los pisos lo decide el view-model; el plato y la
 * cámara se acomodan a él (`cakeMetrics.ts`).
 */

/**
 * Trozos que asoman en el costado del relleno (D50, D51, D52): rebanadas o trozos de fruta, trozos de galleta,
 * granillo, grumitos, trozos de nuez o chispas redondas.
 */
export type CakePieces = {
  style: 'fruit_slices' | 'fruit_chunks' | 'cookie_chunks' | 'sprinkles' | 'crumbles' | 'nut_pieces' | 'round_chips'
  /** Colores de los trozos; con dos o más, se reparten entre ellos. */
  colors: readonly ShapeColor[]
}

/** Una capa del costado de un piso sin cobertura. */
export type CakeLayer = {
  /** Fracción del alto del piso, de abajo hacia arriba; las capas de un piso suman 1. */
  height: number
  /** Un color para toda la capa, o dos para mitad y mitad (dos sabores de relleno). */
  colors: readonly [ShapeColor] | readonly [ShapeColor, ShapeColor]
  /** Pan: lleva la textura de miga. */
  crumb?: boolean
  /** Trozos de cada mitad, en el orden de `colors`; `null` en una mitad lisa. */
  pieces?: readonly (CakePieces | null)[]
}

export type CakeTier = {
  /** Radio del piso redondo; en un rectangular, un radio de referencia (la mitad del ancho). */
  radius: number
  /**
   * Molde rectangular: mitad del largo (en x) y mitad del ancho (en z) del piso. Sin ellas, el largo es 2.1 veces el
   * radio y el ancho, 1.4, como el prototipo (`cakeMetrics.halfExtents`).
   */
  halfWidth?: number
  halfDepth?: number
  height: number
  /** Color de la cobertura. Sin cobertura, el piso muestra sus `layers`. */
  frosting?: ShapeColor
  /** Capas del costado, de abajo hacia arriba, cuando no hay cobertura. */
  layers?: readonly CakeLayer[]
}

/**
 * La decoración del paso 6 (D53), que la escena dibuja sobre la cobertura de todos los pisos. Los colores ya vienen resueltos: los tonos los calcula el view-model.
 *
 * - `shells`: concha de duya estrella en el borde de arriba y en el de abajo de cada piso.
 * - `rosettes`: rosetas en espiral alrededor del borde de arriba.
 * - `swags`: festones, guirnaldas que cuelgan del borde de arriba, con perlitas (`accent`) en las uniones.
 * - `ruffles`: olanes, volantes de crema por el costado; cuatro filas que alternan `main` y `accent`.
 * - `roses`: rosas de duya (modelado en clavo) en el borde de arriba de cada piso, con hojitas; cada rosa toma el color
 *   de sus pétalos de `petals`.
 * - `sprinkles`: chispas en el costado de cada piso, con el estilo (granillo o chispas redondas) y los colores de un
 *   relleno de la pastelería (D54); nada en la cara de arriba.
 */
export type CakeDecoration =
  | { kind: 'shells' | 'rosettes' | 'swags' | 'ruffles'; main: ShapeColor; accent: ShapeColor }
  | { kind: 'roses'; petals: readonly ShapeColor[]; leaf: ShapeColor }
  | { kind: 'sprinkles'; style: CakePieces['style']; colors: readonly ShapeColor[] }

/**
 * La oblea sobre la tapa del último piso (paso 7, D55). Las medidas van en cm de la tapa, con el origen en su centro, la `y`
 * hacia arriba (la vista superior, con el frente del pastel abajo) y el giro en grados hacia la derecha: los mismos números que
 * el editor. La imagen ya viene cargada; la escena la recorta con el encuadre y la dibuja.
 */
export type LidWafer = {
  shape: 'sheet' | 'circle'
  widthCm: number
  heightCm: number
  rotation: number
  x: number
  y: number
  image: HTMLImageElement
  /** El tamaño de la imagen en píxeles, para el encuadre. */
  imageWidth: number
  imageHeight: number
  imageZoom: number
  imageX: number
  imageY: number
}

/** El mensaje sobre la tapa: cada letra ya colocada (`viewmodels/messageGeometry.ts`); la escena solo la dibuja. */
export type LidMessage = {
  glyphs: readonly { text: string; x: number; y: number; rotation: number }[]
  fontSizeCm: number
  /** Cuánto baja la línea base respecto al centro de cada letra, en cm. */
  baselineCm: number
  fontFamily: string
  fontWeight: number
  /** El color de la tinta, `#rrggbb`: es comida, como los de la cobertura. */
  color: string
  /** La caja que envuelve el texto, en cm respecto a su centro y sin su giro. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  rotation: number
  x: number
  y: number
}

/** Lo que va sobre la tapa del último piso (paso 7 y 8). */
export type CakeLid = {
  /** Unidades de escena por cm de la tapa (la misma escala de los moldes). */
  unitsPerCm: number
  wafer?: LidWafer
  message?: LidMessage
}

export type CakeShape = {
  /** De abajo hacia arriba. */
  tiers: readonly CakeTier[]
  /**
   * Festones de duya: `true` es una fila de perlas en el borde de arriba y otra en el de abajo de cada piso (portada);
   * `'bottom'`, solo la de abajo (para la decoración con duya del paso 6). La cobertura sola no lleva perlas (D50).
   */
  festoons: boolean | 'bottom'
  stand: boolean
  /** Molde de los pisos; sin él, redondo. */
  form?: 'round' | 'rectangular'
  /** La decoración del paso 6; sin ella, solo la cobertura. Solo se dibuja en pisos con cobertura. */
  decoration?: CakeDecoration
  /** La oblea y el mensaje del paso 7, sobre la tapa del último piso. */
  lid?: CakeLid
  /** La base se ajusta al piso de abajo: mide un poco más que él, crece y se achica con él. Sin esto, solo crece si no cabe. */
  fitStand?: boolean
}

/**
 * Desde dónde se ve el pastel en cada paso de "Diseña tu pastel" (libro de marca, "Cotizador 3D"): la elevación de la cámara,
 * el giro al que se acomoda (`null` lo deja donde está) y si gira solo. Al cambiar `key`, la cámara se acomoda sin salto; con
 * "reducir movimiento", de golpe. La persona puede mover la vista después.
 */
export type Viewpoint = { key: string; elevation: number; angle: number | null; autoSpin: boolean }
