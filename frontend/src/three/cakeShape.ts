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

/**
 * El acabado de un relleno sin trozos (tanda 4): `jam`, mermelada brillante con semillas y la superficie un poco
 * despareja; `caramel`, cajeta brillante y lisa, con el color que varía apenas. El color sigue siendo el de la capa.
 */
export type CakeFinish = 'jam' | 'caramel'

/**
 * Cómo se unta una capa de crema (tanda 4, parte 2): `cream`, la crema pastelera untada a mano, con orillas onduladas y
 * abombada; `mild`, lo mismo apenas (mermelada, cajeta y cremas con trozos encima). Ver `creamSpread.ts`.
 */
export type CakeSpread = 'cream' | 'mild'

/**
 * La crema pastelera teñida por el relleno que toca (tanda 4): la mermelada y la cajeta se mezclan con la crema de junto. La crema
 * sigue siendo crema (su color es el de la capa); el tinte es el color del relleno, que la escena mezcla poco, más junto a él.
 */
export type CakeTint = {
  /** El color del relleno que tiñe cada mitad, en el orden de las mitades del relleno; `null` en una mitad sin tinte. */
  colors: readonly [ShapeColor | null] | readonly [ShapeColor | null, ShapeColor | null]
  /** De qué lado de la capa está el relleno: ahí la crema toma más color. */
  toward: 'above' | 'below'
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
  /** Acabado de cada mitad, en el orden de `colors`; `null` en una mitad sin acabado. Sin él, ninguna lo lleva. */
  finishes?: readonly (CakeFinish | null)[]
  /** Solo en una capa de un color: se ve untada a mano. Sin él, es una franja recta. */
  spread?: CakeSpread
  /** Solo en una capa untada: el relleno que la tiñe. Sin él, conserva su color. */
  tint?: CakeTint
}

/**
 * El peinado lateral (tanda 4): surcos horizontales y parejos en los costados de la cobertura, en unidades de escena. `pitch` es
 * la distancia entre surcos y `depth`, lo que se hunden. Ver `comb.ts`.
 */
export type CakeComb = { pitch: number; depth: number }

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
  /** Solo con cobertura: los costados peinados. Sin él, lisos. */
  comb?: CakeComb
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
  | {
      kind: 'shells' | 'rosettes' | 'swags' | 'ruffles'
      main: ShapeColor
      accent: ShapeColor
      /**
       * Solo en las imágenes del catálogo: cuánto más grandes son las conchas o los rosetones del borde de arriba (1 es el tamaño
       * del diseñador). Con piezas más grandes caben menos. Sin él, 1.
       */
      size?: number
      /** Solo en las imágenes del catálogo: cuánto más adentro van los rosetones, en parte del radio del piso. Sin él, 0. */
      inset?: number
    }
  | { kind: 'roses'; petals: readonly ShapeColor[]; leaf: ShapeColor }
  | {
      kind: 'sprinkles'
      style: CakePieces['style']
      colors: readonly ShapeColor[]
      /** Solo en las imágenes del catálogo: cuántas veces más chispas que en el diseñador. Sin él, 1. */
      density?: number
    }

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

/**
 * Las frutas frescas que la pastelería pone en la cara de arriba (las fotos del catálogo): fresa (en mitades o entera), kiwi,
 * durazno en almíbar, manzana roja en abanico, uva verde, carambola, pera, physalis, plátano, piña en trozos y manzana en rodajas
 * (`apple_slice`, rodajas planas de manzana amarilla o roja, como en la foto de flan y zarzamora).
 */
export type FruitKind = 'strawberry' | 'kiwi' | 'peach' | 'apple' | 'grape' | 'starfruit' | 'pear' | 'physalis' | 'banana' | 'pineapple' | 'apple_slice'

/**
 * Cómo se acomoda la fruta: `mound`, un montón al centro; `ring`, una vuelta junto a la orilla, por dentro del borde de duya;
 * `rows`, en filas de una fruta cada una; `diagonal`, esas filas giradas, en diagonal sobre toda la tapa (flan y zarzamora);
 * `stripes`, una franja de cada fruta de atrás hacia el frente, con una hilera de rosetones entre cada dos (blueberry).
 */
export type FruitLayoutKind = 'mound' | 'ring' | 'rows' | 'diagonal' | 'stripes'

/**
 * Lo que va sobre la tapa del último piso además del mensaje y la oblea (tanda 4b): por ahora, fruta fresca. Solo para las
 * imágenes del catálogo; no se pide en "Diseña tu pastel", que nunca la pone. Ver `fruit.ts`.
 */
