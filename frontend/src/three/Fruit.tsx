import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import { finishEnvironment } from './finish.ts'
import { fruitMesh } from './fruit.ts'
import type { FruitLayout, FruitPiece, FruitPlacement } from './fruit.ts'

/**
 * Dibuja la fruta de la tapa que colocó `fruit.ts` (tanda 4b): una malla instanciada por pieza, con los colores de la fruta en
 * cada vértice. Brilla como el almíbar con el mismo entorno de la mermelada y la cajeta (`finishEnvironment`), que three prefiltra
 * una sola vez. Sin trabajo por cuadro: las posiciones están fijas por semilla y la escena usa `frameloop="demand"`. Las
 * geometrías se liberan al desmontar; los materiales, que son de JSX, los libera r3f.
 */

/** Qué tan brillante es cada pieza: la fruta con almíbar casi como la mermelada; la cáscara del physalis, menos. */
const ROUGHNESS: Record<FruitPiece, number> = {
  strawberryHalf: 0.3,
  strawberryWhole: 0.26,
  kiwiSlice: 0.3,
  peachSlice: 0.24,
  appleFan: 0.32,
  grapeCluster: 0.22,
  starfruitSlice: 0.3,
  pearSlice: 0.32,
  physalis: 0.45,
  bananaSlice: 0.38,
  pineappleChunk: 0.28,
  appleRoundGolden: 0.3,
  appleRoundRed: 0.3,
}
const ENV_INTENSITY = 0.8

/** La geometría de three de una pieza, con los colores sRGB pasados al espacio lineal en que trabaja la escena. */
function pieceGeometry(piece: FruitPiece): BufferGeometry {
  const mesh = fruitMesh(piece)
  const linear: number[] = []
  const color = new Color()
  for (let i = 0; i < mesh.colors.length; i += 3) {
    color.setRGB(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2], SRGBColorSpace)
    linear.push(color.r, color.g, color.b)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(linear, 3))
  geometry.setIndex(mesh.indices)
  return geometry
}

function PieceMesh({ piece, placements }: { piece: FruitPiece; placements: readonly FruitPlacement[] }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(() => pieceGeometry(piece), [piece])
  useEffect(() => () => geometry.dispose(), [geometry])
  const count = placements.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new Matrix4()
    const yaw = new Quaternion()
    const lean = new Quaternion()
    const up = new Vector3(0, 1, 0)
    const axis = new Vector3()
    const position = new Vector3()
    const scale = new Vector3()
    const tint = new Color()
    placements.forEach((placement, i) => {
      // Primero el giro sobre su eje y luego la inclinación hacia `toward` (el eje es arriba × la dirección).
      yaw.setFromAxisAngle(up, placement.yaw)
      lean.setFromAxisAngle(axis.set(placement.toward[1], 0, -placement.toward[0]).normalize(), placement.tilt)
      matrix.compose(position.set(...placement.p), lean.multiply(yaw), scale.setScalar(placement.scale))
      mesh.setMatrixAt(i, matrix)
      // El color de la instancia multiplica el de los vértices: solo varía el brillo.
      mesh.setColorAt(i, tint.setScalar(1 + placement.tint))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [invalidate, placements])

  if (count === 0) return null
  // El número de instancias es fijo al crear la malla: con otro número de piezas, se crea otra.
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={ROUGHNESS[piece]} envMap={finishEnvironment()} envMapIntensity={ENV_INTENSITY} side={DoubleSide} />
    </instancedMesh>
  )
}

/** La fruta de la tapa del último piso, en las coordenadas de ese piso (va dentro de su grupo). */
export default function Fruit({ layout }: { layout: FruitLayout }) {
  const groups = useMemo(() => {
    const byPiece = new Map<FruitPiece, FruitPlacement[]>()
    for (const placement of layout.placements) byPiece.set(placement.piece, [...(byPiece.get(placement.piece) ?? []), placement])
    return [...byPiece.entries()]
  }, [layout])
  return (
    <>
      {groups.map(([piece, placements]) => (
        <PieceMesh key={piece} piece={piece} placements={placements} />
      ))}
    </>
  )
}
