import { useMemo } from 'react'
import { DoubleSide } from 'three'
import { boardLift, MOLD_RING, moldFruit, moldRingBody } from './dessertLayout.ts'
import type { MoldRingShape } from './dessertShape.ts'
import { finishEnvironment } from './finish.ts'
import Fruit from './Fruit.tsx'
import { BoardDisc } from './SampleDetails.tsx'
import { useGeometry } from './vertexGeometry.ts'

/**
 * La gelatina de molde (D98): la corona acanalada con su hueco al centro y las capas de colores del costado, una sola malla con
 * colores por vértice (`moldRingBody`), con el brillo de la gelatina; encima, los gajos de durazno y las fresas de `fruit.ts`, y
 * abajo la charola de los pasteles (`BoardDisc`), como el flan.
 */

const FRUIT = moldFruit()

export default function MoldRing({ shape }: { shape: MoldRingShape }) {
  const body = useGeometry(useMemo(() => moldRingBody(shape), [shape]))
  return (
    <>
      {shape.board && <BoardDisc radius={MOLD_RING.boardRadius * shape.unitsPerCm} color={shape.board.color} />}
      <group position-y={boardLift(shape)} scale={shape.unitsPerCm}>
        {body && (
          <mesh geometry={body}>
            <meshStandardMaterial vertexColors roughness={0.14} envMap={finishEnvironment()} envMapIntensity={0.9} side={DoubleSide} />
          </mesh>
        )}
        <Fruit layout={FRUIT} />
      </group>
    </>
  )
}
