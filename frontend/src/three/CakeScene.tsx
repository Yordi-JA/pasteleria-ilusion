import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import { focusRing } from '../components/focus.ts'
import CakeModel from './CakeModel.tsx'
import type { CakeMotion } from './CakeModel.tsx'
import type { CakeShape } from './cakeShape.ts'
import { brandColor } from './palette.ts'
import { aimTilt, clamp, createSpin, createTilt, endDrag, moveDrag, needsFullRate, nudge, startDrag, stepSpin, stepTilt } from './spin.ts'
import type { Spin, Tilt } from './spin.ts'

/** La cámara mira desde unos 15° arriba, el ángulo de las fotos del catálogo (libro de marca). */
const CAMERA_ELEVATION = 15
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
 * El lienzo sube estos píxeles por encima de la caja del pastel para que la vela no se corte cuando los pisos se
 * separan. La caja (y el diseño) no cambia: el lienzo no recibe el puntero y es transparente.
 */
const OVERFLOW_TOP = 72
/**
 * El plato queda al 70% de la altura de la caja y el pastel cabe en 560 × 600 px, como el mockup. `scale` iguala el
 * tamaño de la captura (`001-Main.jpg`): la perspectiva de CSS 3D del prototipo lo dibuja algo más chico.
 */
const FRAME = { plate: 0.7, width: 560, height: 600, scale: 0.88 }

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
}

/** Lo que leen las pruebas en desarrollo, sin acoplarlas a three: cuadros dibujados, ángulo y separación. */
type Probe = { frames: number; angle: number; separation: number }

function writeProbe(el: HTMLElement, probe: Probe, angle: number, separation: number) {
  probe.frames += 1
  el.dataset.frames = String(probe.frames)
  const shownAngle = Math.round(angle)
  const shownSeparation = Math.round(separation * 100) / 100
  if (shownAngle !== probe.angle) el.dataset.angle = String(shownAngle)
  if (shownSeparation !== probe.separation) el.dataset.separation = String(shownSeparation)
  probe.angle = shownAngle
  probe.separation = shownSeparation
}

/** Coloca la cámara: la escala del mockup (100 px por unidad a 600 px de alto) y el plato al 70% de la caja. */
function frameCamera(camera: PerspectiveCamera, width: number, height: number) {
  const box = Math.max(1, height - OVERFLOW_TOP)
  const pxPerUnit = Math.max(1, FRAME.scale * Math.min((100 * box) / FRAME.height, (100 * width) / FRAME.width))
  const visibleHeight = height / pxPerUnit
  const plateFromCenter = (OVERFLOW_TOP + FRAME.plate * box - height / 2) / pxPerUnit
  const elevation = (CAMERA_ELEVATION * Math.PI) / 180
  const target = new Vector3(0, plateFromCenter, 0)
  camera.fov = (2 * Math.atan(visibleHeight / 2 / CAMERA_DISTANCE) * 180) / Math.PI
  camera.position.set(0, target.y + CAMERA_DISTANCE * Math.sin(elevation), CAMERA_DISTANCE * Math.cos(elevation))
  camera.lookAt(target)
  camera.updateProjectionMatrix()
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

function ContactShadow() {
  const texture = useMemo(() => contactShadowTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.815}>
      <planeGeometry args={[3.6, 3.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Vuelve a encuadrar cada vez que cambia el tamaño del lienzo. */
function useFraming() {
  const get = useThree((state) => state.get)
  const size = useThree((state) => state.size)
  useLayoutEffect(() => {
    frameCamera(get().camera as PerspectiveCamera, size.width, size.height)
  }, [get, size.height, size.width])
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
}

function Rig({ shape, running, spin, tilt, container, reducedMotion, separateOnScroll, onReady }: RigProps) {
  const cake = useRef<Group>(null)
  const motion = useRef<CakeMotion>({ separation: 0, yaw: 0 })
  const probe = useRef<Probe>({ frames: 0, angle: NaN, separation: NaN })
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
  useFraming()

  useFrame((_, delta) => {
    lastFrameAt.current = performance.now()
    const dt = resumed.current ? Math.min(delta, 0.05) : delta
    resumed.current = false
    const s = spin.current
    const moving = stepSpin(s, dt, !reducedMotion)
    const t = tilt.current
    stepTilt(t, dt, !reducedMotion, TILT.timeConstant)
    // El scroll se lee aquí, dentro del cuadro que ya se dibuja por el giro: sin escuchar el evento `scroll`, sin
    // medir el diseño (leer `scrollY` no fuerza un reflow) y sin escribir en el DOM. Solo mueve la escena WebGL.
    const separation = separateOnScroll && !reducedMotion ? clamp(window.scrollY / SEPARATION_SCROLL, 0, 1) : 0
    const yaw = ((s.angle + t.x * TILT.yaw) * Math.PI) / 180
    motion.current.separation = separation
    motion.current.yaw = yaw
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
      if (moving) invalidate()
    } else if (running) {
      if (scrolled || needsFullRate(s, t, true)) invalidate()
      else if (idleTimer.current === null) {
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
    if (import.meta.env.DEV && container.current) writeProbe(container.current, probe.current, s.angle, separation)
  })

  return (
    <>
      {/* Luz suave de ambiente (cielo `betun`, rebote `nata`) y una principal arriba a la izquierda, como el
          sombreado del prototipo: la cara iluminada queda en el color del token y la opuesta, un poco más oscura. */}
      <hemisphereLight args={[brandColor('betun'), brandColor('nata'), 2.6]} />
      <directionalLight color={brandColor('betun')} intensity={1.1} position={[-3, 5, 4]} />
      <group ref={cake}>
        <CakeModel shape={shape} motion={motion} flicker={!reducedMotion} />
      </group>
      <ContactShadow />
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
}: CakeSceneProps) {
  const container = useRef<HTMLDivElement>(null)
  const spin = useRef(createSpin(INITIAL_ANGLE))
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

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Un segundo dedo no toma el pastel a medio arrastre.
    if (spin.current.dragging) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startDrag(spin.current, event.pointerId, event.clientX, event.timeStamp)
    redraw()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && !reducedMotion) {
      const el = event.currentTarget
      aimTilt(tilt.current, (event.nativeEvent.offsetX / el.clientWidth - 0.5) * 2, (event.nativeEvent.offsetY / el.clientHeight - 0.5) * 2)
      redraw()
    }
    if (!spin.current.dragging) return
    moveDrag(spin.current, event.pointerId, event.clientX, event.timeStamp)
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
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    nudge(spin.current, event.key === 'ArrowRight' ? 1 : -1, !reducedMotion)
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
      className={`relative h-full w-full cursor-grab touch-pan-y touch-pinch-zoom select-none rounded-lg active:cursor-grabbing ${focusRing}`}
    >
      <Canvas
        aria-hidden="true"
        frameloop={frameloop}
        dpr={[1, 2]}
        flat
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ near: 1, far: 30 }}
        style={{ position: 'absolute', top: -OVERFLOW_TOP, right: 0, bottom: 0, left: 0, width: 'auto', height: 'auto', pointerEvents: 'none' }}
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
        />
      </Canvas>
    </div>
  )
}
