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
 * perlas de abajo. La portada usa siempre la etapa final.
 */

/** Trozos que asoman en el costado del relleno (D50, D51): rebanadas o trozos de fruta, trozos de galleta o granillo. */
export type CakePieces = {
  style: 'fruit_slices' | 'fruit_chunks' | 'cookie_chunks' | 'sprinkles'
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
  radius: number
  height: number
  /** Color de la cobertura. Sin cobertura, el piso muestra sus `layers`. */
  frosting?: ShapeColor
  /** Capas del costado, de abajo hacia arriba, cuando no hay cobertura. */
  layers?: readonly CakeLayer[]
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
  candle: boolean
  /** Molde de los pisos; sin él, redondo. En rectangular, el ancho es 2.1 veces el radio y el fondo, 1.4. */
  form?: 'round' | 'rectangular'
  /** Escala del pastel sobre el plato, para que los pisos quepan en la vista previa. Sin ella, 1. */
  scale?: number
}
