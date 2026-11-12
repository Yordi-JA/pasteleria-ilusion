import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'
import { imagePlacement } from '../models/cakeDesignLayout.ts'
import type { LidMessage, LidWafer } from './cakeShape.ts'
import type { CakeLid } from './cakeShape.ts'

/**
 * La oblea y el mensaje sobre la tapa del último piso (paso 7, D55). Se dibujan planos, apenas sobre la cobertura, con los
 * mismos números del editor de vista superior: en cm de la tapa, con la `y` hacia arriba y el giro hacia la derecha. Con
 * `MeshBasicMaterial` y sin tono: la oblea y la tinta se ven del color que se imprime, no iluminadas.
 */

/** Lo que flotan sobre la tapa, en unidades de escena (menos de un milímetro de pastel): la oblea y, encima, el mensaje. */
const WAFER_LIFT = 0.006
const MESSAGE_LIFT = 0.012
/** Lado más largo de la imagen que se manda a la GPU: una foto de 40 megapíxeles no cabe en una textura. */
const MAX_TEXTURE_SIDE = 2048
/** Píxeles por cm de la textura del mensaje, y su lado máximo. */
const TEXT_PX_PER_CM = 48
const MAX_TEXT_SIDE = 2048

/** La imagen reducida (una sola vez por imagen) para usarla de textura: la original puede ser enorme. */
function proxyOf(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement | null {
  const scale = Math.min(1, MAX_TEXTURE_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function Wafer({ wafer, unitsPerCm }: { wafer: LidWafer; unitsPerCm: number }) {
  const invalidate = useThree((state) => state.invalidate)
  const { image, imageWidth, imageHeight } = wafer
  const texture = useMemo(() => {
    const proxy = proxyOf(image, imageWidth, imageHeight)
    if (!proxy) return null
    const made = new CanvasTexture(proxy)
    made.colorSpace = SRGBColorSpace
    made.wrapS = ClampToEdgeWrapping
    made.wrapT = ClampToEdgeWrapping
    made.minFilter = LinearMipmapLinearFilter
    made.anisotropy = 4
    return made
  }, [image, imageHeight, imageWidth])
  useEffect(() => () => texture?.dispose(), [texture])

  // El encuadre mueve la textura sin volver a dibujarla: el mismo cálculo del editor (`imagePlacement`, con el origen en el
  // centro de la oblea y la esquina de arriba a la izquierda de la imagen), como `repeat` y `offset`.
  const { widthCm, heightCm, imageZoom, imageX, imageY } = wafer
  useEffect(() => {
    if (!texture) return
    const place = imagePlacement({ width: imageWidth, height: imageHeight }, { width: widthCm, height: heightCm }, imageZoom, imageX, imageY)
    texture.repeat.set(widthCm / place.width, heightCm / place.height)
    texture.offset.set(-(widthCm / 2 + place.x) / place.width, 1 - (heightCm / 2 - place.y) / place.height)
    invalidate()
  }, [texture, imageWidth, imageHeight, widthCm, heightCm, imageZoom, imageX, imageY, invalidate])

  if (!texture) return null
  const [width, height] = [widthCm * unitsPerCm, heightCm * unitsPerCm]
  return (
    <group position={[wafer.x * unitsPerCm, WAFER_LIFT, -wafer.y * unitsPerCm]} rotation-y={(-wafer.rotation * Math.PI) / 180}>
      <mesh rotation-x={-Math.PI / 2}>
        {wafer.shape === 'circle' ? <circleGeometry args={[width / 2, 64]} /> : <planeGeometry args={[width, height]} />}
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Dibuja el texto en un lienzo con la letra del mensaje, letra por letra, como el editor. */
function drawMessage(message: LidMessage, widthPx: number, heightPx: number, pxPerCm: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const { bounds } = message
  const originX = -bounds.minX * pxPerCm
  const originY = bounds.maxY * pxPerCm
  context.fillStyle = message.color
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.font = `${message.fontWeight} ${message.fontSizeCm * pxPerCm}px ${message.fontFamily}`
  for (const glyph of message.glyphs) {
    context.save()
    context.translate(originX + glyph.x * pxPerCm, originY - glyph.y * pxPerCm)
    context.rotate((glyph.rotation * Math.PI) / 180)
    context.fillText(glyph.text, 0, message.baselineCm * pxPerCm)
    context.restore()
  }
  return canvas
}

/** La textura del mensaje con las medidas del lienzo con que se dibujó: el plano que la muestra usa estas, no las del mensaje de ahora. */
type MessageTexture = { texture: CanvasTexture; widthCm: number; heightCm: number; bounds: LidMessage['bounds'] }

function Message({ message, unitsPerCm }: { message: LidMessage; unitsPerCm: number }) {
  const invalidate = useThree((state) => state.invalidate)
  const { bounds } = message
  const [widthCm, heightCm] = [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY]
  const pxPerCm = Math.min(TEXT_PX_PER_CM, MAX_TEXT_SIDE / Math.max(widthCm, heightCm, 1))
  // La textura depende de lo que se ve de las letras, no de dónde está el mensaje: moverlo o girarlo no la vuelve a dibujar.
  const key = JSON.stringify([message.glyphs, message.fontSizeCm, message.color, message.fontFamily, message.fontWeight, bounds])
  const latest = useRef({ message, widthCm, heightCm, pxPerCm })
  useLayoutEffect(() => {
    latest.current = { message, widthCm, heightCm, pxPerCm }
  })
  // Cada `key` visible tiene su propia textura, ya dibujada y de su tamaño: three sube una textura a la GPU con el tamaño con que
  // nace, así que reutilizar una y cambiarle el lienzo la estiraría o fallaría al crecer. Nada se sube hasta que la letra cargó
  // (con la de respaldo el texto saldría con otras letras y ya no se corregiría). La textura va con sus medidas en un solo
  // estado, para que el plano nunca use las de un mensaje y la textura de otro.
  const [shown, setShown] = useState<MessageTexture | null>(null)
  useEffect(() => {
    let alive = true
    const { message: now, widthCm: width, heightCm: height, pxPerCm: density } = latest.current
    const make = () => {
      if (!alive) return
      const texture = new CanvasTexture(drawMessage(now, Math.max(1, Math.ceil(width * density)), Math.max(1, Math.ceil(height * density)), density))
      texture.colorSpace = SRGBColorSpace
      setShown({ texture, widthCm: width, heightCm: height, bounds: now.bounds })
      invalidate()
    }
    // Si la letra no llega, se dibuja con la de respaldo: es mejor que no mostrar el mensaje.
    document.fonts.load(`${now.fontWeight} 40px ${now.fontFamily}`).then(make, make)
    return () => {
      alive = false
    }
  }, [key, invalidate])
  // Se libera cuando React ya soltó la textura (al llegar la siguiente y al desmontar), nunca antes: así no se dibuja un cuadro con
  // una textura liberada, que three volvería a subir sin que nadie la suelte.
  useEffect(() => () => shown?.texture.dispose(), [shown])

  if (!shown) return null
  const centerX = ((shown.bounds.minX + shown.bounds.maxX) / 2) * unitsPerCm
  const centerZ = (-(shown.bounds.minY + shown.bounds.maxY) / 2) * unitsPerCm
  return (
    <group position={[message.x * unitsPerCm, MESSAGE_LIFT, -message.y * unitsPerCm]} rotation-y={(-message.rotation * Math.PI) / 180}>
      <mesh position={[centerX, 0, centerZ]} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[shown.widthCm * unitsPerCm, shown.heightCm * unitsPerCm]} />
        <meshBasicMaterial map={shown.texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Lo que va sobre la tapa del último piso. Se coloca dentro del grupo de ese piso, a la altura de su cara de arriba. */
export default function Lid({ lid, height }: { lid: CakeLid; height: number }) {
  return (
    <group position-y={height}>
      {lid.wafer && <Wafer wafer={lid.wafer} unitsPerCm={lid.unitsPerCm} />}
      {lid.message && <Message message={lid.message} unitsPerCm={lid.unitsPerCm} />}
    </group>
  )
}
