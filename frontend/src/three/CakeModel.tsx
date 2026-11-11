import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { CanvasTexture, Color, DoubleSide, ExtrudeGeometry, Object3D, RepeatWrapping, Shape, SRGBColorSpace, Vector2 } from 'three'
import type { Group, InstancedMesh, MeshStandardMaterial, Texture } from 'three'
import type { CakeLayer, CakeShape, CakeTier } from './cakeShape.ts'
import { CRUMB_TILE, useCrumbTexture } from './crumb.ts'
import FillingPieces from './FillingPieces.tsx'
import { halfExtents, PLATE_GAP, standScale } from './cakeMetrics.ts'
import Decoration from './Decoration.tsx'
import { tierDecoration } from './decorationLayout.ts'
import type { TierDecoration } from './decorationLayout.ts'
import { pieceDensityScale } from './pieceBudget.ts'
import type { ShapeColor } from './cakeShape.ts'
import { brandColor, resolveColor } from './palette.ts'

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
/** Lo que tarda un piso en pasar de su tamaño anterior al nuevo cuando cambian los kilos. */
const SIZE_TRANSITION_S = 0.3
const EDGE = 0.06
const PEARL_RADIUS = 0.085
/** Una perla cada 22 px de contorno, como el prototipo. */
const PEARL_SPACING = 0.22
/** Tope de perlas por fila (por lado en rectangular: la cuarta parte): un piso de muchos kilos no pide miles de instancias. */
const MAX_PEARLS_PER_ROW = 300
/** Esquinas redondeadas del molde rectangular. */
const RECT_CORNER = 0.08
/** Cambio de color de una capa o de la cobertura (libro de marca, "Cotizador 3D"). */
const COLOR_TRANSITION_S = 0.3
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

type Form = NonNullable<CakeShape['form']>

/** Puntos de una fila de perlas alrededor del piso, a `offset` pasos del inicio (la de abajo va a medio paso). */
function pearlRow(tier: Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth'>, form: Form, y: number, offset: number): [number, number, number][] {
  if (form === 'round') {
    const ring = tier.radius + 0.03
    const count = Math.min(MAX_PEARLS_PER_ROW, Math.round((2 * Math.PI * tier.radius) / PEARL_SPACING))
    return Array.from({ length: count }, (_, i) => {
      const a = ((i + offset) / count) * Math.PI * 2
      return [Math.sin(a) * ring, y, Math.cos(a) * ring]
    })
  }
  // Rectangular: una fila por lado, repartida a lo largo de cada uno, como el prototipo.
  const extents = halfExtents(tier, form)
  const halfW = extents.x + 0.03
  const halfD = extents.z + 0.03
  const sides: [number, number, number, number][] = [
    [-halfW, halfD, halfW, halfD],
    [halfW, halfD, halfW, -halfD],
    [halfW, -halfD, -halfW, -halfD],
    [-halfW, -halfD, -halfW, halfD],
  ]
  return sides.flatMap(([x0, z0, x1, z1]) => {
    const count = Math.min(MAX_PEARLS_PER_ROW / 4, Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / PEARL_SPACING)))
    return Array.from({ length: count }, (_, i): [number, number, number] => {
      const t = (i + 0.5) / count
      return [x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t]
    })
  })
}

function Pearls({ tier, form, top }: { tier: CakeTier; form: Form; top: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  // La fila de abajo va a medio paso de la de arriba, como en el mockup.
  const { radius, halfWidth, halfDepth, height } = tier
  const points = useMemo(
    () => [...(top ? pearlRow({ radius, halfWidth, halfDepth }, form, height, 0) : []), ...pearlRow({ radius, halfWidth, halfDepth }, form, 0.04, 0.5)],
    [form, halfDepth, halfWidth, height, radius, top],
  )
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    points.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [points])
  // El número de instancias es fijo al crear la malla: con otro número de perlas, se crea otra.
  return (
    <instancedMesh key={points.length} ref={ref} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <sphereGeometry args={[PEARL_RADIUS, 12, 8]} />
      <meshStandardMaterial color={brandColor('betun')} roughness={0.4} />
    </instancedMesh>
  )
}

