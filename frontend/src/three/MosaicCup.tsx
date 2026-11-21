import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import { CupShell, Lathe } from './DessertParts.tsx'
import { CUBE_ROTATION_ORDER, mosaicCream, mosaicCubes, mosaicLook, mosaicSkinProfile } from './dessertLayout.ts'
import type { CubePlacement } from './dessertLayout.ts'
import type { MosaicCupShape } from './dessertShape.ts'
import { finishEnvironment } from './finish.ts'
import { resolveColor, veilColor } from './palette.ts'
import { useGeometry } from './vertexGeometry.ts'

/**
 * Un vaso de gelatina con cubos (D95): la base (gelatina firme o un líquido espeso, según `style`), los cubos de gelatina que asoman de
 * ella junto a la pared y por arriba, la capa translúcida pegada al vaso, a través de la que se ven, y el vaso y la tapa (`CupShell`).
 * En la crema o el yogurt cada cubo se mezcla con el color de la base (`veil`): se ve envuelto por el líquido. Sin trabajo por cuadro:
 * todo sale de una semilla y la escena usa `frameloop="demand"`.
 */

function Cubes({ cubes, colors, base }: { cubes: readonly CubePlacement[]; colors: MosaicCupShape['cubes']; base: MosaicCupShape['base'] }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  // Cada cubo con su velo del color del líquido (`veilColor`): se aclara hacia él sin perder su tono.
  const tones = useMemo(() => cubes.map((cube) => new Color(veilColor(colors[cube.color], base, cube.veil))), [base, colors, cubes])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new Matrix4()
    const turn = new Quaternion()
    const euler = new Euler()
    const position = new Vector3()
    const scale = new Vector3()
    cubes.forEach((cube, i) => {
      matrix.compose(position.set(...cube.p), turn.setFromEuler(euler.set(...cube.rotation, CUBE_ROTATION_ORDER)), scale.setScalar(cube.size))
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, tones[i])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [cubes, invalidate, tones])
  if (cubes.length === 0) return null
  return (
    <instancedMesh key={cubes.length} ref={ref} args={[undefined, undefined, cubes.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* La gelatina brilla: el mismo entorno de la mermelada, con reflejos en cada cara para que se lea el volumen. */}
      <meshStandardMaterial roughness={0.24} envMap={finishEnvironment()} envMapIntensity={0.6} />
    </instancedMesh>
  )
}

export default function MosaicCup({ shape }: { shape: MosaicCupShape }) {
  const look = mosaicLook(shape)
  const cubes = useMemo(() => mosaicCubes(shape), [shape])
  const cream = useGeometry(useMemo(() => mosaicCream(shape), [shape]))
  // De afuera hacia adentro; se dibujan de adentro hacia afuera (lo de atrás primero).
  const liquid = useMemo(() => look.liquid.map((layer) => ({ ...layer, profile: mosaicSkinProfile(shape, layer.inset) })), [look, shape])
  return (
    <group scale={shape.unitsPerCm}>
      {/* La base con cuerpo: el color va en los vértices y brilla suave. */}
      {cream && (
        <mesh geometry={cream}>
          <meshStandardMaterial vertexColors roughness={look.cream.roughness} envMap={finishEnvironment()} envMapIntensity={look.cream.sheen} side={DoubleSide} />
        </mesh>
      )}
      <Cubes cubes={cubes} colors={shape.cubes} base={shape.base} />
      {/* Las capas translúcidas: dejan ver los cubos, más velados cuanto más adentro. */}
      {liquid.map((layer, k) => (
        <Lathe key={layer.inset} profile={layer.profile} renderOrder={1 + (liquid.length - k) * 0.1}>
          <meshStandardMaterial color={resolveColor(shape.base)} transparent opacity={layer.opacity} roughness={0.5} depthWrite={false} side={DoubleSide} />
        </Lathe>
      ))}
      <CupShell />
    </group>
  )
}
