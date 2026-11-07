import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { CanvasTexture, DoubleSide, Object3D, RepeatWrapping, Shape, SRGBColorSpace, Vector2 } from 'three'
import type { Group, InstancedMesh } from 'three'
import type { CakeShape, CakeTier } from './cakeShape.ts'
import { brandColor } from './palette.ts'

/**
 * Modelo paramétrico del pastel, el mismo de la portada y de "Diseña tu pastel": dibuja un `CakeShape`
 * (`cakeShape.ts`). Las medidas van en unidades de escena: 1 unidad son 100 px del mockup (`Main.dc.html`).
 */

/** Lo que cambia en cada cuadro; la escena lo escribe y el modelo lo lee sin provocar renders. */
export type CakeMotion = {
  /** Separación de los pisos, de 0 (juntos) a 1. */
  separation: number
  /** Giro del pastel en radianes, para que la flama quede siempre de frente a la cámara. */
  yaw: number
}

/** Lo que sube cada piso por encima del de abajo con la separación completa (38 px en el mockup). */
const TIER_LIFT = 0.38
/** Holgura entre el plato y el primer piso (2 px en el mockup). */
const PLATE_GAP = 0.02
const EDGE = 0.06
const PEARL_RADIUS = 0.085
/** Una perla cada 22 px de contorno, como el prototipo. */
const PEARL_SPACING = 0.22
const CANDLE = { radius: 0.07, height: 0.54, gap: 0.06 }
/** La flama del logo mide 43 × 72 en su viewBox; en el mockup ocupa 27 px de alto. */
const FLAME_SCALE = 0.27 / 72

/** Perfil de un cilindro con los cantos redondeados, para girarlo con `LatheGeometry`. */
function roundedProfile(radius: number, height: number, edge: number, steps = 4) {
  const points = [new Vector2(0, 0)]
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2)
    points.push(new Vector2(radius - edge + edge * Math.cos(a), edge + edge * Math.sin(a)))
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2)
    points.push(new Vector2(radius - edge + edge * Math.cos(a), height - edge + edge * Math.sin(a)))
  }
  points.push(new Vector2(0, height))
  return points
}

type Cubic = [number, number, number, number, number, number]

/** Una figura a partir de las curvas del trazo SVG; la y se invierte porque en la escena crece hacia arriba. */
function shapeFromPath(start: [number, number], curves: Cubic[]) {
  const shape = new Shape()
  shape.moveTo(start[0] * FLAME_SCALE, -start[1] * FLAME_SCALE)
  for (const [x1, y1, x2, y2, x, y] of curves) {
    shape.bezierCurveTo(x1 * FLAME_SCALE, -y1 * FLAME_SCALE, x2 * FLAME_SCALE, -y2 * FLAME_SCALE, x * FLAME_SCALE, -y * FLAME_SCALE)
  }
  return shape
}

// El trazo de `design/referencia/flama.css` (la flama del logo): cuerpo y núcleo, con la base en el origen.
const FLAME_BODY: Cubic[] = [
  [-11, 0, -16.5, -7, -15.5, -16.5],
  [-21, -19.5, -21.5, -29, -14.5, -32.5],
  [-18.5, -37.5, -16.5, -45, -9.5, -47.5],
  [-6.5, -55, -1.5, -62.5, 5, -70],
  [4, -64, 7.5, -58, 12, -52],
  [17.5, -44, 19.5, -33, 17.5, -21],
  [16, -8, 9, 0, 0, 0],
]
const FLAME_CORE: Cubic[] = [
  [-4.5, -8.5, -6, -15, -3.5, -21.5],
  [-1.5, -26.5, 1.5, -30.5, 4, -35],
  [6, -29.5, 8, -23.5, 7.5, -17],
  [7, -11, 4.5, -8.5, 1.5, -8.5],
]

/** Textura de rayas diagonales de la vela, en `betun` y `fresa` como el prototipo. */
function candleStripes() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = brandColor('betun')
    context.fillRect(0, 0, 32, 32)
    context.fillStyle = brandColor('fresa')
    for (let x = -32; x < 64; x += 16) {
      context.beginPath()
      context.moveTo(x, 32)
      context.lineTo(x + 8, 32)
      context.lineTo(x + 40, 0)
      context.lineTo(x + 32, 0)
      context.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 2)
  return texture
}

function Pearls({ tier }: { tier: CakeTier }) {
  const ref = useRef<InstancedMesh>(null)
  const perRow = Math.round((2 * Math.PI * tier.radius) / PEARL_SPACING)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const ring = tier.radius + 0.03
    for (let i = 0; i < perRow * 2; i++) {
      const top = i < perRow
      // La fila de abajo va a medio paso de la de arriba, como en el mockup.
      const a = (((i % perRow) + (top ? 0 : 0.5)) / perRow) * Math.PI * 2
      dummy.position.set(Math.sin(a) * ring, top ? tier.height : 0.04, Math.cos(a) * ring)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [perRow, tier.height, tier.radius])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, perRow * 2]} frustumCulled={false}>
      <sphereGeometry args={[PEARL_RADIUS, 12, 8]} />
      <meshStandardMaterial color={brandColor('betun')} roughness={0.4} />
    </instancedMesh>
  )
}

