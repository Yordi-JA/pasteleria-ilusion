import { useEffect, useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, SRGBColorSpace, TubeGeometry, Vector2, Vector3 } from 'three'
import type { CakeShape } from './cakeShape.ts'
import { boardRadius, PLATE_GAP } from './cakeMetrics.ts'
import { FINISH_LOOKS, FINISH_TILE, finishEnvironment, useFinishTexture } from './finish.ts'
import type { FruitMesh } from './fruit.ts'
import { resolveColor } from './palette.ts'
import { boardProfile } from './sampleDetails.ts'
import type { SampleDetailsLayout } from './sampleDetails.ts'

/**
 * Dibuja lo que solo llevan las imágenes del catálogo (tanda 4b): la charola negra y los detalles de las fotos que colocó
 * `sampleDetails.ts` (tapa, anillo, franja, conchas, migas o virutas, espolvoreado e hilos). Cada malla se arma una vez, con los
 * colores de la comida en sus vértices; las geometrías se liberan al desmontar. Sin trabajo por cuadro.
 */

/** La geometría de three de una malla de `sampleDetails.ts`, con los colores sRGB pasados a lineal; `uvTile` agrega coordenadas planas. */
function toGeometry(mesh: FruitMesh, uvTile?: number): BufferGeometry {
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
  if (uvTile) {
    const uv: number[] = []
    for (let i = 0; i < mesh.positions.length; i += 3) uv.push(mesh.positions[i] / uvTile, mesh.positions[i + 2] / uvTile)
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  }
  geometry.setIndex(mesh.indices)
  return geometry
}

function useGeometry(mesh: FruitMesh | null, uvTile?: number): BufferGeometry | null {
  const geometry = useMemo(() => (mesh ? toGeometry(mesh, uvTile) : null), [mesh, uvTile])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}

/** Brillo de cada parte: rugosidad y cuánto refleja el entorno de los acabados. */
const LOOKS = {
  shells: { roughness: 0.42, env: 0.35 },
  band: { roughness: 0.42, env: 0.35 },
  crumbs: { roughness: 0.85, env: 0 },
  flakes: { roughness: 0.5, env: 0.25 },
  dust: { roughness: 0.95, env: 0 },
  drizzle: { roughness: 0.22, env: 0.9 },
} as const

function VertexMesh({ mesh, look }: { mesh: FruitMesh | null; look: { roughness: number; env: number } }) {
  const geometry = useGeometry(mesh)
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={look.roughness} envMap={look.env > 0 ? finishEnvironment() : null} envMapIntensity={look.env} side={DoubleSide} />
    </mesh>
  )
}

/** La charola de cartón negro bajo el piso de abajo, un poco brillante, con su cara de arriba al pie del pastel. */
export function Board({ shape }: { shape: CakeShape }) {
  const radius = boardRadius(shape)
  const profile = useMemo(() => boardProfile(radius).map(([x, y]) => new Vector2(x, y)), [radius])
  if (!shape.board) return null
  return (
    <mesh position-y={PLATE_GAP}>
      <latheGeometry args={[profile, 96]} />
      <meshStandardMaterial color={resolveColor(shape.board.color)} roughness={0.3} envMap={finishEnvironment()} envMapIntensity={0.55} />
    </mesh>
  )
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

function Drizzle({ drizzle }: { drizzle: NonNullable<SampleDetailsLayout['drizzle']> }) {
  const geometries = useMemo(
    () =>
      drizzle.curves.map((points) => {
        const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), drizzle.closed)
        return new TubeGeometry(curve, points.length, drizzle.kind === 'lace' ? 0.007 : 0.011, 6, drizzle.closed)
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
      <VertexMesh mesh={layout.shells?.mesh ?? null} look={LOOKS.shells} />
      <VertexMesh mesh={layout.bits?.mesh ?? null} look={layout.bits?.kind === 'crumbs' ? LOOKS.crumbs : LOOKS.flakes} />
      <VertexMesh mesh={layout.dust} look={LOOKS.dust} />
      {layout.drizzle && <Drizzle drizzle={layout.drizzle} />}
    </>
  )
}
