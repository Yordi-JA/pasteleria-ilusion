import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Color, ExtrudeGeometry, Object3D } from 'three'
import type { Group, InstancedMesh, MeshStandardMaterial, Texture } from 'three'
import { TIER_EDGE_UNITS } from '../models/cakeDesignLayout.ts'
import type { CakeComb, CakeLayer, CakeShape, CakeSpread, CakeTier, SideTextureKind } from './cakeShape.ts'
import { rectOutline, rectShape, roundOutline, spreadGeometry, spreadShape } from './creamSpread.ts'
import type { SpreadShape, SpreadTint } from './creamSpread.ts'
import { combedProfile, combedSide, roundedProfile, slabOutline, SLAB_CORNER_SEGMENTS } from './comb.ts'
import { CRUMB_TILE, useCrumbTexture } from './crumb.ts'
import { FINISH_LOOKS, FINISH_TILE, finishEnvironment, useFinishTexture } from './finish.ts'
import FillingPieces from './FillingPieces.tsx'
import { halfExtents, PLATE_GAP, standScale } from './cakeMetrics.ts'
import Decoration from './Decoration.tsx'
import Fruit from './Fruit.tsx'
import { fruitLayout, lidKeepOut } from './fruit.ts'
import Lid from './Lid.tsx'
import SampleDetails, { Board } from './SampleDetails.tsx'
import { sampleDecoration, sampleDetailsLayout } from './sampleDetails.ts'
import { SIDE_TEXTURE_LOOKS, useSideTexture } from './sideTexture.ts'
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
}

/** Lo que sube cada piso por encima del de abajo con la separación completa (38 px en el mockup). */
const TIER_LIFT = 0.38
/** Lo que tarda un piso en pasar de su tamaño anterior al nuevo cuando cambian los kilos. */
const SIZE_TRANSITION_S = 0.3
const EDGE = TIER_EDGE_UNITS
const PEARL_RADIUS = 0.085
/** Una perla cada 22 px de contorno, como el prototipo. */
const PEARL_SPACING = 0.22
/** Tope de perlas por fila (por lado en rectangular: la cuarta parte): un piso de muchos kilos no pide miles de instancias. */
const MAX_PEARLS_PER_ROW = 300
/** Relieve de la miga del pan. */
const CRUMB_BUMP = 1.4
/** Cambio de color de una capa o de la cobertura (libro de marca, "Cotizador 3D"). */
const COLOR_TRANSITION_S = 0.3
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
  /** La miga del pan o el acabado del relleno (color y relieve); el color de la capa la tiñe. */
  texture?: Texture | null
  /** Cuánto relieve da la textura. */
  bumpScale?: number
  /** El entorno que refleja un relleno brillante (mermelada, cajeta) y con qué fuerza. */
  envMap?: Texture | null
  envMapIntensity?: number
  /** La geometría trae colores por vértice que multiplican el color (la crema teñida por el relleno). */
  vertexColors?: boolean
}

function FoodMaterial({ attach, color, roughness, animate, texture = null, bumpScale = 1, envMap = null, envMapIntensity = 1, vertexColors = false }: FoodMaterialProps) {
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
  // Con o sin textura es otro programa de sombreado: el material se recompila cuando cambia.
  useEffect(() => {
    if (material.current) material.current.needsUpdate = true
    invalidate()
  }, [texture, envMap, vertexColors, invalidate])
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
      map={texture}
      bumpMap={texture}
      bumpScale={bumpScale}
      envMap={envMap}
      envMapIntensity={envMapIntensity}
      vertexColors={vertexColors}
    />
  )
}

type Split = 'whole' | 'left' | 'right'

