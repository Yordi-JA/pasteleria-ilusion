import { useEffect, useMemo } from 'react'
import { CanvasTexture, Color, DoubleSide, Float32BufferAttribute, LatheGeometry, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three'
import { caramelPool, FLAN, FLAN_GLAZE_FROM, flanDrips, flanLift, flanProfile, LATHE_SEGMENTS } from './dessertLayout.ts'
import type { FlanShape } from './dessertShape.ts'
import { finishEnvironment } from './finish.ts'
import { resolveColor } from './palette.ts'
import { BoardDisc } from './SampleDetails.tsx'
import { useGeometry } from './vertexGeometry.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * El flan napolitano desmoldado (D95): el flan con las burbujitas tostadas del costado y la cara de arriba bañada en caramelo, el
 * caramelo que escurre y el charco, sobre la charola de los pasteles (`BoardDisc`). Las texturas y las mallas se arman una vez.
 */

const PROFILE = flanProfile()
/** Lo que tarda el color del costado en volverse el de la cara de arriba, hacia abajo de `FLAN_GLAZE_FROM`, en cm. */
const GLAZE_BLEND = 0.35

/**
 * Las burbujitas del costado: un lienzo que multiplica el color del flan. El fondo es blanco (no tiñe) y cada punto lleva la
 * proporción entre el flan tostado (hacia el caramelo) y el flan, así el punto queda del color del flan tostado.
 */
function spotsTexture(custard: string, caramel: string): CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    // En sRGB, como se guarda el lienzo: la proporción sobrevive al paso a lineal (es una potencia).
    const base = new Color(custard).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace)
    const toasted = new Color(custard).lerp(new Color(caramel), 0.5).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace)
    const ratio = [toasted.r / Math.max(base.r, 0.01), toasted.g / Math.max(base.g, 0.01), toasted.b / Math.max(base.b, 0.01)].map((value) => Math.round(Math.min(1, value) * 255))
    context.fillStyle = 'rgb(255, 255, 255)'
    context.fillRect(0, 0, size, size)
    context.fillStyle = `rgb(${ratio.join(', ')})`
    const random = seededRandom(20261123)
    // Solo en el costado: el lienzo de abajo hacia arriba es el perfil del torno, y su último cuarto es la orilla y la tapa.
    for (let i = 0; i < 220; i++) {
      context.beginPath()
      context.arc(random() * size, size * (0.32 + 0.66 * random()), 0.8 + 2.2 * random() ** 2, 0, Math.PI * 2)
      context.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(5, 1)
  return texture
}

/** El cuerpo del flan: el torno con el color del flan en el costado y el de la cara de arriba en la orilla y la tapa. */
function bodyGeometry(custard: string, glaze: string): LatheGeometry {
  const geometry = new LatheGeometry(PROFILE.map(([r, y]) => new Vector2(r, y)), LATHE_SEGMENTS)
  const side = new Color(custard)
  const top = new Color(glaze)
  const tone = new Color()
  const positions = geometry.getAttribute('position')
  const colors: number[] = []
  for (let i = 0; i < positions.count; i++) {
    const t = Math.min(1, Math.max(0, (positions.getY(i) - (FLAN_GLAZE_FROM - GLAZE_BLEND)) / GLAZE_BLEND))
    tone.copy(side).lerp(top, t)
    colors.push(tone.r, tone.g, tone.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export default function Flan({ shape }: { shape: FlanShape }) {
  const custard = resolveColor(shape.custard)
  const glaze = resolveColor(shape.glaze)
  const caramel = resolveColor(shape.caramel)
  const body = useMemo(() => bodyGeometry(custard, glaze), [custard, glaze])
  const spots = useMemo(() => spotsTexture(custard, caramel), [custard, caramel])
  useEffect(() => () => body.dispose(), [body])
  useEffect(() => () => spots.dispose(), [spots])
  const drips = useGeometry(useMemo(() => flanDrips(shape), [shape]))
  const pool = useGeometry(useMemo(() => caramelPool(shape), [shape]))
  return (
    <>
      {shape.board && <BoardDisc radius={FLAN.boardRadius * shape.unitsPerCm} color={shape.board.color} />}
      <group position-y={flanLift(shape)} scale={shape.unitsPerCm}>
        {pool && (
          <mesh geometry={pool}>
            <meshStandardMaterial vertexColors roughness={0.08} envMap={finishEnvironment()} envMapIntensity={1.1} side={DoubleSide} />
          </mesh>
        )}
        <mesh geometry={body}>
          <meshStandardMaterial vertexColors map={spots} roughness={0.3} envMap={finishEnvironment()} envMapIntensity={0.5} />
        </mesh>
        {drips && (
          <mesh geometry={drips}>
            <meshStandardMaterial vertexColors roughness={0.1} envMap={finishEnvironment()} envMapIntensity={1.1} side={DoubleSide} />
          </mesh>
        )}
      </group>
    </>
  )
}