/**
 * Material de un color que puede cambiar (pan, relleno, cobertura). El cambio dura 300 ms; con "reducir movimiento"
 * (`animate` en falso) es inmediato. Mientras dura, pide cuadros a la escena, que usa `frameloop="demand"`.
 */
type FoodMaterialProps = {
  /** Con una malla de varios materiales (el cilindro: costado, tapa de arriba y de abajo), cuál le toca. */
  attach?: string
  color: ShapeColor
  roughness: number
  animate: boolean
  /** La miga del pan (color y relieve); el color del pan la tiñe. */
  crumb?: Texture | null
}

function FoodMaterial({ attach, color, roughness, animate, crumb = null }: FoodMaterialProps) {
  const material = useRef<MeshStandardMaterial>(null)
  const invalidate = useThree((state) => state.invalidate)
  const transition = useRef<{ from: Color; to: Color; elapsed: number } | null>(null)
  // Se compara por el hexadecimal: una mezcla igual armada de nuevo no reinicia la transición.
  const hex = resolveColor(color)
  // El color con que nace el material; los cambios siguientes los aplica el efecto, con o sin transición.
  const [initial] = useState(hex)
  useEffect(() => {
    const target = material.current
    if (!target) return
    const to = new Color(hex)
    if (!animate || target.color.equals(to)) {
      transition.current = null
      target.color.copy(to)
    } else {
      transition.current = { from: target.color.clone(), to, elapsed: 0 }
    }
    invalidate()
  }, [animate, hex, invalidate])
  // Con o sin miga es otro programa de sombreado: el material se recompila cuando cambia.
  useEffect(() => {
    if (material.current) material.current.needsUpdate = true
    invalidate()
  }, [crumb, invalidate])
  useFrame((_, delta) => {
    const step = transition.current
    const target = material.current
    if (!step || !target) return
    step.elapsed = Math.min(COLOR_TRANSITION_S, step.elapsed + Math.min(delta, 0.05))
    const t = step.elapsed / COLOR_TRANSITION_S
    target.color.copy(step.from).lerp(step.to, 1 - (1 - t) ** 3)
    if (t < 1) invalidate()
    else transition.current = null
  })
  return (
    <meshStandardMaterial
      attach={attach}
      ref={material}
      color={initial}
      roughness={roughness}
      map={crumb}
      bumpMap={crumb}
      bumpScale={crumb ? 1.4 : 1}
    />
  )
}

type Split = 'whole' | 'left' | 'right'

/** Losa rectangular con las esquinas de afuera redondeadas; `split` dice qué mitad (o toda). */
function rectSlab(halfW: number, halfD: number, height: number, split: Split) {
  const x0 = split === 'right' ? 0 : -halfW
  const x1 = split === 'left' ? 0 : halfW
  const left = split === 'right' ? 0 : RECT_CORNER
  const right = split === 'left' ? 0 : RECT_CORNER
  const shape = new Shape()
  shape.moveTo(x0 + left, -halfD)
  shape.lineTo(x1 - right, -halfD)
  shape.quadraticCurveTo(x1, -halfD, x1, -halfD + right)
  shape.lineTo(x1, halfD - right)
  shape.quadraticCurveTo(x1, halfD, x1 - right, halfD)
  shape.lineTo(x0 + left, halfD)
  shape.quadraticCurveTo(x0, halfD, x0, halfD - left)
  shape.lineTo(x0, -halfD + left)
  shape.quadraticCurveTo(x0, -halfD, x0 + left, -halfD)
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 6 })
  // La extrusión sale a lo largo de z: se gira para que la losa crezca hacia arriba.
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function RectSlab({ tier, height, split }: { tier: CakeTier; height: number; split: Split }) {
  const { x, z } = halfExtents(tier, 'rectangular')
  const geometry = useMemo(() => rectSlab(x, z, height, split), [height, split, x, z])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <primitive object={geometry} attach="geometry" />
}