/** Losa rectangular con las esquinas de afuera redondeadas; `split` dice qué mitad (o toda). */
function rectSlab(halfW: number, halfD: number, height: number, split: Split) {
  const geometry = new ExtrudeGeometry(rectShape(halfW, halfD, split), { depth: height, bevelEnabled: false, curveSegments: SLAB_CORNER_SEGMENTS })
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

/** El costado peinado de un piso rectangular (`comb.ts`); la losa pone las tapas. Se arma una vez por medida y peine. */
function CombedSide({ tier, comb }: { tier: CakeTier; comb: CakeComb }) {
  const { x, z } = halfExtents(tier, 'rectangular')
  const { height } = tier
  const { pitch, depth } = comb
  const geometry = useMemo(() => combedSide(slabOutline(x, z), height, { pitch, depth }), [depth, height, pitch, x, z])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <primitive object={geometry} attach="geometry" />
}

/**
 * El costado untado de una capa de crema (`creamSpread.ts`): se arma una vez por medida, forma, semilla y tinte. El tinte llega como
 * texto (`tintKey`) para no rearmar la malla con cada objeto nuevo de la misma elección.
 */
function SpreadSide({ tier, form, height, shape, tintKey }: { tier: CakeTier; form: Form; height: number; shape: SpreadShape; tintKey: string | null }) {
  const { x, z } = halfExtents(tier, form)
  const { radius } = tier
  const geometry = useMemo(
    () =>
      spreadGeometry(
        form === 'round' ? roundOutline(radius) : rectOutline(x, z),
        height,
        shape,
        tintKey ? (JSON.parse(tintKey) as SpreadTint) : undefined,
      ),
    [form, height, radius, shape, tintKey, x, z],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return <primitive object={geometry} attach="geometry" />
}

type LayerProps = { tier: CakeTier; form: Form; layer: CakeLayer; bottom: number; animate: boolean; seed: number; densityScale: number }

/** Una mitad (o toda) la capa: su forma, su material y, si el relleno los lleva, sus trozos. */
function LayerPart({ tier, form, layer, index, height, animate, seed, densityScale }: Omit<LayerProps, 'bottom'> & { index: number; height: number }) {
  const halves = layer.colors.length === 2
  const color = layer.colors[index] ?? layer.colors[0]
  const pieces = layer.pieces?.[index] ?? null
  const finish = layer.finishes?.[index] ?? null
  // La crema untada a mano (tanda 4): solo en una capa de un color. Su forma sale de la semilla de la capa.
  const level: CakeSpread | null = !halves && layer.spread ? layer.spread : null
  const spread = useMemo(() => (level ? spreadShape(level, seed) : null), [level, seed])
  // La crema teñida por la mermelada o la cajeta de junto (tanda 4), con los colores ya resueltos. La primera mitad del relleno es
  // la de x positiva en el cilindro y la de x negativa en la losa (`'left'`).
  const tint = spread && layer.tint ? layer.tint : null
  const tintKey = tint
    ? JSON.stringify({
        cream: resolveColor(color),
        colors: tint.colors.map((value) => (value ? resolveColor(value) : null)),
        firstHalf: form === 'round' ? 1 : -1,
        toward: tint.toward,
      } satisfies SpreadTint)
    : null
  // La miga y el acabado se repiten cada `tile`: en redondo, el ancho de la textura es el arco de la pieza; en rectangular
  // y en la crema untada, la malla ya usa coordenadas de escena.
  const arc = (halves ? Math.PI : Math.PI * 2) * tier.radius
  const sceneUv = form !== 'round' || spread !== null
  const repeatX = (tile: number) => (sceneUv ? 1 / tile : Math.max(1, Math.round(arc / tile)))
  const repeatY = (tile: number) => (sceneUv ? 1 / tile : Math.max(height / tile, 0.05))
  const crumb = useCrumbTexture(Boolean(layer.crumb), repeatX(CRUMB_TILE), repeatY(CRUMB_TILE))
  // Las tapas del cilindro (que ahora se ven desde arriba) reparten la textura por el diámetro, no como el costado.
  const capRepeat = (2 * tier.radius) / CRUMB_TILE
  const cap = useCrumbTexture(Boolean(layer.crumb) && form === 'round', capRepeat, capRepeat)
  // La mermelada y la cajeta: su textura, brillo y relieve (tanda 4). Sus tapas quedan entre las capas de crema.
  const surface = useFinishTexture(finish, repeatX(FINISH_TILE), repeatY(FINISH_TILE))
  const look = finish ? FINISH_LOOKS[finish] : null
  const roughness = look ? look.roughness : layer.crumb ? 0.95 : 0.85
  return (
    <>
      <mesh position-y={form === 'round' && !spread ? height / 2 : 0}>
        {spread ? (
          <SpreadSide tier={tier} form={form} height={height} shape={spread} tintKey={tintKey} />
        ) : form === 'round' ? (
          <cylinderGeometry
            args={[tier.radius, tier.radius, height, 64, 1, false, halves ? index * Math.PI : 0, halves ? Math.PI : Math.PI * 2]}
          />
        ) : (
          <RectSlab tier={tier} height={height} split={halves ? (index === 0 ? 'left' : 'right') : 'whole'} />
        )}
        {form === 'round' && crumb ? (
          <>
            <FoodMaterial attach="material-0" color={color} roughness={roughness} animate={animate} texture={crumb} bumpScale={CRUMB_BUMP} />
            <FoodMaterial attach="material-1" color={color} roughness={roughness} animate={animate} texture={cap} bumpScale={CRUMB_BUMP} />
            <FoodMaterial attach="material-2" color={color} roughness={roughness} animate={animate} texture={cap} bumpScale={CRUMB_BUMP} />
          </>
        ) : look ? (
          <FoodMaterial
            color={color}
            roughness={roughness}
            animate={animate}
            texture={surface}
            bumpScale={look.bumpScale}
            envMap={finishEnvironment()}
            envMapIntensity={look.envMapIntensity}
          />
        ) : (
          <FoodMaterial color={color} roughness={roughness} animate={animate} texture={crumb} bumpScale={crumb ? CRUMB_BUMP : 1} vertexColors={tintKey !== null} />
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
          spread={spread}
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

/** El costado de la cobertura en las imágenes del catálogo (tanda 4b): brillante como la cajeta y con su textura. */
type FrostingSurface = { glossy: boolean; texture: SideTextureKind | null }

/**
 * Qué parte de la coordenada `v` del torno ocupa el costado recto: `LatheGeometry` reparte `v` por número de puntos, no por largo,
 * así que la textura del costado se repite según los puntos que caen en él.
 */
function sideSpan(profile: readonly { x: number; y: number }[], radius: number, height: number): number {
  const side = profile.map((point, i) => (point.y >= EDGE - 1e-6 && point.y <= height - EDGE + 1e-6 && point.x >= radius - 0.05 ? i : -1)).filter((i) => i >= 0)
  const span = side.length > 1 ? (side[side.length - 1] - side[0]) / (profile.length - 1) : 1 / Math.max(1, profile.length - 1)
  return Math.max(span, 1e-3)
}

type TierProps = {
  tier: CakeTier
  festoons: CakeShape['festoons']
  form: Form
  animate: boolean
  index: number
  densityScale: number
  decoration: TierDecoration
  /** Solo las imágenes del catálogo lo dan, en el último piso. */
  surface?: FrostingSurface
}

function Tier({ tier, festoons, form, animate, index, densityScale, decoration, surface }: TierProps) {
  // El peinado lateral (tanda 4) se arma con el perfil, una vez por medida y peine.
  const pitch = tier.comb?.pitch ?? 0
  const depth = tier.comb?.depth ?? 0
  const profile = useMemo(
    () => (pitch > 0 ? combedProfile(tier.radius, tier.height, EDGE, { pitch, depth }) : roundedProfile(tier.radius, tier.height, EDGE)),
    [depth, pitch, tier.height, tier.radius],
  )
  // La textura o el brillo del costado (tanda 4b), repetidos según lo que mide el piso. Sin `surface`, la cobertura de siempre.
  const textureKind = form === 'round' ? (surface?.texture ?? null) : null
  const glossy = form === 'round' && surface?.glossy === true
  const tile = textureKind ? SIDE_TEXTURE_LOOKS[textureKind].tile : FINISH_TILE
  const repeatU = Math.max(1, Math.round((2 * Math.PI * tier.radius) / tile))
  const repeatV = Math.max(0.05, (tier.height - 2 * EDGE) / tile / sideSpan(profile, tier.radius, tier.height))
  const sideTexture = useSideTexture(textureKind, repeatU, repeatV)
  const sideGloss = useFinishTexture(glossy && !textureKind ? 'caramel' : null, repeatU, repeatV)
  const frostingTexture = sideTexture ?? sideGloss
  const frostingBump = textureKind ? SIDE_TEXTURE_LOOKS[textureKind].bumpScale : FINISH_LOOKS.caramel.bumpScale
  const layers = tier.frosting ? [] : (tier.layers ?? [])
  const bottoms = layers.map((_, i) => layers.slice(0, i).reduce((sum, layer) => sum + layer.height * tier.height, 0))
  return (
    <>
      {tier.frosting && (form === 'round' || !tier.comb) && (
        <mesh>
          {form === 'round' ? <latheGeometry args={[profile, surface ? 128 : 64]} /> : <RectSlab tier={tier} height={tier.height} split="whole" />}
          <FoodMaterial
            color={tier.frosting}
            roughness={glossy ? 0.24 : 0.8}
            animate={animate}
            texture={frostingTexture}
            bumpScale={frostingBump}
            envMap={glossy ? finishEnvironment() : null}
            envMapIntensity={1.6}
          />
        </mesh>
      )}
      {tier.frosting && form !== 'round' && tier.comb && (
        // Rectangular peinado: la losa pone solo sus tapas (el grupo 0 de la extrusión) y el costado es el peinado.
        <>
          <mesh>
            <RectSlab tier={tier} height={tier.height} split="whole" />
            <FoodMaterial attach="material-0" color={tier.frosting} roughness={0.8} animate={animate} />
            <meshBasicMaterial attach="material-1" visible={false} />
          </mesh>
          <mesh>
            <CombedSide tier={tier} comb={tier.comb} />
            <FoodMaterial color={tier.frosting} roughness={0.8} animate={animate} />
          </mesh>
        </>
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

type CakeModelProps = {
  shape: CakeShape
  motion: RefObject<CakeMotion>
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
export default function CakeModel({ shape, motion, animateColors = false, animateSize = false }: CakeModelProps) {
  const form = shape.form ?? 'round'
  const tierRefs = useRef<(Group | null)[]>([])
  const standRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  // Cada piso descansa sobre la suma de los de abajo.
  const bases = useMemo(
    () => shape.tiers.map((_, i) => shape.tiers.slice(0, i).reduce((sum, tier) => sum + tier.height, PLATE_GAP)),
    [shape.tiers],
  )
  const extents = useMemo(() => shape.tiers.map((tier) => halfExtents(tier, form)), [form, shape.tiers])
  const plate = standScale(shape)
  // El presupuesto de triángulos y la colocación de la decoración cuestan (hay que armar todas las piezas para contarlas):
  // se hacen una vez por forma, medidas, capas y decoración, no con cada `CakeShape` nuevo que arma una respuesta de precio.
  // La fruta de la tapa (solo en las imágenes del catálogo) también se coloca aquí: depende de la decoración del último piso y de
  // lo que ocupan el mensaje y la oblea, no de la imagen de la oblea.
  const fruitKey = shape.topping ? [shape.topping, lidKeepOut(shape.lid)] : null
  // Los detalles de las fotos (tanda 4b, solo las imágenes del catálogo) también: se colocan con la decoración y la fruta se aparta de ellos.
  const shapeKey = JSON.stringify([form, shape.decoration ?? null, shape.tiers, fruitKey, shape.details ?? null])
  const { densityScale, decorations, fruit, details } = useKeyed(shapeKey, () => {
    const scale = pieceDensityScale(shape)
    const placed = shape.tiers.map((_, i) => tierDecoration(shape, i, scale))
    const top = placed[placed.length - 1]
    const sample = sampleDetailsLayout(shape, top)
    const fruit = fruitLayout(shape, top, sample?.avoid)
    // Lo que cambian las fotos en el borde (solo las imágenes del catálogo): el arco sin rosetones y las hileras entre las franjas.
    if (top) placed[placed.length - 1] = sampleDecoration(top, sample?.edgeGap ?? null, fruit?.dividers, fruit?.keepRosettes)
    return { densityScale: scale, decorations: placed, fruit, details: sample }
  })
  const surface = useMemo(
    () => (shape.details ? { glossy: shape.details.sideGlossy === true, texture: shape.details.sideTexture ?? null } : undefined),
    [shape.details],
  )
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
      {shape.board && !shape.stand && <Board shape={shape} />}
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
            <Tier
              tier={tier}
              festoons={shape.festoons}
              form={form}
              animate={animateColors}
              index={i}
              densityScale={densityScale}
              decoration={decorations[i]}
              surface={i === shape.tiers.length - 1 ? surface : undefined}
            />
            {/* La oblea y el mensaje van sobre la tapa del último piso y suben con él al separar los pisos. */}
            {shape.lid && i === shape.tiers.length - 1 && <Lid lid={shape.lid} height={tier.height} />}
            {fruit && i === shape.tiers.length - 1 && <Fruit layout={fruit} />}
            {details && i === shape.tiers.length - 1 && <SampleDetails layout={details} />}
          </group>
        ))}
      </group>
    </group>
  )
}