function Tier({ tier, festoons }: { tier: CakeTier; festoons: boolean }) {
  const profile = useMemo(() => roundedProfile(tier.radius, tier.height, EDGE), [tier.height, tier.radius])
  return (
    <>
      <mesh>
        <latheGeometry args={[profile, 64]} />
        <meshStandardMaterial color={brandColor(tier.frosting)} roughness={0.8} />
      </mesh>
      {festoons && <Pearls tier={tier} />}
    </>
  )
}

/** Base de pastel (plato, columna y pie), con las medidas del mockup. */
function Stand() {
  const plate = useMemo(() => roundedProfile(1.96, 0.1, 0.03), [])
  const foot = useMemo(() => roundedProfile(0.74, 0.08, 0.03), [])
  return (
    <group>
      <mesh position-y={-0.1}>
        <latheGeometry args={[plate, 72]} />
        <meshStandardMaterial color={brandColor('betun')} roughness={0.35} />
      </mesh>
      <mesh position-y={-0.42}>
        <cylinderGeometry args={[0.26, 0.26, 0.64, 24]} />
        <meshStandardMaterial color={brandColor('betun')} roughness={0.35} />
      </mesh>
      <mesh position-y={-0.82}>
        <latheGeometry args={[foot, 48]} />
        <meshStandardMaterial color={brandColor('harina')} roughness={0.35} />
      </mesh>
    </group>
  )
}

function Candle({ motion, flicker }: { motion: RefObject<CakeMotion>; flicker: boolean }) {
  const flameRef = useRef<Group>(null)
  const facingRef = useRef<Group>(null)
  const stripes = useMemo(() => candleStripes(), [])
  const body = useMemo(() => shapeFromPath([0, 0], FLAME_BODY), [])
  const core = useMemo(() => shapeFromPath([1.5, -8.5], FLAME_CORE), [])
  useEffect(() => () => stripes.dispose(), [stripes])

  // Fase propia del titileo, sumada con el intervalo acotado: tras una pausa la flama sigue donde iba, sin brincar.
  const phase = useRef(0)

  useFrame((_, delta) => {
    // La flama es plana: se gira al revés que el pastel para quedar de frente, como en el prototipo.
    if (facingRef.current) facingRef.current.rotation.y = -motion.current.yaw
    const flame = flameRef.current
    if (!flame) return
    if (!flicker) {
      flame.scale.set(1, 1, 1)
      flame.rotation.z = 0
      return
    }
    // El titileo de `flama.css`: 1.4 s de ida y otros tantos de vuelta, de (1, 1, -2°) a (0.92, 1.1, 3°).
    phase.current += Math.min(delta, 0.05)
    const t = (1 - Math.cos((phase.current * Math.PI) / 1.4)) / 2
    flame.scale.set(1 - 0.08 * t, 1 + 0.1 * t, 1)
    flame.rotation.z = -((-2 + 5 * t) * Math.PI) / 180
  })

  return (
    <group>
      <mesh position-y={CANDLE.height / 2}>
        <cylinderGeometry args={[CANDLE.radius, CANDLE.radius, CANDLE.height, 20]} />
        <meshStandardMaterial map={stripes} roughness={0.6} />
      </mesh>
      <group ref={facingRef} position-y={CANDLE.height + CANDLE.gap}>
        <group ref={flameRef}>
          <mesh>
            <shapeGeometry args={[body, 16]} />
            <meshBasicMaterial color={brandColor('frambuesa')} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh position-z={0.002}>
            <shapeGeometry args={[core, 12]} />
            <meshBasicMaterial color={brandColor('fresa')} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

type CakeModelProps = {
  shape: CakeShape
  motion: RefObject<CakeMotion>
  /** Titileo de la flama; se apaga con "reducir movimiento". */
  flicker: boolean
}

/** El pastel con el plato a la altura 0. La escena lo gira, lo inclina y lo encuadra. */
export default function CakeModel({ shape, motion, flicker }: CakeModelProps) {
  const tierRefs = useRef<(Group | null)[]>([])
  const candleRef = useRef<Group>(null)
  // Cada piso descansa sobre la suma de los de abajo.
  const bases = useMemo(
    () => shape.tiers.map((_, i) => shape.tiers.slice(0, i).reduce((sum, tier) => sum + tier.height, PLATE_GAP)),
    [shape.tiers],
  )
  const top = bases.length ? bases[bases.length - 1] + shape.tiers[shape.tiers.length - 1].height : PLATE_GAP

  useFrame(() => {
    const lift = motion.current.separation * TIER_LIFT
    tierRefs.current.forEach((group, i) => {
      if (group) group.position.y = bases[i] + i * lift
    })
    if (candleRef.current) candleRef.current.position.y = top + (bases.length - 1) * lift
  })

  return (
    <group>
      {shape.stand && <Stand />}
      {shape.tiers.map((tier, i) => (
        <group
          key={i}
          ref={(group) => {
            tierRefs.current[i] = group
          }}
          position-y={bases[i]}
        >
          <Tier tier={tier} festoons={shape.festoons} />
        </group>
      ))}
      {shape.candle && (
        <group ref={candleRef} position-y={top}>
          <Candle motion={motion} flicker={flicker} />
        </group>
      )}
    </group>
  )
}
