import type { ComponentType } from 'react'
import type { DessertKind, DessertShape } from './dessertShape.ts'
import Flan from './Flan.tsx'
import LayeredCup from './LayeredCup.tsx'
import MiniTart from './MiniTart.tsx'
import MosaicCup from './MosaicCup.tsx'

/**
 * Dibuja un postre (D95) con la base en la altura 0, centrado: la escena (`CakeScene.tsx`) y la imagen fija (`CakeStill.tsx`) lo
 * giran, lo iluminan y lo encuadran igual que al pastel. Cada clase de postre tiene su componente; agregar uno es agregar su forma
 * en `dessertShape.ts`, sus medidas en `dessertLayout.ts` y su entrada aquí (el tipo del registro exige que estén todas).
 */
const MODELS: { [K in DessertKind]: ComponentType<{ shape: Extract<DessertShape, { kind: K }> }> } = {
  mosaicCup: MosaicCup,
  layeredCup: LayeredCup,
  miniTart: MiniTart,
  flan: Flan,
}

export default function DessertModel({ shape }: { shape: DessertShape }) {
  // TypeScript no relaciona `MODELS[shape.kind]` con `shape` (una unión correlacionada): el tipo del registro ya garantiza que
  // cada componente recibe el postre de su `kind`.
  const Model = MODELS[shape.kind] as ComponentType<{ shape: DessertShape }>
  return <Model shape={shape} />
}
