import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { CapsuleGeometry, Color, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry, Object3D, Vector3 } from 'three'
import type { BufferGeometry, InstancedMesh } from 'three'
import type { CakePieces } from './cakeShape.ts'
import { seededRandom } from './crumb.ts'
import { resolveColor } from './palette.ts'

/**
 * Los trozos del relleno de "Diseña tu pastel" (D50, D51): rebanadas o trozos de fruta, trozos de galleta o granillo,
 * como mallas instanciadas en el costado de la franja, en posiciones fijas por semilla para que no brinquen entre renders.
 */

type PieceSpec = {
  geometry: () => BufferGeometry
  density: number
  offset: number
  roughness: number
  spin: 'face' | 'any'
  /** Dónde caen los centros, como fracción del alto de la franja; sin ella, casi toda la franja. */
  band?: readonly [number, number]
  /** Cuánto varía la luminosidad de cada trozo (0 a 1) para que no sean todos del mismo tono; sin él, ninguna. */
  tint?: number
}

/**
 * Un trozo de fruta picada: un cubo de esquinas redondas (superelipsoide de exponente 4), más largo que alto y con
 * lomos suaves, de 80 caras con las normales calculadas a mano para que se vea liso. Todos los trozos comparten la
 * forma; el giro y el tamaño de cada uno los pone el azar con semilla.
 */
function fruitChunkGeometry(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 1)
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < position.count; i++) {
    const length = Math.hypot(position.getX(i), position.getY(i), position.getZ(i))
    const x = position.getX(i) / length
    const y = position.getY(i) / length
    const z = position.getZ(i) / length
    // El lomo depende de la dirección: los vértices repetidos de una arista quedan en el mismo lugar, sin grietas.
    const radius = (x ** 4 + y ** 4 + z ** 4) ** -0.25 * (1 + 0.12 * Math.sin(7.3 * x + 2.1 * y) * Math.cos(6.1 * z + 1.7 * x))
    position.setXYZ(i, x * radius, y * radius, z * radius)
    // Gradiente de |x|⁴ + |y|⁴ + |z|⁴: la normal del cubo redondeado antes de estirarlo.
    const n = new Vector3(x ** 3, y ** 3, z ** 3).normalize()
    normal.setXYZ(i, n.x, n.y, n.z)
  }
  return geometry.scale(0.08, 0.056, 0.066)
}

/** Por estilo: la forma de cada trozo, cuántos van por unidad de área, cuánto asoman y qué tan brillantes son. */
const PIECE_SPECS: Record<CakePieces['style'], PieceSpec> = {
  // Rebanadas de fruta: discos delgados casi a ras, de frente.
  fruit_slices: { geometry: () => new CylinderGeometry(0.07, 0.07, 0.016, 18).rotateX(Math.PI / 2), density: 34, offset: -0.004, roughness: 0.4, spin: 'face' },
  // Trozos de fruta: cubos redondeados y brillantes, hundidos a medias en el relleno, con tonos que varían.
  fruit_chunks: { geometry: fruitChunkGeometry, density: 55, offset: -0.012, roughness: 0.45, spin: 'any', band: [0.25, 0.75], tint: 0.2 },
  // Trozos de galleta: piezas irregulares que asoman.
  cookie_chunks: { geometry: () => new DodecahedronGeometry(0.036, 0), density: 85, offset: 0, roughness: 0.95, spin: 'any' },
  // Granillo: bastoncitos acostados sobre el costado.
  sprinkles: { geometry: () => new CapsuleGeometry(0.008, 0.032, 2, 6), density: 520, offset: 0.004, roughness: 0.55, spin: 'face' },
}
/**
 * Tope de instancias por franja, solo contra un relleno desmedido: el piso de abajo con granillo pide unas 815 (906
 * en rectangular) y no debe quedar más ralo que los de arriba. Cada instancia de granillo tiene unas 60 caras y cada
 * trozo de fruta, 80 (con unos 100 trozos por franja, 8 000 caras): el granillo manda en el presupuesto.
 */
const MAX_PIECES = 1000
const DEFAULT_BAND = [0.12, 0.88] as const

