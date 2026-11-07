import type { BrandColor } from './palette.ts'

/**
 * La forma del pastel que dibuja `CakeModel`, la misma de la portada y de "Diseña tu pastel". Solo tipos, sin React
 * ni three: los view-models arman un `CakeShape` sin cargar la escena. Las medidas van en unidades de escena: 1 unidad
 * son 100 px del mockup (`Main.dc.html`).
 *
 * Para "Diseña tu pastel" se extiende con las etapas de `design/referencia/pastel-css3d.js` (pan, relleno,
 * cobertura, decoración) como campos nuevos; hoy solo existe la etapa final de la portada.
 */
export type CakeTier = {
  radius: number
  height: number
  /** Color de la cobertura del piso, siempre un token. */
  frosting: BrandColor
}

export type CakeShape = {
  /** De abajo hacia arriba. */
  tiers: readonly CakeTier[]
  /** Festones de duya: una fila de perlas en el borde de arriba y otra en el de abajo de cada piso. */
  festoons: boolean
  stand: boolean
  candle: boolean
}
