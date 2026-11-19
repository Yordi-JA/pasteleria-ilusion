import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import CakeModel from './CakeModel.tsx'
import type { CakeMotion } from './CakeModel.tsx'
import { SceneLights } from './CakeScene.tsx'
import type { CakeShape } from './cakeShape.ts'
import { contentOf, lookAtHeight, viewExtent } from './cakeMetrics.ts'
import { captureStill } from './stillFraming.ts'

/**
 * La escena de las imágenes fijas del catálogo (D86): el mismo `CakeModel` y la misma luz que "Diseña tu pastel", con la cámara
 * quieta donde se tomaron las fotos de la pastelería. Sin giro, arrastre, sombra de contacto ni transiciones: dibuja unos cuadros,
 * avisa que está lista y da la función que toma la imagen. Solo la usa la ruta de desarrollo `/muestra/modelo/:slug`.
 */

/**
 * Desde dónde se ve: las fotos se tomaron de cerca con un teléfono, desde unos 31° a 53° (medido en la elipse de la charola). El
 * modelo es más bajo a la vista que las fotos (su molde mide 6.7 cm de alto y no lleva la decoración alta del borde), así que
 * con 40° el costado casi desaparece; con 32° se ve como en la foto de cajeta y la tapa con la fruta sigue a la vista. El giro
 * deja la decoración de lado, como en la miniatura del carrito. La distancia, unas dos veces el ancho del pastel con su base, da
 * la perspectiva de una foto de cerca.
 */
const STILL_VIEW = { elevation: 32, angle: -20, distance: 4.6 } as const
/** Aire alrededor del pastel en el lienzo: la imagen se recorta y se acomoda después (`stillFraming.ts`). */
const STILL_MARGIN = 1.35
/** Cuadros que se dibujan antes de avisar que está lista: el primero arma las mallas y el segundo ya las muestra completas. */
const FRAMES_BEFORE_READY = 3

/** Toma la imagen como dirección `data:` de WebP, o lanza si no puede. */
export type CaptureStill = () => string

type CakeStillProps = {
  shape: CakeShape
  onReady: () => void
  /** Recibe la función que toma la imagen (y `null` al desmontarse la escena). */
  onCapture: (capture: CaptureStill | null) => void
}

function StillRig({ shape, onReady, onCapture }: CakeStillProps) {
  const motion = useRef<CakeMotion>({ separation: 0 })
  const frames = useRef(0)
  const get = useThree((state) => state.get)
  const invalidate = useThree((state) => state.invalidate)
  const content = useMemo(() => contentOf(shape), [shape])

  // La cámara quieta: mira al centro del pastel con su base a esa elevación, con el ancho o el alto que pida, el que sea mayor.
  useLayoutEffect(() => {
    const lens = get().camera as PerspectiveCamera
    const { top, bottom, halfWidth } = viewExtent(content, STILL_VIEW.elevation)
    const needed = Math.max(top - bottom, 2 * halfWidth) * STILL_MARGIN
    const angle = (STILL_VIEW.elevation * Math.PI) / 180
    const centerY = lookAtHeight(content, STILL_VIEW.elevation)
    lens.fov = (2 * Math.atan(needed / 2 / STILL_VIEW.distance) * 180) / Math.PI
    lens.aspect = 1
    lens.position.set(0, centerY + STILL_VIEW.distance * Math.sin(angle), STILL_VIEW.distance * Math.cos(angle))
    lens.lookAt(0, centerY, 0)
    lens.updateProjectionMatrix()
    frames.current = 0
    invalidate()
  }, [content, get, invalidate])

  useFrame(() => {
    frames.current += 1
    if (frames.current < FRAMES_BEFORE_READY) invalidate()
    else if (frames.current === FRAMES_BEFORE_READY) onReady()
  })

  // Dibuja y lee el lienzo en la misma tarea, como la miniatura del carrito (D85): sin `preserveDrawingBuffer`.
  useEffect(() => {
    onCapture(() => {
      const { gl, scene, camera: lens } = get()
      gl.render(scene, lens)
      return captureStill(gl.domElement)
    })
    return () => onCapture(null)
  }, [get, onCapture])

  return (
    <>
      <SceneLights />
      <group rotation-y={(STILL_VIEW.angle * Math.PI) / 180}>
        <CakeModel shape={shape} motion={motion} />
      </group>
    </>
  )
}

/** El lienzo de la imagen fija, transparente y al doble de resolución (el recorte la baja a 1200 px y suaviza los bordes). */
export default function CakeStill(props: CakeStillProps) {
  return (
    <Canvas
      aria-hidden="true"
      frameloop="demand"
      dpr={2}
      flat
      gl={{ antialias: true, alpha: true }}
      camera={{ near: 0.5, far: 30 }}
      style={{ width: '100%', height: '100%' }}
    >
      <StillRig {...props} />
    </Canvas>
  )
}
