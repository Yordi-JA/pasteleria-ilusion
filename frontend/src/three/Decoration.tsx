import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, CapsuleGeometry, Color, DoubleSide, Float32BufferAttribute, Object3D, SphereGeometry, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { CakeTier } from './cakeShape.ts'
import { BAND_ROWS, perimeterOf } from './decorationLayout.ts'
import type { DecorationPart, PartShape, RuffleBand, TierDecoration } from './decorationLayout.ts'
import { resolveColor } from './palette.ts'

/**
 * Dibuja la decoración del paso 6 de un piso (D53), lo que `decorationLayout.ts` colocó: mallas instanciadas (una por
 * tipo de pieza, con el color de cada instancia) y, para los olanes, una cinta por fila. Sin trabajo por cuadro: la
 * escena usa `frameloop="demand"` y las posiciones están fijas por semilla. Las geometrías se liberan al desmontar; los
 * materiales, que son de JSX, los libera r3f. Los triángulos de cada geometría deben coincidir con `PART_FACES`.
 */

type Form = 'round' | 'rectangular'

/** Una esfera de `columns` por `rows` segmentos (2 · columnas · (filas − 1) triángulos), con su escala por eje. */
const ellipsoid = (radius: number, columns: number, rows: number, scale: [number, number, number] = [1, 1, 1]) =>
  new SphereGeometry(radius, columns, rows).scale(...scale)

/**
 * La concha de duya estrella: una esfera de 14 por 6 segmentos con los polos sobre el eje z (cabeza adelante, cola
 * atrás), más larga que ancha, con la cola adelgazada y siete costillas que van de la cabeza a la cola.
 */
