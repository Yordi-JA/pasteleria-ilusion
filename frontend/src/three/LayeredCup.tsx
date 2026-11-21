import { useMemo } from 'react'
import { CupShell, Lathe } from './DessertParts.tsx'
import { layerProfiles } from './dessertLayout.ts'
import type { LayeredCupShape } from './dessertShape.ts'
import { finishEnvironment } from './finish.ts'
import { resolveColor } from './palette.ts'

/**
 * La gelatina de Duvalín (D95): capas parejas de gelatina, cada una de su color, de abajo hacia arriba, con brillo de gelatina, en el
 * mismo vaso con tapa de las gelatinas de cubos (`CupShell`).
 */
export default function LayeredCup({ shape }: { shape: LayeredCupShape }) {
  const profiles = useMemo(() => layerProfiles(shape.layers.length), [shape.layers.length])
  return (
    <group scale={shape.unitsPerCm}>
      {profiles.map((profile, i) => (
        <Lathe key={i} profile={profile}>
          <meshStandardMaterial color={resolveColor(shape.layers[i])} roughness={0.22} envMap={finishEnvironment()} envMapIntensity={0.6} />
        </Lathe>
      ))}
      <CupShell />
    </group>
  )
}
