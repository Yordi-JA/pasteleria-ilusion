import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import { focusRing, focusRingOnColor } from '../components/focus.ts'
import CakeModel from './CakeModel.tsx'
import type { CakeMotion } from './CakeModel.tsx'
import type { CakeShape, Viewpoint } from './cakeShape.ts'
import { BOARD, boardRadius, contentOf, fitScale, lookAtHeight, PLATE_GAP, referenceContent, standScale, viewExtent } from './cakeMetrics.ts'
import type { Content } from './cakeMetrics.ts'
import { dessertContent, dessertRadius, dessertView } from './dessertLayout.ts'
import DessertModel from './DessertModel.tsx'
import { isDessert } from './dessertShape.ts'
import type { SceneShape } from './dessertShape.ts'
import { brandColor } from './palette.ts'
import { encodeThumbnail } from './snapshot.ts'
import {
  aimTilt,
  approach,
  createSpin,
  createTilt,
  ELEVATION,
  endDrag,
  moveDrag,
  needsFullRate,
  nudge,
  nudgeElevation,
  startDrag,
  stepSpin,
  stepTilt,
} from './spin.ts'
import type { Spin, Tilt } from './spin.ts'

/** La cámara de la portada mira desde unos 15° arriba, el ángulo de las fotos del catálogo (libro de marca). */
const CAMERA_ELEVATION = ELEVATION.initial
const CAMERA_DISTANCE = 11
/** Ángulo inicial del mockup. */
const INITIAL_ANGLE = -28
/** Inclinación hacia el puntero, como el mockup: hasta 16° de giro y 5° de cabeceo. */
const TILT = { yaw: 16, pitch: 5, timeConstant: 0.2 }
/**
 * Intervalo entre cuadros del giro solo: unos 30 por segundo. A 7° por segundo no se nota la diferencia con 60, y
 * en un teléfono la mitad de cuadros es la mitad de trabajo de la GPU y de batería. Mientras la persona arrastra,
 * hay inercia, un paso de flecha o inclinación, se dibuja a la tasa completa de la pantalla.
 */
const IDLE_FRAME_MS = 33
const IDLE_FRAME_MARGIN_MS = 6
/**
 * El plato queda al 70% de la altura de la caja y el pastel cabe en 560 × 600 px, como el mockup. `scale` iguala el
 * tamaño de la captura (`001-Main.jpg`): la perspectiva de CSS 3D del prototipo lo dibuja algo más chico.
 */
const FRAME = { plate: 0.7, width: 560, height: 600, scale: 0.88 }

/**
 * Encuadre de la escena: dónde queda el plato (fracción del alto de la caja), qué caja en px del mockup debe caber y a
 * qué escala. Sin él, el de la portada. Desde D90 los pisos ya no se separan con el scroll, así que el lienzo mide lo mismo
 * que su caja (antes subía 72 px sobre ella para el piso de arriba).
 */
export type SceneFraming = typeof FRAME

/**
 * El pastel de dos pisos de la portada (tanda 6) mide lo que un pastel de verdad (los cm de los moldes) y va sobre la charola: la
 * escena lo encuadra por el ancho de la charola, sea cual sea su tamaño. La charola queda al 74 % de la caja (no hay columna debajo,
 * como en la base del pastel de tres pisos) y mide 5 unidades del mockup.
 */
const BOARD_FRAME = { plate: 0.74, width: 5 }

/**
 * El encuadre de un pastel sobre su charola, a partir del de la portada o de uno propio (`custom`). Con uno propio, su `plate` dice
 * dónde queda la charola (la escena chica de `/entrar` y `/registro`, tanda 9); si no, al 74 % de `BOARD_FRAME`.
 */
function boardFraming(base: SceneFraming, width: number, custom: boolean): SceneFraming {
  const plate = custom ? base.plate : BOARD_FRAME.plate
  return width > 0 ? { ...base, plate, scale: (base.scale * BOARD_FRAME.width) / width } : base
}