export type CakeTopping = {
  kind: 'fruit'
  layout: FruitLayoutKind
  /** Qué frutas lleva, en el orden en que se reparten; sin ella, las seis que más salen en las fotos (`DEFAULT_FRUITS`). */
  fruits?: readonly FruitKind[]
  /** Unidades de escena por cm del pastel (la escala de los moldes): cada pieza mide lo que mide una fruta de verdad. */
  unitsPerCm: number
  /**
   * Lo tupido de la fruta, de 1 a 3: con 1 (o sin él), el montón cubre del 40 al 60 % de la tapa; con 2, toda la parte libre, sin el
   * centro vacío, con más capas y piezas un poco más grandes, como las fotos de choco vainilla y cajeta; con 3, más alto y con piezas
   * más grandes (capuchino). En filas, las encima más y las junta.
   */
  density?: number
}

/**
 * La charola de cartón de las fotos de la pastelería (tanda 4b): redonda, más ancha que el piso de abajo y con el borde levantado.
 * Solo en las imágenes del catálogo, en lugar de la base con columna (`stand`).
 */
export type CakeBoard = { color: ShapeColor }

/** La textura del costado de la cobertura: encaje de duya (zigzag cerrado), marcas de espátula o crestas diagonales. */
export type SideTextureKind = 'lace' | 'spatula' | 'ridges'
/**
 * Los hilos: encaje de chocolate sobre la tapa, hilos de cajeta sobre las piezas del borde de arriba o un garabato de lazos en un
 * lado de la tapa, junto a la orilla y sin rosetones ahí (queso y zarzamora).
 */
export type DrizzleKind = 'lace' | 'threads' | 'scribble'
/**
 * Dónde van las conchas de chocolate: huevos abiertos alrededor del borde de arriba, tulipanes cerrados alrededor del borde, cuencos
 * amontonados en la mitad de atrás de la tapa, huevos grandes en un arco de la mitad de atrás (queso y zarzamora) o huevos boca abajo
 * y rizos que cubren toda la tapa (choco-pingüino).
 */
export type ShellPlace = 'edge' | 'tulips' | 'top' | 'back' | 'full'
/**
 * Lo pegado al costado: migas de galleta (también en la tapa), virutas de chocolate, virutas grandes y tupidas (choco-pingüino) o las
 * semillas de la mermelada.
 */
export type SideBitsKind = 'crumbs' | 'flakes' | 'shavings' | 'seeds'

/**
 * Lo que tienen las fotos de la pastelería y "Diseña tu pastel" no ofrece (tanda 4b): solo en las imágenes del catálogo, en el
 * último piso (las muestras son de un piso). Los colores son comida, como los de la cobertura. Ver `sampleDetails.ts`.
 */
export type CakeDetails = {
  /** La tapa en otro color o con brillo de espejo, encima de la cobertura. */
  top?: { color: ShapeColor; glossy: boolean }
  /** Un anillo de mermelada brillante en la tapa; `width` es la parte del radio de la tapa que ocupa desde la orilla. */
  ring?: { color: ShapeColor; width: number }
  /** El costado brilla como la cajeta. */
  sideGlossy?: boolean
  sideTexture?: SideTextureKind
  /** La parte de abajo del costado en otro color; `height` es la parte del alto del piso. */
  band?: { color: ShapeColor; height: number }
  drizzle?: { kind: DrizzleKind; color: ShapeColor }
  /** Conchas de chocolate; con dos colores, se alternan. `inset` las mete hacia el centro, en parte del radio de la tapa. */
  shells?: { place: ShellPlace; colors: readonly ShapeColor[]; inset?: number }
  /** Canela o azúcar glass sobre la tapa y las conchas. */
  dusting?: ShapeColor
  sideBits?: { kind: SideBitsKind; color: ShapeColor }
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
  /** Fruta sobre la tapa del último piso, solo para las imágenes del catálogo. Se aparta del mensaje, de la oblea y del borde. */
  topping?: CakeTopping
  /** La base se ajusta al piso de abajo: mide un poco más que él, crece y se achica con él. Sin esto, solo crece si no cabe. */
  fitStand?: boolean
  /** La charola de las fotos, solo en las imágenes del catálogo (va con `stand: false`). */
  board?: CakeBoard
  /** Los detalles de las fotos que el diseñador no ofrece, solo en las imágenes del catálogo. */
  details?: CakeDetails
}

/**
 * Desde dónde se ve el pastel en cada paso de "Diseña tu pastel" (libro de marca, "Cotizador 3D"): la elevación de la cámara,
 * el giro al que se acomoda (`null` lo deja donde está) y si gira solo. Al cambiar `key`, la cámara se acomoda sin salto; con
 * "reducir movimiento", de golpe. La persona puede mover la vista después.
 */
export type Viewpoint = { key: string; elevation: number; angle: number | null; autoSpin: boolean }
