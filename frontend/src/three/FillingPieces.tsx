import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CapsuleGeometry, Color, CylinderGeometry, DodecahedronGeometry, Object3D, Vector3 } from 'three'
import type { BufferGeometry, InstancedMesh } from 'three'
import type { CakePieces } from './cakeShape.ts'
import { seededRandom } from './crumb.ts'
import { resolveColor } from './palette.ts'

/**
 * Los trozos del relleno de "Diseña tu pastel" (D50): rebanadas de fruta, trozos de galleta o granillo, como mallas
 * instanciadas en el costado de la franja, en posiciones fijas por semilla para que no brinquen entre renders.
 */

type PieceSpec = { geometry: () => BufferGeometry; density: number; offset: number; roughness: number; spin: 'face' | 'any' }

/** Por estilo: la forma de cada trozo, cuántos van por unidad de área, cuánto asoman y qué tan brillantes son. */
const PIECE_SPECS: Record<CakePieces['style'], PieceSpec> = {
  // Rebanadas de fruta: discos delgados casi a ras, de frente.
  fruit_slices: { geometry: () => new CylinderGeometry(0.07, 0.07, 0.016, 18).rotateX(Math.PI / 2), density: 34, offset: -0.004, roughness: 0.4, spin: 'face' },
  // Trozos de galleta: piezas irregulares que asoman.
  cookie_chunks: { geometry: () => new DodecahedronGeometry(0.036, 0), density: 85, offset: 0, roughness: 0.95, spin: 'any' },
  // Granillo: bastoncitos acostados sobre el costado.
  sprinkles: { geometry: () => new CapsuleGeometry(0.008, 0.032, 2, 6), density: 520, offset: 0.004, roughness: 0.55, spin: 'face' },
}
const MAX_PIECES = 700

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

/** Un punto del costado y su normal hacia afuera, al azar dentro de la mitad pedida. */
function surfacePoint(random: () => number, props: PiecesProps): [number, number, number, number] {
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
    const palette = colorKey.split(',').map((hex) => new Color(hex))
    const pointProps = { pieces, radius, form, halfWidth, halfDepth, height, half, seed }
    for (let i = 0; i < count; i++) {
      const [px, pz, nx, nz] = surfacePoint(random, pointProps)
      const scale = form === 'round' ? radius : 1
      const y = height * (0.12 + random() * 0.76)
      dummy.position.set(px * scale + nx * spec.offset, y, pz * scale + nz * spec.offset)
      dummy.rotation.set(0, 0, 0)
      dummy.lookAt(target.set(dummy.position.x + nx, y, dummy.position.z + nz))
      if (spec.spin === 'face') dummy.rotateZ(random() * Math.PI * 2)
      else dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
      const size = 0.75 + random() * 0.5
      dummy.scale.set(size, size, size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, palette[Math.floor(random() * palette.length)] ?? palette[0])
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [colorKey, count, form, half, halfDepth, halfWidth, height, pieces, radius, seed, spec])

  // El número de instancias es fijo al crear la malla: con otro número de trozos, se crea otra.
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial roughness={spec.roughness} />
    </instancedMesh>
  )
}