/**
 * Lo que la escena mide de lo que dibuja (D95): lo que ocupa (para encuadrar), el pastel de referencia de la vista libre, el ancho por
 * el que se encuadra lo que va sobre la mesa (la charola o la huella del postre; 0 si va sobre la base con columna) y la sombra de
 * contacto. Es el único lugar donde la escena distingue un pastel por pisos de un postre; el resto los trata igual.
 */
type Measure = {
  content: Content
  reference: Content
  footprint: number
  shadow: { y: number; scale: number }
  elevation: number
  /** Solo con `fitPlate`: el encuadre propio de un postre (`dessertView`), en lugar del de la caja. */
  fit?: { plate: number; top: number }
}

function measure(shape: SceneShape): Measure {
  if (isDessert(shape)) {
    const content = dessertContent(shape)
    const radius = dessertRadius(shape)
    // La sombra va bajo lo más bajo del postre (la charola del flan, el fondo del vaso) y la cámara, a la altura de su foto.
    const lowest = Math.min(...content.circles.map(({ y }) => y))
    const view = dessertView(shape)
    return { content, reference: content, footprint: 2 * radius, shadow: { y: lowest - 0.005, scale: (radius * 1.15) / 1.8 }, elevation: view.scene, fit: view.fit }
  }
  const onBoard = Boolean(shape.board) && !shape.stand
  return {
    content: contentOf(shape),
    reference: referenceContent(shape),
    footprint: onBoard ? 2 * boardRadius(shape) : 0,
    shadow: shadowPlacement(shape),
    elevation: CAMERA_ELEVATION,
  }
}

/** Constante de tiempo (s) con la que la cámara de la vista libre se acerca a su encuadre cuando cambia el pastel. */
const FREE_FRAMING_RESPONSE = 0.1

/**
 * Desde dónde se toma la miniatura del carrito (tanda 4), sin importar cómo lo dejó la persona: un poco de lado, para que se
 * vea su volumen, y desde arriba lo justo para ver la tapa y el mensaje sin perder los pisos.
 */
const SNAPSHOT_VIEW = { angle: -20, elevation: 30 }

/** Toma la miniatura del pastel como dirección `data:`, o `null` si no se puede. */
export type TakeSnapshot = () => string | null

export type CakeSceneProps = {
  /** Un pastel por pisos o, desde D95, un postre. */
  shape: SceneShape
  /** Nombre accesible de la escena. */
  label: string
  /** `id` del texto que describe cómo girarlo (`aria-describedby`). */
  describedBy?: string
  reducedMotion: boolean
  /** Falso cuando la escena no se ve o la pestaña está oculta: no se dibuja ningún cuadro. */
  running: boolean
  onReady: () => void
  onContextLost: () => void
  /** Avisa si la escena tiene el foco del teclado (`:focus-visible`), para cambiar la pista visible. */
  onKeyboardFocusChange?: (keyboard: boolean) => void
  /** Si la escena tiene el foco cuando se pierde el contexto, lo pasa a otro control antes de desaparecer. */
  onFocusEscape?: () => void
  /** Encuadre propio; sin él, el de la portada. Con `freeLook` o `fitPlate` no se usa. */
  framing?: SceneFraming
  /**
   * Encuadre a lo que se dibuja (la ficha, D95): el pastel o el postre llena la caja, sea del tamaño que sea, con su base a esta
   * fracción del alto de la caja. Sin él, `framing`. Con `freeLook` no se usa.
   */
  fitPlate?: number
  /**
   * Vista libre ("Diseña tu pastel"): arrastrar en vertical cambia la elevación de la cámara, las flechas de arriba y
   * abajo también, y la cámara se encuadra al pastel (escala fija para un pastel grande de un piso, más lejos solo si no
   * cabe). Sin ella, la portada: giro horizontal e inclinación hacia el puntero.
   */
  freeLook?: boolean
  /** Solo con `freeLook`: desde dónde se ve el pastel. Sin él, la elevación de siempre y el giro solo. */
  viewpoint?: Viewpoint
  /** Sobre un campo `mermelada` (el bloque "¿No encuentras el pastel que imaginas?"): el anillo de foco va en `betun`. */
  onColor?: boolean
  /** Solo con `freeLook`: recibe la función que toma la miniatura del carrito (y `null` al desmontarse la escena). */
  onSnapshot?: (take: TakeSnapshot | null) => void
}