function shellGeometry(): BufferGeometry {
  const geometry = new SphereGeometry(1, 14, 6).rotateX(Math.PI / 2)
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const angle = Math.atan2(y, x)
    const ridge = 1 + 0.14 * Math.cos(7 * angle) * Math.sqrt(Math.max(0, 1 - z * z))
    const taper = z < 0 ? 1 + z * 0.55 : 1
    position.setXYZ(i, x * ridge * taper * 0.075, y * ridge * taper * 0.05, z * 0.1)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Una roseta: un montículo de 24 por 6 cuadros cuyas costillas giran al subir, como el espiral de la duya. */
function rosetteGeometry(): BufferGeometry {
  const columns = 24
  const rings = 6
  const radius = 0.1
  const height = 0.075
  const positions: number[] = []
  for (let j = 0; j <= rings; j++) {
    const t = j / rings
    for (let i = 0; i < columns; i++) {
      const angle = (i / columns) * Math.PI * 2
      const lobe = 1 + 0.1 * Math.cos(6 * angle + 8 * t)
      const r = radius * (1 - t ** 1.6) * lobe
      positions.push(Math.sin(angle) * r, height * Math.sin((t * Math.PI) / 2) ** 0.8, Math.cos(angle) * r)
    }
  }
  const indices: number[] = []
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * columns + i
      const b = j * columns + ((i + 1) % columns)
      const c = (j + 1) * columns + i
      const d = (j + 1) * columns + ((i + 1) % columns)
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Por tipo de pieza: su geometría, qué tan brillante es y si se ve por las dos caras. */
const PARTS: Record<PartShape, { geometry: () => BufferGeometry; roughness: number; double?: boolean }> = {
  shell: { geometry: shellGeometry, roughness: 0.55 },
  rosette: { geometry: rosetteGeometry, roughness: 0.55, double: true },
  bead: { geometry: () => ellipsoid(0.04, 8, 5), roughness: 0.5 },
  pearl: { geometry: () => ellipsoid(0.055, 10, 6), roughness: 0.35 },
  // Rosa de duya: pétalos de 8 por 4 segmentos (anchos, altos y delgados: la delgada es la que mira hacia afuera) y un botón.
  rosePetal: { geometry: () => ellipsoid(0.05, 8, 4, [1, 0.9, 0.38]), roughness: 0.5 },
  roseBud: { geometry: () => ellipsoid(0.04, 8, 5, [1, 1.4, 1]), roughness: 0.5 },
  leaf: { geometry: () => ellipsoid(0.075, 8, 5, [0.55, 0.16, 1.3]), roughness: 0.7 },
  // El granillo es la misma cápsula del relleno (`FillingPieces`).
  sprinkle: { geometry: () => new CapsuleGeometry(0.008, 0.032, 2, 6), roughness: 0.55 },
  // Chispa redonda de chocolate: la esfera aplastada de `FillingPieces`.
  chip: { geometry: () => new SphereGeometry(0.032, 8, 6).scale(1, 1, 0.55), roughness: 0.4 },
}

function PartMesh({ part }: { part: DecorationPart }) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  const spec = PARTS[part.shape]
  const geometry = useMemo(() => spec.geometry(), [spec])
  useEffect(() => () => geometry.dispose(), [geometry])
  const colorKey = part.colors.map(resolveColor).join(',')
  const count = part.placements.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const target = new Vector3()
    const palette = colorKey.split(',').map((hex) => new Color(hex))
    const color = new Color()
    part.placements.forEach((placement, i) => {
      const [x, y, z] = placement.p
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, 0, 0)
      dummy.lookAt(target.set(x + placement.dir[0], y + placement.dir[1], z + placement.dir[2]))
      dummy.rotateZ(placement.roll)
      dummy.scale.set(...placement.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.copy(palette[placement.color % palette.length] ?? palette[0])
      // El brillo varía multiplicando el color: sumarlo a la luminosidad (HSL) dejaba casi negro un verde oscuro.
      mesh.setColorAt(i, placement.tint ? color.multiplyScalar(1 + placement.tint * 2) : color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Con `frameloop="demand"` un cambio de color o de lugar no dibuja solo: se pide el cuadro.
    invalidate()
  }, [colorKey, invalidate, part.placements])

  if (count === 0) return null
  // El número de instancias es fijo al crear la malla: con otro número de piezas, se crea otra.
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial roughness={spec.roughness} side={spec.double ? DoubleSide : undefined} />
    </instancedMesh>
  )
}

/**
 * Una fila de olán: una cinta pegada al costado en `yTop` que cuelga `width`. Sus pliegues salen y entran del costado
 * (`waves` por vuelta) y el borde de abajo se alarga en cada cresta, como un volante de crema.
 */
function ruffleGeometry(tier: Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth'>, form: Form, band: RuffleBand): BufferGeometry {
  const perimeter = perimeterOf(tier, form)
  const { samples, waves } = band
  const positions: number[] = []
  for (let i = 0; i < samples; i++) {
    const at = perimeter.at((i / samples) * perimeter.length)
    const phase = (i / samples) * waves * Math.PI * 2
    const tx = at.nz
    const tz = -at.nx
    for (let j = 0; j <= BAND_ROWS; j++) {
      const v = j / BAND_ROWS
      const out = 0.012 + v * (0.05 + 0.05 * Math.sin(phase))
      const slide = v * 0.025 * Math.cos(phase)
      const drop = v * band.width * (1 + 0.12 * Math.sin(phase + 0.8))
      positions.push(at.x + at.nx * out + tx * slide, band.yTop - drop, at.z + at.nz * out + tz * slide)
    }
  }
  const indices: number[] = []
  const stride = BAND_ROWS + 1
  for (let i = 0; i < samples; i++) {
    const next = (i + 1) % samples
    for (let j = 0; j < BAND_ROWS; j++) {
      const a = i * stride + j
      const b = next * stride + j
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RuffleBandMesh({ tier, form, band }: { tier: CakeTier; form: Form; band: RuffleBand }) {
  // Se arma con las medidas del piso, no con su objeto: un precio nuevo arma otro `CakeShape` y no cambia la cinta.
  const { radius, halfWidth, halfDepth } = tier
  const geometry = useMemo(() => ruffleGeometry({ radius, halfWidth, halfDepth }, form, band), [band, form, halfDepth, halfWidth, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={resolveColor(band.color)} roughness={0.6} side={DoubleSide} />
    </mesh>
  )
}

/** La decoración de un piso, en las coordenadas de ese piso (va dentro de su grupo). */
export default function Decoration({ layout, tier, form }: { layout: TierDecoration; tier: CakeTier; form: Form }) {
  return (
    <>
      {layout.parts.map((part) => (
        <PartMesh key={part.shape} part={part} />
      ))}
      {layout.bands.map((band, i) => (
        <RuffleBandMesh key={i} tier={tier} form={form} band={band} />
      ))}
    </>
  )
}
