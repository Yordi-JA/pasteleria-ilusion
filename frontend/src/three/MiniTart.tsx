import { useMemo } from 'react'
import { DoubleSide } from 'three'
import { Lathe } from './DessertParts.tsx'
import { tartCreamProfile, tartFruit, tartShell } from './dessertLayout.ts'
import type { MiniTartShape } from './dessertShape.ts'
import { finishEnvironment } from './finish.ts'
import Fruit from './Fruit.tsx'
import { resolveColor } from './palette.ts'
import { useGeometry } from './vertexGeometry.ts'

/**
 * La tarta mini (D95): la masa con el costado acanalado y el borde festoneado, la crema pastelera con el brillo del glaseado y la
 * fruta de `fruit.ts` (rodajas de kiwi y gajos de fresa), que ya brilla como el almíbar.
 */

const CREAM = tartCreamProfile()
const FRUIT = tartFruit()

export default function MiniTart({ shape }: { shape: MiniTartShape }) {
  const shell = useMemo(() => tartShell(shape), [shape])
  const geometry = useGeometry(shell)
  return (
    <group scale={shape.unitsPerCm}>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial vertexColors roughness={0.78} side={DoubleSide} />
        </mesh>
      )}
      <Lathe profile={CREAM}>
        <meshStandardMaterial color={resolveColor(shape.cream)} roughness={0.3} envMap={finishEnvironment()} envMapIntensity={0.5} />
      </Lathe>
      <Fruit layout={FRUIT} />
    </group>
  )
}