/**
 * Lo que leen las pruebas en desarrollo, sin acoplarlas a three: cuadros dibujados, ángulo y la separación de los pisos que
 * recibe el modelo (siempre 0 desde D90: el scroll ya no los separa).
 */
type Probe = { frames: number; angle: number; separation: number; elevation: number; scale: number }

function writeProbe(el: HTMLElement, probe: Probe, angle: number, separation: number, elevation: number, scale: number) {
  probe.frames += 1
  el.dataset.frames = String(probe.frames)
  const shownAngle = Math.round(angle)
  const shownSeparation = Math.round(separation * 100) / 100
  const shownElevation = Math.round(elevation)
  const shownScale = Math.round(scale)
  if (shownAngle !== probe.angle) el.dataset.angle = String(shownAngle)
  if (shownSeparation !== probe.separation) el.dataset.separation = String(shownSeparation)
  if (shownElevation !== probe.elevation) el.dataset.elevation = String(shownElevation)
  if (shownScale !== probe.scale) el.dataset.scale = String(shownScale)
  probe.angle = shownAngle
  probe.separation = shownSeparation
  probe.elevation = shownElevation
  probe.scale = shownScale
}

/** Coloca la cámara: la escala del mockup (100 px por unidad a 600 px de alto) y el plato al 70% de la caja. */
function frameCamera(camera: PerspectiveCamera, width: number, height: number, framing: SceneFraming) {
  const box = Math.max(1, height)
  const pxPerUnit = Math.max(1, framing.scale * Math.min((100 * box) / framing.height, (100 * width) / framing.width))
  const visibleHeight = height / pxPerUnit
  const plateFromCenter = (framing.plate * box - height / 2) / pxPerUnit
  const elevation = (CAMERA_ELEVATION * Math.PI) / 180
  const target = new Vector3(0, plateFromCenter, 0)
  camera.fov = (2 * Math.atan(visibleHeight / 2 / CAMERA_DISTANCE) * 180) / Math.PI
  camera.position.set(0, target.y + CAMERA_DISTANCE * Math.sin(elevation), CAMERA_DISTANCE * Math.cos(elevation))
  camera.lookAt(target)
  camera.updateProjectionMatrix()
}

/**
 * El encuadre a lo que se dibuja (`fitPlate`): la cámara va casi el doble de lejos que la de la portada, con un ángulo más cerrado,
 * para que la perspectiva casi no agrande lo de adelante y el objeto llene la caja sin recortarse; el aire que queda a los lados y
 * arriba es solo el de la perspectiva que sí hay.
 */
const FIT_DISTANCE = 20
const FIT_MARGIN = { width: 1.06, top: 1.06 }

/**
 * Coloca la cámara a `elevationDeg` grados (15°, la de la portada, para un pastel; la de su foto para un postre) para que lo que se
 * dibuja llene la caja (D95): la escala más grande con la que cabe a lo ancho y, con su base a `plate` del alto de la caja, también
 * arriba. La base proyectada queda justo en `plate`: la vista del plano
 * vertical de la cámara de un punto es `(y - centro) · cos(elevación) - z · sen(elevación)`, y `viewExtent` da el borde de abajo.
 */