type LayerProps = { tier: CakeTier; form: Form; layer: CakeLayer; bottom: number; animate: boolean; seed: number; densityScale: number }

/** Una mitad (o toda) la capa: su forma, su material y, si el relleno los lleva, sus trozos. */
function LayerPart({ tier, form, layer, index, height, animate, seed, densityScale }: Omit<LayerProps, 'bottom'> & { index: number; height: number }) {
  const halves = layer.colors.length === 2
  const color = layer.colors[index] ?? layer.colors[0]
  const pieces = layer.pieces?.[index] ?? null
  // La miga se repite cada `CRUMB_TILE`: en redondo, el ancho de la textura es el arco de la pieza; en rectangular, la
  // extrusión ya usa coordenadas de escena.
  const arc = (halves ? Math.PI : Math.PI * 2) * tier.radius
  const crumb = useCrumbTexture(
    Boolean(layer.crumb),
    form === 'round' ? Math.max(1, Math.round(arc / CRUMB_TILE)) : 1 / CRUMB_TILE,
    form === 'round' ? Math.max(height / CRUMB_TILE, 0.05) : 1 / CRUMB_TILE,
  )
  // Las tapas del cilindro (que ahora se ven desde arriba) reparten la textura por el diámetro, no como el costado.
  const capRepeat = (2 * tier.radius) / CRUMB_TILE
  const cap = useCrumbTexture(Boolean(layer.crumb) && form === 'round', capRepeat, capRepeat)
  const roughness = layer.crumb ? 0.95 : 0.85
  return (
    <>
      <mesh position-y={form === 'round' ? height / 2 : 0}>
        {form === 'round' ? (
          <cylinderGeometry
            args={[tier.radius, tier.radius, height, 64, 1, false, halves ? index * Math.PI : 0, halves ? Math.PI : Math.PI * 2]}
          />
        ) : (
          <RectSlab tier={tier} height={height} split={halves ? (index === 0 ? 'left' : 'right') : 'whole'} />
        )}
        {form === 'round' && crumb ? (
          <>
            <FoodMaterial attach="material-0" color={color} roughness={roughness} animate={animate} crumb={crumb} />
            <FoodMaterial attach="material-1" color={color} roughness={roughness} animate={animate} crumb={cap} />
            <FoodMaterial attach="material-2" color={color} roughness={roughness} animate={animate} crumb={cap} />
          </>
        ) : (
          <FoodMaterial color={color} roughness={roughness} animate={animate} crumb={crumb} />
        )}
      </mesh>
      {pieces && (
        <FillingPieces
          pieces={pieces}
          radius={tier.radius}
          form={form}
          halfWidth={halfExtents(tier, form).x}
          halfDepth={halfExtents(tier, form).z}
          height={height}
          half={halves ? (index as 0 | 1) : 'whole'}
          seed={seed * 2 + index}
          densityScale={densityScale}
        />
      )}
    </>
  )
}

/** Una capa del costado: un cilindro (o dos medios) en redondo, una losa (o dos mitades) en rectangular. */
function Layer({ tier, form, layer, bottom, animate, seed, densityScale }: LayerProps) {
  const height = layer.height * tier.height
  return (
    <group position-y={bottom}>
      {layer.colors.map((_, i) => (
        <LayerPart key={i} tier={tier} form={form} layer={layer} index={i} height={height} animate={animate} seed={seed} densityScale={densityScale} />
      ))}
    </group>
  )
}

type TierProps = { tier: CakeTier; festoons: CakeShape['festoons']; form: Form; animate: boolean; index: number; densityScale: number; decoration: TierDecoration }

