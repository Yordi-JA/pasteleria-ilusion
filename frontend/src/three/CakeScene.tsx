import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import { focusRing, focusRingOnColor } from '../components/focus.ts'
import CakeModel from './CakeModel.tsx'
import type { CakeMotion } from './CakeModel.tsx'
import type { CakeShape, Viewpoint } from './cakeShape.ts'
import { contentOf, fitScale, lookAtHeight, referenceContent, standScale } from './cakeMetrics.ts'
import type { Content } from './cakeMetrics.ts'
import { brandColor } from './palette.ts'
import {
  aimTilt,
  approach,
  clamp,
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
 * hay inercia, un paso de flecha, inclinación o scroll, se dibuja a la tasa completa de la pantalla.
 */
const IDLE_FRAME_MS = 33
const IDLE_FRAME_MARGIN_MS = 6
/** Píxeles de scroll en los que los pisos se separan por completo (380 en el mockup). */
const SEPARATION_SCROLL = 380
/**
 * El lienzo sube estos píxeles por encima de la caja del pastel para que el piso de arriba no se corte cuando los pisos se
 * separan. La caja (y el diseño) no cambia: el lienzo no recibe el puntero y es transparente.
 */
const OVERFLOW_TOP = 72
/**
 * El plato queda al 70% de la altura de la caja y el pastel cabe en 560 × 600 px, como el mockup. `scale` iguala el
 * tamaño de la captura (`001-Main.jpg`): la perspectiva de CSS 3D del prototipo lo dibuja algo más chico.
 */
const FRAME = { plate: 0.7, width: 560, height: 600, scale: 0.88 }

/**
 * Encuadre de la escena: dónde queda el plato (fracción del alto de la caja), qué caja en px del mockup debe caber, a
 * qué escala y cuántos px sube el lienzo sobre la caja. Sin él, el de la portada.
 */
export type SceneFraming = typeof FRAME & { overflowTop: number }

const HERO_FRAMING: SceneFraming = { ...FRAME, overflowTop: OVERFLOW_TOP }

/**
 * El mismo encuadre sin sobresalir: sin pisos que se separen con el scroll (el catálogo, D59), el lienzo no sube los
 * 72 px de la portada y no se sale de su sección.
 */
const IN_BOX_FRAMING: SceneFraming = { ...FRAME, overflowTop: 0 }

/** Constante de tiempo (s) con la que la cámara de la vista libre se acerca a su encuadre cuando cambia el pastel. */
const FREE_FRAMING_RESPONSE = 0.1

export type CakeSceneProps = {
  shape: CakeShape
  /** Nombre accesible de la escena. */
  label: string
  /** `id` del texto que describe cómo girarlo (`aria-describedby`). */
  describedBy?: string
  reducedMotion: boolean
  /** Falso cuando la escena no se ve o la pestaña está oculta: no se dibuja ningún cuadro. */
  running: boolean
  /** Los pisos se separan con el scroll (solo en la portada). */
  separateOnScroll: boolean
  onReady: () => void
  onContextLost: () => void
  /** Avisa si la escena tiene el foco del teclado (`:focus-visible`), para cambiar la pista visible. */
  onKeyboardFocusChange?: (keyboard: boolean) => void
  /** Si la escena tiene el foco cuando se pierde el contexto, lo pasa a otro control antes de desaparecer. */
  onFocusEscape?: () => void
  /** Encuadre propio; sin él, el de la portada (o `IN_BOX_FRAMING` sin `separateOnScroll`). Con `freeLook` no se usa. */
  framing?: SceneFraming
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
}

/** Lo que leen las pruebas en desarrollo, sin acoplarlas a three: cuadros dibujados, ángulo y separación. */
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
  const box = Math.max(1, height - framing.overflowTop)
  const pxPerUnit = Math.max(1, framing.scale * Math.min((100 * box) / framing.height, (100 * width) / framing.width))
  const visibleHeight = height / pxPerUnit
  const plateFromCenter = (framing.overflowTop + framing.plate * box - height / 2) / pxPerUnit
  const elevation = (CAMERA_ELEVATION * Math.PI) / 180
  const target = new Vector3(0, plateFromCenter, 0)
  camera.fov = (2 * Math.atan(visibleHeight / 2 / CAMERA_DISTANCE) * 180) / Math.PI
  camera.position.set(0, target.y + CAMERA_DISTANCE * Math.sin(elevation), CAMERA_DISTANCE * Math.cos(elevation))
  camera.lookAt(target)
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

/** `scale` sigue al plato de la base cuando crece con el piso de abajo. */
function ContactShadow({ scale }: { scale: number }) {
  const texture = useMemo(() => contactShadowTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.815 * scale} scale={scale}>
      <planeGeometry args={[3.6, 3.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Vuelve a encuadrar cada vez que cambia el tamaño del lienzo. Sin encuadre fijo (vista libre), no hace nada. */
function useFraming(framing: SceneFraming | null) {
  const get = useThree((state) => state.get)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  useLayoutEffect(() => {
    if (!framing) return
    frameCamera(get().camera as PerspectiveCamera, size.width, size.height, framing)
    invalidate()
  }, [framing, get, invalidate, size.height, size.width])
}

type RigProps = {
  shape: CakeShape
  running: boolean
  spin: RefObject<Spin>
  tilt: RefObject<Tilt>
  container: RefObject<HTMLDivElement | null>
  reducedMotion: boolean
  separateOnScroll: boolean
  onReady: () => void
  framing: SceneFraming
  freeLook: boolean
  /** Si el pastel gira solo; con `false` se queda donde está (la vista superior del paso 7). */
  autoSpin: boolean
}

function Rig({ shape, running, spin, tilt, container, reducedMotion, separateOnScroll, onReady, framing, freeLook, autoSpin }: RigProps) {
  const cake = useRef<Group>(null)
  const motion = useRef<CakeMotion>({ separation: 0 })
  const probe = useRef<Probe>({ frames: 0, angle: NaN, separation: NaN, elevation: NaN, scale: NaN })
  const freeView = useRef<FreeView>({ scale: 0, centerY: 0 })
  const content = useMemo(() => contentOf(shape), [shape])
  const reference = useMemo(() => referenceContent(shape), [shape])
  const plate = standScale(shape)
  const ready = useRef(false)
  // El primer cuadro tras una pausa (o el primero de todos) trae un intervalo enorme; solo ese se acota.
  const resumed = useRef(true)
  const lastSeparation = useRef(0)
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
  useFraming(freeLook ? null : framing)

  useFrame((state, delta) => {
    lastFrameAt.current = performance.now()
    const dt = resumed.current ? Math.min(delta, 0.05) : delta
    resumed.current = false
    const s = spin.current
    const moving = stepSpin(s, dt, !reducedMotion && autoSpin)
    const t = tilt.current
    stepTilt(t, dt, !reducedMotion, TILT.timeConstant)
    // El scroll se lee aquí, dentro del cuadro que ya se dibuja por el giro: sin escuchar el evento `scroll`, sin
    // medir el diseño (leer `scrollY` no fuerza un reflow) y sin escribir en el DOM. Solo mueve la escena WebGL.
    const separation = separateOnScroll && !reducedMotion ? clamp(window.scrollY / SEPARATION_SCROLL, 0, 1) : 0
    // En la vista libre la cámara sube y baja con la elevación y se encuadra al pastel.
    const reframing = freeLook && stepFreeCamera(state.camera as PerspectiveCamera, state.size, freeView.current, content, reference, s.elevation, dt, !reducedMotion)
    const yaw = ((s.angle + t.x * TILT.yaw) * Math.PI) / 180
    motion.current.separation = separation
    if (cake.current) {
      cake.current.rotation.y = yaw
      cake.current.rotation.x = (t.y * TILT.pitch * Math.PI) / 180
    }
    // La escena siempre usa `frameloop="demand"`: cada cuadro decide si pide otro. Con "reducir movimiento", solo
    // mientras algo se mueve por un gesto. Si no, a la tasa completa mientras la persona mueve el pastel (o la
    // página, por la separación) y a unos 30 por segundo para el giro solo.
    const scrolled = Math.abs(separation - lastSeparation.current) > 0.0005
    lastSeparation.current = separation
    if (reducedMotion) {
      if (moving || reframing) invalidate()
    } else if (running) {
      if (scrolled || reframing || needsFullRate(s, t, autoSpin)) invalidate()
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
    if (import.meta.env.DEV && container.current) writeProbe(container.current, probe.current, s.angle, separation, s.elevation, freeView.current.scale)
  })

  return (
    <>
      {/* Luz suave de ambiente (cielo `betun`, rebote `nata`) y una principal arriba a la izquierda, como el
          sombreado del prototipo: la cara iluminada queda en el color del token y la opuesta, un poco más oscura. */}
      <hemisphereLight args={[brandColor('betun'), brandColor('nata'), 2.6]} />
      <directionalLight color={brandColor('betun')} intensity={1.1} position={[-3, 5, 4]} />
      <group ref={cake}>
        <CakeModel shape={shape} motion={motion} animateColors={!reducedMotion} animateSize={!reducedMotion} />
      </group>
      <ContactShadow scale={plate} />
    </>
  )
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
  separateOnScroll,
  onReady,
  onContextLost,
  onKeyboardFocusChange,
  onFocusEscape,
  framing: framingProp,
  freeLook = false,
  viewpoint,
  onColor = false,
}: CakeSceneProps) {
  const framing = framingProp ?? (separateOnScroll ? HERO_FRAMING : IN_BOX_FRAMING)
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
        style={{ position: 'absolute', top: freeLook ? 0 : -framing.overflowTop, right: 0, bottom: 0, left: 0, width: 'auto', height: 'auto', pointerEvents: 'none' }}
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
          running={running}
          spin={spin}
          tilt={tilt}
          container={container}
          reducedMotion={reducedMotion}
          separateOnScroll={separateOnScroll}
          onReady={onReady}
          framing={framing}
          freeLook={freeLook}
          autoSpin={viewpoint?.autoSpin ?? true}
        />
      </Canvas>
    </div>
  )
}
