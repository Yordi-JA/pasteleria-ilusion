import { useEffect, useMemo } from 'react'
import { CatmullRomCurve3, DoubleSide, TubeGeometry, Vector2, Vector3 } from 'three'
import type { CakeShape, ShapeColor } from './cakeShape.ts'
import { boardRadius, PLATE_GAP } from './cakeMetrics.ts'
import { FINISH_LOOKS, FINISH_TILE, finishEnvironment, useFinishTexture } from './finish.ts'
import type { FruitMesh } from './fruit.ts'
import { resolveColor } from './palette.ts'
import { boardProfile } from './sampleDetails.ts'
import type { SampleDetailsLayout } from './sampleDetails.ts'
import { useTopPattern } from './topPattern.ts'
import { useGeometry } from './vertexGeometry.ts'

/**
 * Dibuja lo que solo llevan las imágenes del catálogo (tanda 4b): la charola negra y los detalles de las fotos que colocó
 * `sampleDetails.ts` (tapa, anillo, franja, conchas, migas o virutas, espolvoreado e hilos). Cada malla se arma una vez, con los
 * colores de la comida en sus vértices; las geometrías se liberan al desmontar. Sin trabajo por cuadro.
 */

/** Brillo de cada parte: rugosidad y cuánto refleja el entorno de los acabados. */
const LOOKS = {
  shells: { roughness: 0.42, env: 0.35 },
  /** Las conchas finas de media tapa (queso y chocolate): chocolate templado que brilla. */
  glossyShells: { roughness: 0.2, env: 0.9 },
  band: { roughness: 0.42, env: 0.35 },
  crumbs: { roughness: 0.85, env: 0 },
  flakes: { roughness: 0.5, env: 0.25 },
  shavings: { roughness: 0.5, env: 0.25 },
  seeds: { roughness: 0.3, env: 0.5 },
  plates: { roughness: 0.45, env: 0.3 },
  drips: { roughness: 0.2, env: 0.8 },
  dust: { roughness: 0.95, env: 0 },
  drizzle: { roughness: 0.22, env: 0.9 },
} as const

/** Las conchas y placas de chocolate templado, que brillan más: las finas de media tapa y de la orilla, y las placas. */
const GLOSSY_SHELLS: ReadonlySet<string> = new Set(['half', 'rim', 'plaques'])

/** El grueso de cada hilo: el encaje, el garabato y la celosía son de manga fina; los hilos de cajeta, más gruesos. */
const DRIZZLE_RADIUS = { lace: 0.007, threads: 0.011, scribble: 0.0055, lattice: 0.0066 } as const

function VertexMesh({ mesh, look }: { mesh: FruitMesh | null; look: { roughness: number; env: number } }) {
  const geometry = useGeometry(mesh)
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={look.roughness} envMap={look.env > 0 ? finishEnvironment() : null} envMapIntensity={look.env} side={DoubleSide} />
    </mesh>
  )
}

/**
 * La charola de cartón de ese radio y ese color, un poco brillante, con su cara de arriba a la altura `PLATE_GAP`. La usan los
 * pasteles (`Board`) y, desde D95, el flan napolitano.
 */
export function BoardDisc({ radius, color }: { radius: number; color: ShapeColor }) {
  const profile = useMemo(() => boardProfile(radius).map(([x, y]) => new Vector2(x, y)), [radius])
  return (
    <mesh position-y={PLATE_GAP}>
      <latheGeometry args={[profile, 96]} />
      <meshStandardMaterial color={resolveColor(color)} roughness={0.3} envMap={finishEnvironment()} envMapIntensity={0.55} />
    </mesh>
  )
}

/** La charola de cartón negro bajo el piso de abajo, un poco brillante, con su cara de arriba al pie del pastel. */
export function Board({ shape }: { shape: CakeShape }) {
  if (!shape.board) return null
  return <BoardDisc radius={boardRadius(shape)} color={shape.board.color} />
}

function Cap({ cap }: { cap: NonNullable<SampleDetailsLayout['cap']> }) {
  const profile = useMemo(() => cap.profile.map(([x, y]) => new Vector2(x, y)), [cap.profile])
  const gloss = useFinishTexture(cap.glossy ? 'caramel' : null, 12, 1)
  return (
    <mesh>
      <latheGeometry args={[profile, 96]} />
      <meshStandardMaterial
        color={resolveColor(cap.color)}
        roughness={cap.glossy ? 0.16 : 0.85}
        map={gloss}
        bumpMap={gloss}
        bumpScale={0.2}
        envMap={cap.glossy ? finishEnvironment() : null}
        envMapIntensity={1}
      />
    </mesh>
  )
}

function Ring({ mesh }: { mesh: FruitMesh }) {
  const geometry = useGeometry(mesh, FINISH_TILE)
  const jam = useFinishTexture('jam', 1, 1)
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        roughness={FINISH_LOOKS.jam.roughness}
        map={jam}
        bumpMap={jam}
        bumpScale={FINISH_LOOKS.jam.bumpScale}
        envMap={finishEnvironment()}
        envMapIntensity={FINISH_LOOKS.jam.envMapIntensity}
        side={DoubleSide}
      />
    </mesh>
  )
}

/** El dibujo de toda la tapa (telaraña, plumas o jaspeado): un disco con la textura transparente, encima de la tapa y sin sombra propia. */
function TopPattern({ pattern }: { pattern: NonNullable<SampleDetailsLayout['pattern']> }) {
  const texture = useTopPattern(pattern.kind, resolveColor(pattern.color))
  if (!texture) return null
  return (
    <mesh position-y={pattern.y} rotation-x={-Math.PI / 2}>
      <circleGeometry args={[pattern.radius, 96]} />
      <meshStandardMaterial
        map={texture}
        transparent
        depthWrite={false}
        roughness={0.25}
        envMap={finishEnvironment()}
        envMapIntensity={0.7}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  )
}

function Drizzle({ drizzle }: { drizzle: NonNullable<SampleDetailsLayout['drizzle']> }) {
  const geometries = useMemo(
    () =>
      drizzle.curves.map((points) => {
        const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), drizzle.closed)
        return new TubeGeometry(curve, points.length, DRIZZLE_RADIUS[drizzle.kind], 6, drizzle.closed)
      }),
    [drizzle],
  )
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  return (
    <>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color={resolveColor(drizzle.color)} roughness={LOOKS.drizzle.roughness} envMap={finishEnvironment()} envMapIntensity={LOOKS.drizzle.env} />
        </mesh>
      ))}
    </>
  )
}

/** Los detalles del último piso, en las coordenadas de ese piso (va dentro de su grupo). */
export default function SampleDetails({ layout }: { layout: SampleDetailsLayout }) {
  return (
    <>
      {layout.cap && <Cap cap={layout.cap} />}
      {layout.ring && <Ring mesh={layout.ring} />}
      <VertexMesh mesh={layout.band} look={LOOKS.band} />
      <VertexMesh mesh={layout.shells?.mesh ?? null} look={GLOSSY_SHELLS.has(layout.shells?.place ?? 'edge') ? LOOKS.glossyShells : LOOKS.shells} />
      <VertexMesh mesh={layout.bits?.mesh ?? null} look={LOOKS[layout.bits?.kind ?? 'flakes']} />
      <VertexMesh mesh={layout.dust} look={LOOKS.dust} />
      {layout.drizzle && <Drizzle drizzle={layout.drizzle} />}
      {layout.pattern && <TopPattern pattern={layout.pattern} />}
      <VertexMesh mesh={layout.glaze} look={LOOKS.drips} />
    </>
  )
}