function Tier({ tier, festoons, form, animate, index, densityScale, decoration }: TierProps) {
  const profile = useMemo(() => roundedProfile(tier.radius, tier.height, EDGE), [tier.height, tier.radius])
  const layers = tier.frosting ? [] : (tier.layers ?? [])
  const bottoms = layers.map((_, i) => layers.slice(0, i).reduce((sum, layer) => sum + layer.height * tier.height, 0))
  return (
    <>
      {tier.frosting && (
        <mesh>
          {form === 'round' ? <latheGeometry args={[profile, 64]} /> : <RectSlab tier={tier} height={tier.height} split="whole" />}
          <FoodMaterial color={tier.frosting} roughness={0.8} animate={animate} />
        </mesh>
      )}
      {layers.map((layer, i) => (
        <Layer key={i} tier={tier} form={form} layer={layer} bottom={bottoms[i]} animate={animate} seed={index * 101 + i * 13 + 7} densityScale={densityScale} />
      ))}
      {festoons && <Pearls tier={tier} form={form} top={festoons === true} />}
      <Decoration layout={decoration} tier={tier} form={form} />
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
  /** Transición de 300 ms al cambiar un color; se apaga con "reducir movimiento". */
  animateColors?: boolean
  /** Transición de 300 ms al cambiar el tamaño de un piso (los kilos); se apaga con "reducir movimiento". */
  animateSize?: boolean
}

/**
 * La transición de tamaño: de dónde parte cada piso (su tamaño de ahora entre el nuevo, en x y en z; la malla ya tiene el
 * tamaño nuevo) y la escala del plato de la que parte (llega a la nueva).
 */
type SizeTransition = { tiers: [number, number][]; standFrom: number; elapsed: number }

/** Una clave con las medidas de los pisos y del plato: cambia solo si cambia el tamaño, no con cualquier objeto nuevo. */
function sizeKey(form: Form, extents: { x: number; z: number }[], plate: number) {
  return [form, plate.toFixed(4), ...extents.map((e) => `${e.x.toFixed(4)}x${e.z.toFixed(4)}`)].join('|')
}

/**
 * Un valor que se vuelve a calcular solo cuando cambia su clave. `useMemo` lo haría con las dependencias que lee la
 * función; aquí la clave es lo único que importa, y el `CakeShape` nuevo de cada respuesta de precio no debe recolocar
 * las piezas (D51: un objeto nuevo en cada render recalculaba todas las instancias).
 */
function useKeyed<T>(key: string, compute: () => T): T {
  const [cache, setCache] = useState(() => ({ key, value: compute() }))
  if (cache.key === key) return cache.value
  // Se actualiza durante el render, como pide React para un valor derivado de otro: sin efecto ni segundo dibujo.
  const next = { key, value: compute() }
  setCache(next)
  return next.value
}

/** El pastel con el plato a la altura 0. La escena lo gira, lo inclina y lo encuadra. */
export default function CakeModel({ shape, motion, flicker, animateColors = false, animateSize = false }: CakeModelProps) {
  const form = shape.form ?? 'round'
  const tierRefs = useRef<(Group | null)[]>([])
  const standRef = useRef<Group>(null)
  const candleRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  // Cada piso descansa sobre la suma de los de abajo.
  const bases = useMemo(
    () => shape.tiers.map((_, i) => shape.tiers.slice(0, i).reduce((sum, tier) => sum + tier.height, PLATE_GAP)),
    [shape.tiers],
  )
  const top = bases.length ? bases[bases.length - 1] + shape.tiers[shape.tiers.length - 1].height : PLATE_GAP
  const extents = useMemo(() => shape.tiers.map((tier) => halfExtents(tier, form)), [form, shape.tiers])
  const plate = standScale(shape)
  // El presupuesto de triángulos y la colocación de la decoración cuestan (hay que armar todas las piezas para contarlas):
  // se hacen una vez por forma, medidas, capas y decoración, no con cada `CakeShape` nuevo que arma una respuesta de precio.
  const shapeKey = JSON.stringify([form, shape.decoration ?? null, shape.tiers])
  const { densityScale, decorations } = useKeyed(shapeKey, () => {
    const scale = pieceDensityScale(shape)
    return { densityScale: scale, decorations: shape.tiers.map((_, i) => tierDecoration(shape, i, scale)) }
  })
  const key = sizeKey(form, extents, plate)
  const latest = useRef({ extents, plate })
  // Se guarda antes de la transición (los efectos corren en orden), no durante el render.
  useLayoutEffect(() => {
    latest.current = { extents, plate }
  })

  // Al cambiar el tamaño, la malla nueva ya tiene las medidas nuevas: se escala hacia atrás para que parezca lo que se veía
  // en ese instante (aunque otro cambio llegue a media transición) y se deja llegar a su medida. Un piso nuevo, o un cambio
  // de molde, no tiene tamaño anterior y entra sin transición. Solo corre si cambia el tamaño (`key`), no con cada objeto nuevo.
  const previous = useRef<{ form: Form; extents: { x: number; z: number }[] } | null>(null)
  const transition = useRef<SizeTransition | null>(null)
  useLayoutEffect(() => {
    const { extents: now, plate: plateNow } = latest.current
    const before = previous.current
    previous.current = { form, extents: now }
    const sameMold = before !== null && before.form === form
    const shown = (i: number): [number, number] => {
      const group = tierRefs.current[i]
      return [group?.scale.x ?? 1, group?.scale.z ?? 1]
    }
    transition.current = animateSize && sameMold
      ? {
          tiers: now.map((size, i) => {
            const was = before.extents[i]
            if (!was) return [1, 1]
            const [sx, sz] = shown(i)
            return [(was.x * sx) / size.x, (was.z * sz) / size.z]
          }),
          standFrom: standRef.current?.scale.x ?? plateNow,
          elapsed: 0,
        }
      : null
    const step = transition.current
    tierRefs.current.forEach((group, i) => group?.scale.set(step?.tiers[i]?.[0] ?? 1, 1, step?.tiers[i]?.[1] ?? 1))
    standRef.current?.scale.setScalar(step?.standFrom ?? plateNow)
    invalidate()
  }, [animateSize, form, invalidate, key])

  useFrame((_, delta) => {
    const lift = motion.current.separation * TIER_LIFT
    tierRefs.current.forEach((group, i) => {
      if (group) group.position.y = bases[i] + i * lift
    })
    if (candleRef.current) candleRef.current.position.y = top + (bases.length - 1) * lift
    const step = transition.current
    if (!step) return
    step.elapsed = Math.min(SIZE_TRANSITION_S, step.elapsed + Math.min(delta, 0.05))
    const t = step.elapsed / SIZE_TRANSITION_S
    const eased = 1 - (1 - t) ** 3
    const toward = (from: number) => from + (1 - from) * eased
    tierRefs.current.forEach((group, i) => group?.scale.set(toward(step.tiers[i]?.[0] ?? 1), 1, toward(step.tiers[i]?.[1] ?? 1)))
    standRef.current?.scale.setScalar(step.standFrom + (plate - step.standFrom) * eased)
    if (t < 1) invalidate()
    else transition.current = null
  })

  return (
    <group>
      {shape.stand && (
        // El plato crece con el piso de abajo para que no se salga de él.
        <group ref={standRef}>
          <Stand />
        </group>
      )}
      <group>
        {shape.tiers.map((tier, i) => (
          <group
            key={i}
            ref={(group) => {
              tierRefs.current[i] = group
            }}
            position-y={bases[i]}
          >
            <Tier tier={tier} festoons={shape.festoons} form={form} animate={animateColors} index={i} densityScale={densityScale} decoration={decorations[i]} />
          </group>
        ))}
        {shape.candle && (
          <group ref={candleRef} position-y={top}>
            <Candle motion={motion} flicker={flicker} />
          </group>
        )}
      </group>
    </group>
  )
}
