import { BufferAttribute, BufferGeometry, Vector2 } from 'three'
import type { CakeComb } from './cakeShape.ts'
import { rectShape } from './creamSpread.ts'
import type { OutlinePoint } from './creamSpread.ts'

/**
 * El peinado lateral de la cobertura (tanda 4): surcos horizontales y parejos en los costados de cada piso, como los deja un peine
 * de pastelería. El usuario los describió como "ranuras horizontales paralelas en los costados, como surcos de tractor".
 *
 * Es geometría, no una textura: la luz marca cada surco y la silueta los muestra, en redondo y en rectangular. Se arma una vez por
 * medida, nada por cuadro. Los surcos se hunden hacia adentro y quedan entre los dos cantos, así que el radio, el alto, la tapa, el
 * mensaje y la decoración no se mueven. Sin React; three solo para armar la malla.
 */

/** Puntos del perfil por surco: bastan para que la curva se vea redonda a la distancia de la cámara. */
const SAMPLES_PER_GROOVE = 6
/** Segmentos de cada esquina redondeada de la losa, los mismos que usa su extrusión (`CakeModel.tsx`): las orillas calzan. */
export const SLAB_CORNER_SEGMENTS = 6

/** Un canto redondeado de un cuarto de vuelta con centro en (`cx`, `cy`), de `from` a `from + 90°`. */
function arc(cx: number, cy: number, edge: number, from: number, steps: number): Vector2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + (i / steps) * (Math.PI / 2)
    return new Vector2(cx + edge * Math.cos(a), cy + edge * Math.sin(a))
  })
}

/** Perfil de un cilindro con los cantos redondeados, para girarlo con `LatheGeometry`: del eje al pie, el costado y la tapa. */
export function roundedProfile(radius: number, height: number, edge: number, steps = 4): Vector2[] {
  return [
    new Vector2(0, 0),
    ...arc(radius - edge, edge, edge, -Math.PI / 2, steps),
    ...arc(radius - edge, height - edge, edge, 0, steps),
    new Vector2(0, height),
  ]
}

/**
 * Cuántos surcos caben en el costado: entre los dos cantos, sin acercarse a ninguno a menos de medio surco, para que el borde de
 * conchas y los rosetones sigan apoyándose en una orilla lisa.
 */
export function grooveCount(height: number, edge: number, comb: CakeComb): number {
  if (!(comb.pitch > 0) || !(comb.depth > 0)) return 0
  return Math.max(0, Math.floor((height - 2 * edge - comb.pitch) / comb.pitch))
}

/**
 * Lo que se hunde el costado en cada altura del peinado, de abajo hacia arriba: `y` y lo que entra (de 0 al hondo del peine). Los
 * surcos son una onda de coseno: empiezan y acaban en 0 con pendiente 0, así que el costado liso sigue sin quiebre. Vacío si no
 * cabe ninguno.
 */
export function combSamples(height: number, edge: number, comb: CakeComb): { y: number; inset: number }[] {
  const count = grooveCount(height, edge, comb)
  if (count === 0) return []
  // Centrados en el costado: el mismo espacio libre arriba y abajo.
  const start = (height - count * comb.pitch) / 2
  const total = count * SAMPLES_PER_GROOVE
  return Array.from({ length: total + 1 }, (_, i) => ({
    y: start + (i / SAMPLES_PER_GROOVE) * comb.pitch,
    inset: comb.depth * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SAMPLES_PER_GROOVE)),
  }))
}

/** El perfil de un piso redondo peinado: el de `roundedProfile` con los surcos en el costado, entre los dos cantos. */
export function combedProfile(radius: number, height: number, edge: number, comb: CakeComb, steps = 4): Vector2[] {
  const smooth = roundedProfile(radius, height, edge, steps)
  const grooves = combSamples(height, edge, comb).map(({ y, inset }) => new Vector2(radius - inset, y))
  if (grooves.length === 0) return smooth
  // Eje y canto de abajo, los surcos, canto de arriba y eje.
  const half = steps + 2
  return [...smooth.slice(0, half), ...grooves, ...smooth.slice(half)]
}

/**
 * El contorno de la losa rectangular con los mismos puntos de su extrusión: un punto en cada extremo de los lados rectos y
 * `SLAB_CORNER_SEGMENTS` por esquina, sin columnas de más en las caras largas. La normal sale de la tangente de cada tramo; las
 * esquinas son tangentes a los lados, así que la normal no brinca entre ellos. La losa se gira para crecer hacia arriba: la `y`
 * de `Shape` queda como `-z` de la escena.
 */
export function slabOutline(halfW: number, halfD: number): OutlinePoint[] {
  const points: OutlinePoint[] = []
  for (const curve of rectShape(halfW, halfD, 'whole').curves) {
    const straight = 'isLineCurve' in curve && curve.isLineCurve === true
    const steps = straight ? 1 : SLAB_CORNER_SEGMENTS
    // Sin el último punto de cada tramo: es el primero del siguiente.
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const point = curve.getPoint(t)
      const tangent = curve.getTangent(t)
      let [nx, nz] = [tangent.y, tangent.x]
      // Hacia afuera: el contorno es convexo y centrado.
      if (nx * point.x + nz * -point.y < 0) [nx, nz] = [-nx, -nz]
      points.push({ x: point.x, z: -point.y, nx, nz })
    }
  }
  return points
}

/**
 * El costado peinado de un piso rectangular, de `y = 0` a `height`: el contorno de la losa recorrido a cada altura del perfil,
 * hundido hacia adentro en los surcos. Sin tapas: las pone la losa, con el mismo contorno. Las normales salen del perfil, no de
 * promediar caras: las caras largas quedan con la normal de su lado.
 */
export function combedSide(outline: readonly OutlinePoint[], height: number, comb: CakeComb): BufferGeometry {
  const samples = [{ y: 0, inset: 0 }, ...combSamples(height, 0, comb), { y: height, inset: 0 }]
  // La pendiente del hundimiento en cada altura, para inclinar la normal hacia arriba o hacia abajo en el surco.
  const slope = samples.map((_, j) => {
    const before = samples[Math.max(0, j - 1)]
    const after = samples[Math.min(samples.length - 1, j + 1)]
    return after.y === before.y ? 0 : (after.inset - before.inset) / (after.y - before.y)
  })
  const rings = samples.length
  const columns = outline.length + 1
  const positions = new Float32Array(columns * rings * 3)
  const normals = new Float32Array(columns * rings * 3)
  for (let i = 0; i < columns; i++) {
    const point = outline[i % outline.length]
    for (let j = 0; j < rings; j++) {
      const { y, inset } = samples[j]
      const at = (i * rings + j) * 3
      positions.set([point.x - point.nx * inset, y, point.z - point.nz * inset], at)
      const length = Math.hypot(1, slope[j])
      normals.set([point.nx / length, slope[j] / length, point.nz / length], at)
    }
  }
  const indices: number[] = []
  for (let i = 0; i < columns - 1; i++) {
    for (let j = 0; j < rings - 1; j++) {
      const [a, b] = [i * rings + j, (i + 1) * rings + j]
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  // El sentido de las caras depende del sentido del contorno: si la primera mira hacia adentro, se voltean todas.
  const [first, next] = [outline[0], outline[1]]
  const facing = (next.x - first.x) * first.nz - (next.z - first.z) * first.nx
  if (facing < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]]
  }
  geometry.setIndex(indices)
  return geometry
}