function fitCamera(camera: PerspectiveCamera, width: number, height: number, content: Content, plate: number, elevationDeg: number, topMargin = FIT_MARGIN.top) {
  const box = Math.max(1, height)
  const { top, bottom, halfWidth } = viewExtent(content, elevationDeg)
  const scale = Math.max(1, Math.min(width / (2 * halfWidth * FIT_MARGIN.width), (plate * box) / ((top - bottom) * topMargin)))
  const elevation = (elevationDeg * Math.PI) / 180
  const centerY = (bottom + ((plate - 0.5) * box) / scale) / Math.cos(elevation)
  camera.fov = (2 * Math.atan(box / scale / 2 / FIT_DISTANCE) * 180) / Math.PI
  camera.position.set(0, centerY + FIT_DISTANCE * Math.sin(elevation), FIT_DISTANCE * Math.cos(elevation))
  camera.lookAt(0, centerY, 0)
  camera.updateProjectionMatrix()
}

/** El encuadre de la vista libre: píxeles por unidad y altura (en la escena) del punto al que mira la cámara. */
type FreeView = { scale: number; centerY: number }

/**
 * Coloca la cámara de la vista libre y dice si todavía se acerca a su encuadre. La escala es la de un pastel grande de un
 * piso en esta caja (siempre la misma, así uno chico se ve chico y uno grande, grande) y solo baja cuando el pastel no cabe
 * con ella, a esa elevación; el punto al que mira deja al pastel con su base centrado en vertical. Con `animate`, la
 * escala y el centro se acercan al nuevo encuadre en vez de saltar.
 */
function stepFreeCamera(camera: PerspectiveCamera, box: { width: number; height: number }, view: FreeView, content: Content, reference: Content, elevation: number, dt: number, animate: boolean) {
  const scale = Math.min(fitScale(reference, box, ELEVATION.initial), fitScale(content, box, elevation))
  const centerY = lookAtHeight(content, elevation)
  if (view.scale === 0 || !animate) {
    view.scale = scale
    view.centerY = centerY
  } else {
    view.scale = approach(view.scale, scale, dt, FREE_FRAMING_RESPONSE)
    view.centerY = approach(view.centerY, centerY, dt, FREE_FRAMING_RESPONSE)
  }
  const settled = Math.abs(view.scale - scale) < 0.05 && Math.abs(view.centerY - centerY) < 0.0005
  if (settled) {
    view.scale = scale
    view.centerY = centerY
  }
  const angle = (elevation * Math.PI) / 180
  camera.fov = (2 * Math.atan(box.height / view.scale / 2 / CAMERA_DISTANCE) * 180) / Math.PI
  camera.position.set(0, view.centerY + CAMERA_DISTANCE * Math.sin(angle), CAMERA_DISTANCE * Math.cos(angle))
  camera.lookAt(0, view.centerY, 0)
  camera.updateProjectionMatrix()
  return !settled
}

/** Sombra de contacto: un degradado radial en `mermelada`, sin mapas de sombra. */
function contactShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const hex = brandColor('mermelada')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.2)`)
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.1)`)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * Dónde va la sombra de contacto: bajo el pie de la base, con la escala del plato (que crece con el piso de abajo), o bajo la charola
 * de un pastel de la casa, un poco más ancha que ella.
 */
function shadowPlacement(shape: CakeShape): { y: number; scale: number } {
  if (shape.board && !shape.stand) return { y: PLATE_GAP - BOARD.thickness - 0.005, scale: (boardRadius(shape) * 1.15) / 1.8 }
  const plate = standScale(shape)
  return { y: -0.815 * plate, scale: plate }
}