type PiecesProps = {
  pieces: CakePieces
  /** Radio del piso (redondo) o radio de referencia del rectángulo. */
  radius: number
  form: 'round' | 'rectangular'
  /** Medidas del rectángulo (mitad del ancho y del fondo), en rectangular. */
  halfWidth: number
  halfDepth: number
  /** Alto de la franja del relleno. */
  height: number
  /** Qué parte del costado: todo, o una mitad (0 o 1) con dos sabores. */
  half: 'whole' | 0 | 1
  seed: number
}

/** Lo que decide dónde cae un punto del costado. */
type SurfaceProps = Pick<PiecesProps, 'radius' | 'form' | 'halfWidth' | 'halfDepth' | 'half'>

/** Un punto del costado y su normal hacia afuera, al azar dentro de la mitad pedida. */
function surfacePoint(random: () => number, props: SurfaceProps): [number, number, number, number] {
  if (props.form === 'round') {
    // Como `CylinderGeometry`: x = sen(θ), z = cos(θ); la mitad 0 va de 0 a π y la 1 de π a 2π.
    const start = props.half === 'whole' ? 0 : props.half * Math.PI
    const length = props.half === 'whole' ? Math.PI * 2 : Math.PI
    const a = start + random() * length
    return [Math.sin(a), Math.cos(a), Math.sin(a), Math.cos(a)]
  }
  // Rectangular: un punto del perímetro; la mitad 0 es la de x negativa, como `rectSlab`.
  const { halfWidth: w, halfDepth: d } = props
  for (;;) {
    const t = random() * (4 * w + 4 * d)
    const [x, z, nx, nz] =
      t < 2 * w ? [-w + t, d, 0, 1] : t < 2 * w + 2 * d ? [w, d - (t - 2 * w), 1, 0] : t < 4 * w + 2 * d ? [w - (t - 2 * w - 2 * d), -d, 0, -1] : [-w, -d + (t - 4 * w - 2 * d), -1, 0]
    if (props.half === 'whole' || (props.half === 0 ? x <= 0 : x >= 0)) return [x, z, nx, nz]
  }
}

/** Los trozos de un relleno en el costado de su franja, con posiciones fijas por semilla. */
export default function FillingPieces(props: PiecesProps) {
  const { pieces, radius, form, halfWidth, halfDepth, height, half, seed } = props
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  const spec = PIECE_SPECS[pieces.style]
  const geometry = useMemo(() => spec.geometry(), [spec])
  useEffect(() => () => geometry.dispose(), [geometry])
  const colorKey = pieces.colors.map(resolveColor).join(',')
  const perimeter = form === 'round' ? 2 * Math.PI * radius : 4 * (halfWidth + halfDepth)
  const share = half === 'whole' ? 1 : 0.5
  const count = Math.min(MAX_PIECES, Math.max(1, Math.round(perimeter * share * height * spec.density)))

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const random = seededRandom(seed)
    const dummy = new Object3D()
    const target = new Vector3()
    const color = new Color()
    const palette = colorKey.split(',').map((hex) => new Color(hex))
    const pointProps = { radius, form, halfWidth, halfDepth, half }
    for (let i = 0; i < count; i++) {
      const [px, pz, nx, nz] = surfacePoint(random, pointProps)
      const scale = form === 'round' ? radius : 1
      const [low, high] = spec.band ?? DEFAULT_BAND
      const y = height * (low + random() * (high - low))
      dummy.position.set(px * scale + nx * spec.offset, y, pz * scale + nz * spec.offset)
      dummy.rotation.set(0, 0, 0)
      dummy.lookAt(target.set(dummy.position.x + nx, y, dummy.position.z + nz))
      if (spec.spin === 'face') dummy.rotateZ(random() * Math.PI * 2)
      else dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
      const size = 0.75 + random() * 0.5
      dummy.scale.set(size, size, size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const base = palette[Math.floor(random() * palette.length)] ?? palette[0]
      mesh.setColorAt(i, spec.tint ? color.copy(base).offsetHSL(0, 0, (random() - 0.65) * spec.tint) : base)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Con `frameloop="demand"` un cambio de color o de semilla no dibuja solo: se pide el cuadro.
    invalidate()
  }, [colorKey, count, form, half, halfDepth, halfWidth, height, invalidate, radius, seed, spec])

  // El número de instancias es fijo al crear la malla: con otro número de trozos, se crea otra.
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial roughness={spec.roughness} />
    </instancedMesh>
  )
}
