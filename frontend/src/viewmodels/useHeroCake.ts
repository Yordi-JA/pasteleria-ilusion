import type { CakeShape } from '../three/cakeShape.ts'
import { useCakeScene } from './useCakeScene.ts'
import type { CakeSceneStatus, CakeSceneView } from './useCakeScene.ts'

/** `loading`: se ve el pastel fijo mientras llega la escena; `ready`: ya se dibujó; `fallback`: queda el pastel fijo. */
export type HeroCakeStatus = CakeSceneStatus

/** El pastel de la portada (libro de marca, "Presencia de marca"), con las medidas del mockup. */
export const HERO_CAKE: CakeShape = {
  tiers: [
    { radius: 1.5, height: 1.12, frosting: 'betun' },
    { radius: 1.1, height: 0.96, frosting: 'fresa-claro' },
    { radius: 0.72, height: 0.8, frosting: 'betun' },
  ],
  festoons: true,
  stand: true,
  candle: true,
}

/** El lienzo sube 72 px por encima de la caja (la vela con los pisos separados): también cuenta para "se ve". */
const VISIBLE_MARGIN = '72px 0px 0px 0px'

/** View-model del pastel de la portada: la escena compartida (`useCakeScene`) con el pastel del hero. */
export function useHeroCake() {
  return useCakeScene(HERO_CAKE, VISIBLE_MARGIN)
}

export type HeroCakeView = CakeSceneView