function ContactShadow({ y, scale }: { y: number; scale: number }) {
  const texture = useMemo(() => contactShadowTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} scale={scale}>
      <planeGeometry args={[3.6, 3.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * Vuelve a encuadrar cada vez que cambia el tamaño del lienzo o lo que se dibuja. Sin encuadre fijo (vista libre), no hace nada; con
 * `fit`, encuadra a lo que se dibuja (`fitCamera`).
 */
function useFraming(framing: SceneFraming | null, fit: { content: Content; plate: number; elevation: number; top?: number } | null) {
  const get = useThree((state) => state.get)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const fitContent = fit?.content
  const fitPlate = fit?.plate
  const fitElevation = fit?.elevation ?? CAMERA_ELEVATION
  const fitTop = fit?.top
  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera
    if (fitContent && fitPlate !== undefined) fitCamera(camera, size.width, size.height, fitContent, fitPlate, fitElevation, fitTop)
    else if (framing) frameCamera(camera, size.width, size.height, framing)
    else return
    invalidate()
  }, [fitContent, fitElevation, fitPlate, fitTop, framing, get, invalidate, size.height, size.width])
}

/**
 * Luz suave de ambiente (cielo `betun`, rebote `nata`) y una principal arriba a la izquierda, como el sombreado del prototipo: la
 * cara iluminada queda en el color del token y la opuesta, un poco más oscura. La comparten esta escena y la de las imágenes fijas
 * del catálogo (`CakeStill.tsx`), así el pastel se ve igual en las dos.
 */
export function SceneLights() {
  return (
    <>
      <hemisphereLight args={[brandColor('betun'), brandColor('nata'), 2.6]} />
      <directionalLight color={brandColor('betun')} intensity={1.1} position={[-3, 5, 4]} />
    </>
  )
}

type RigProps = {
  shape: SceneShape
  measured: Measure
  running: boolean
  spin: RefObject<Spin>
  tilt: RefObject<Tilt>
  container: RefObject<HTMLDivElement | null>
  reducedMotion: boolean
  onReady: () => void
  framing: SceneFraming
  fitPlate?: number
  freeLook: boolean
  /** Si el pastel gira solo; con `false` se queda donde está (la vista superior del paso 7). */
  autoSpin: boolean
  onSnapshot?: (take: TakeSnapshot | null) => void
}

function Rig({ shape, measured, running, spin, tilt, container, reducedMotion, onReady, framing, fitPlate, freeLook, autoSpin, onSnapshot }: RigProps) {
  const cake = useRef<Group>(null)
  const motion = useRef<CakeMotion>({ separation: 0 })
  const probe = useRef<Probe>({ frames: 0, angle: NaN, separation: NaN, elevation: NaN, scale: NaN })
  const freeView = useRef<FreeView>({ scale: 0, centerY: 0 })
  const { content, reference, shadow } = measured
  const ready = useRef(false)
  // El primer cuadro tras una pausa (o el primero de todos) trae un intervalo enorme; solo ese se acota.
  const resumed = useRef(true)
  const lastFrameAt = useRef(0)
  const idleTimer = useRef<number | null>(null)
  const invalidate = useThree((state) => state.invalidate)
  // Al reanudar, al montar o al cambiar "reducir movimiento" se pide el primer cuadro; el resto lo pide cada cuadro. El cuadro se pide en el
  // siguiente requestAnimationFrame, cuando react-three-fiber ya aplicó el cambio de `frameloop`.
  useEffect(() => {
    if (!running) return
    resumed.current = true
    const kick = requestAnimationFrame(() => invalidate())
    return () => {
      cancelAnimationFrame(kick)
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }, [running, reducedMotion, invalidate])
  useFraming(
    freeLook ? null : framing,
    !freeLook && fitPlate !== undefined
      ? { content, plate: measured.fit?.plate ?? fitPlate, elevation: measured.elevation, top: measured.fit?.top }
      : null,
  )
  useSnapshot(onSnapshot, cake, content)

  useFrame((state, delta) => {
    lastFrameAt.current = performance.now()
    const dt = resumed.current ? Math.min(delta, 0.05) : delta
    resumed.current = false
    const s = spin.current
    const moving = stepSpin(s, dt, !reducedMotion && autoSpin)
    const t = tilt.current
    stepTilt(t, dt, !reducedMotion, TILT.timeConstant)
    // En la vista libre la cámara sube y baja con la elevación y se encuadra al pastel.
    const reframing = freeLook && stepFreeCamera(state.camera as PerspectiveCamera, state.size, freeView.current, content, reference, s.elevation, dt, !reducedMotion)
    const yaw = ((s.angle + t.x * TILT.yaw) * Math.PI) / 180
    if (cake.current) {
      cake.current.rotation.y = yaw
      cake.current.rotation.x = (t.y * TILT.pitch * Math.PI) / 180
    }
    // La escena siempre usa `frameloop="demand"`: cada cuadro decide si pide otro. Con "reducir movimiento", solo
    // mientras algo se mueve por un gesto. Si no, a la tasa completa mientras la persona mueve el pastel y a unos 30 por
    // segundo para el giro solo. El scroll de la página no mueve la escena (D90: los pisos ya no se separan).
    if (reducedMotion) {
      if (moving || reframing) invalidate()
    } else if (running) {
      if (reframing || needsFullRate(s, t, autoSpin)) invalidate()
      else if (autoSpin && idleTimer.current === null) {
        // El temporizador pide el cuadro y este llega en el siguiente refresco: sin margen, caería justo después
        // del refresco de los 33 ms y esperaría al de los 50 (unos 20 fps). Con 6 ms de margen alcanza el de 33.
        const wait = Math.max(0, IDLE_FRAME_MS - IDLE_FRAME_MARGIN_MS - (performance.now() - lastFrameAt.current))
        idleTimer.current = window.setTimeout(() => {
          idleTimer.current = null
          invalidate()
        }, wait)
      }
    }
    if (!ready.current) {
      ready.current = true
      onReady()
    }
    // Solo en desarrollo: en producción este bloque no existe.
    if (import.meta.env.DEV && container.current) writeProbe(container.current, probe.current, s.angle, motion.current.separation, s.elevation, freeView.current.scale)
  })

  return (
    <>
      <SceneLights />
      <group ref={cake}>
        {isDessert(shape) ? <DessertModel shape={shape} /> : <CakeModel shape={shape} motion={motion} animateColors={!reducedMotion} animateSize={!reducedMotion} />}
      </group>
      <ContactShadow y={shadow.y} scale={shadow.scale} />
    </>
  )
}

/**
 * Da a `onSnapshot` la función que toma la miniatura (tanda 4). Dibuja un cuadro aparte, en un recuadro de la esquina de abajo
 * del lienzo, con el pastel de frente al ángulo fijo de `SNAPSHOT_VIEW` y la cámara encuadrada a ese recuadro, lo copia en la
 * misma tarea y vuelve a dibujar la vista de la persona antes de que el navegador muestre nada: no se ve ningún salto. No
 * depende de `frameloop` (con "reducir movimiento" o fuera de pantalla no hay cuadros pedidos) ni de `preserveDrawingBuffer`.
 */
function useSnapshot(onSnapshot: RigProps['onSnapshot'], cake: RefObject<Group | null>, content: Content) {
  const get = useThree((state) => state.get)
  useEffect(() => {
    if (!onSnapshot) return
    onSnapshot(() => {
      const { gl, scene, camera, size } = get()
      const group = cake.current
      const lens = camera as PerspectiveCamera
      const side = Math.floor(Math.min(size.width, size.height))
      if (!group || side < 32) return null
      const saved = { rotation: group.rotation.clone(), position: lens.position.clone(), quaternion: lens.quaternion.clone(), fov: lens.fov, aspect: lens.aspect }
      try {
        group.rotation.set(0, (SNAPSHOT_VIEW.angle * Math.PI) / 180, 0)
        lens.aspect = 1
        // Encuadrado al pastel mismo, no a la escala de un pastel grande: en 100 px, uno chico también se ve completo y grande.
        stepFreeCamera(lens, { width: side, height: side }, { scale: 0, centerY: 0 }, content, content, SNAPSHOT_VIEW.elevation, 0, false)
        gl.setViewport(0, 0, side, side)
        gl.render(scene, lens)
        const ratio = gl.getPixelRatio()
        // El recuadro de WebGL empieza abajo a la izquierda; el de `drawImage`, arriba.
        return encodeThumbnail(gl.domElement, { x: 0, y: (size.height - side) * ratio, side: side * ratio }, brandColor('harina'))
      } catch (error) {
        console.warn('No se pudo tomar la miniatura del pastel; entra al pedido sin ella.', error)
        return null
      } finally {
        group.rotation.copy(saved.rotation)
        lens.position.copy(saved.position)
        lens.quaternion.copy(saved.quaternion)
        lens.fov = saved.fov
        lens.aspect = saved.aspect
        lens.updateProjectionMatrix()
        gl.setViewport(0, 0, size.width, size.height)
        try {
          gl.render(scene, lens)
        } catch (error) {
          // El contexto se perdió a media captura: la escena ya lo avisa con `webglcontextlost`.
          console.warn('No se pudo volver a dibujar la vista previa tras la miniatura.', error)
        }
      }
    })
    return () => onSnapshot(null)
  }, [onSnapshot, get, cake, content])
}

/**
 * La escena del pastel: un contenedor enfocable con el lienzo de react-three-fiber. El contenedor recibe el
 * puntero y el teclado; el lienzo no (no hay objetos con eventos, así no hay raycasting en cada movimiento).
 */
export default function CakeScene({
  shape,
  label,
  describedBy,
  reducedMotion,
  running,
  onReady,
  onContextLost,
  onKeyboardFocusChange,
  onFocusEscape,
  framing: framingProp,
  fitPlate,
  freeLook = false,
  viewpoint,
  onColor = false,
  onSnapshot,
}: CakeSceneProps) {
  const baseFraming = framingProp ?? FRAME
  const measured = useMemo(() => measure(shape), [shape])
  const onBoard = !freeLook && measured.footprint > 0
  const framing = useMemo(
    () => (onBoard ? boardFraming(baseFraming, measured.footprint, framingProp !== undefined) : baseFraming),
    [baseFraming, framingProp, measured.footprint, onBoard],
  )
  const container = useRef<HTMLDivElement>(null)
  const spin = useRef(createSpin(viewpoint?.angle ?? INITIAL_ANGLE, viewpoint?.elevation ?? ELEVATION.initial))
  const tilt = useRef<Tilt>(createTilt())
  const invalidateRef = useRef<() => void>(() => {})
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Cada gesto pide un cuadro enseguida; ese cuadro ve que hay movimiento y sigue a la tasa completa.
  const redraw = () => invalidateRef.current()

  // Al cambiar de paso, la cámara se acomoda al nuevo punto de vista: con el mismo paso suave de las flechas, o de golpe con
  // "reducir movimiento". El primer punto de vista ya es el inicial del giro.
  const shownViewpoint = useRef(viewpoint?.key)
  const viewpointKey = viewpoint?.key
  const latestViewpoint = useRef(viewpoint)
  useLayoutEffect(() => {
    latestViewpoint.current = viewpoint
  })
  useEffect(() => {
    const target = latestViewpoint.current
    if (!target || shownViewpoint.current === viewpointKey) return
    shownViewpoint.current = viewpointKey
    const s = spin.current
    // El camino más corto hacia el giro pedido, sin dar vueltas de más.
    const turn = target.angle === null ? 0 : ((((target.angle - s.angle - s.pending) % 360) + 540) % 360) - 180
    if (reducedMotion) {
      s.angle += s.pending + turn
      s.pending = 0
      s.elevation = target.elevation
      s.pendingElevation = 0
    } else {
      s.pending += turn
      s.pendingElevation = target.elevation - s.elevation
    }
    redraw()
  }, [viewpointKey, reducedMotion])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Un segundo dedo no toma el pastel a medio arrastre.
    if (spin.current.dragging) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startDrag(spin.current, event.pointerId, event.clientX, event.timeStamp, freeLook ? { y: event.clientY, touch: event.pointerType === 'touch' } : undefined)
    redraw()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // La vista libre no se inclina hacia el puntero: el arrastre ya mueve los dos ejes.
    if (!freeLook && event.pointerType === 'mouse' && !reducedMotion) {
      const el = event.currentTarget
      aimTilt(tilt.current, (event.nativeEvent.offsetX / el.clientWidth - 0.5) * 2, (event.nativeEvent.offsetY / el.clientHeight - 0.5) * 2)
      redraw()
    }
    if (!spin.current.dragging) return
    moveDrag(spin.current, event.pointerId, event.clientX, event.timeStamp, event.clientY)
    redraw()
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    endDrag(spin.current, event.pointerId, event.timeStamp, !reducedMotion)
    redraw()
  }
  // Una cancelación (el navegador tomó el gesto, por ejemplo para hacer scroll) no deja inercia: el pastel se queda.
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    endDrag(spin.current, event.pointerId, event.timeStamp, false)
    redraw()
  }
  const onPointerLeave = () => {
    aimTilt(tilt.current, 0, 0)
    redraw()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const vertical = freeLook && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && !vertical) return
    event.preventDefault()
    if (vertical) nudgeElevation(spin.current, event.key === 'ArrowUp' ? 1 : -1, !reducedMotion)
    else nudge(spin.current, event.key === 'ArrowRight' ? 1 : -1, !reducedMotion)
    redraw()
  }

  const frameloop = running ? 'demand' : 'never'

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      tabIndex={0}
      data-running={import.meta.env.DEV ? String(running) : undefined}
      data-tiers={import.meta.env.DEV ? String(isDessert(shape) ? 0 : shape.tiers.length) : undefined}
      data-board={import.meta.env.DEV ? String(!isDessert(shape) && Boolean(shape.board)) : undefined}
      data-decoration={import.meta.env.DEV ? (isDessert(shape) ? 'none' : (shape.decoration?.kind ?? 'none')) : undefined}
      data-dessert={import.meta.env.DEV ? (isDessert(shape) ? shape.kind : 'none') : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      onFocus={(event) => onKeyboardFocusChange?.(event.currentTarget.matches(':focus-visible'))}
      onBlur={() => onKeyboardFocusChange?.(false)}
      className={`relative h-full w-full cursor-grab touch-pan-y touch-pinch-zoom select-none rounded-lg active:cursor-grabbing ${onColor ? focusRingOnColor : focusRing}`}
    >
      <Canvas
        aria-hidden="true"
        frameloop={frameloop}
        dpr={[1, 2]}
        flat
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ near: 1, far: 30 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: 'auto', height: 'auto', pointerEvents: 'none' }}
        onCreated={({ gl, invalidate }) => {
          invalidateRef.current = invalidate
          gl.domElement.addEventListener(
            'webglcontextlost',
            () => {
              // Al desmontar, react-three-fiber suelta el contexto a propósito: eso no es una falla.
              if (!mounted.current) return
              // El foco no se pierde en `<body>` cuando la escena desaparece.
              if (container.current?.contains(document.activeElement)) onFocusEscape?.()
              onContextLost()
            },
            { once: true },
          )
        }}
      >
        <Rig
          shape={shape}
          measured={measured}
          running={running}
          spin={spin}
          tilt={tilt}
          container={container}
          reducedMotion={reducedMotion}
          onReady={onReady}
          framing={framing}
          fitPlate={fitPlate}
          freeLook={freeLook}
          autoSpin={viewpoint?.autoSpin ?? true}
          onSnapshot={freeLook ? onSnapshot : undefined}
        />
      </Canvas>
    </div>
  )
}
