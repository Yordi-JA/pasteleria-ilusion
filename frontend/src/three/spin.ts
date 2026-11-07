/**
 * Giro del pastel, sin three ni React: el estado y sus pasos son funciones puras sobre un objeto mutable que la
 * escena guarda en un `ref` (cambia en cada cuadro y no debe provocar renders). Ángulos en grados, sin dar la vuelta
 * (360 sigue en 361), para que una prueba pueda comparar antes y después.
 */
export type Spin = {
  angle: number
  /** Velocidad en grados por segundo; tras soltar el arrastre conserva la del dedo y se frena hacia el giro solo. */
  velocity: number
  /** Grados que faltan de los pasos de las flechas; se recorren con una aproximación suave e interrumpible. */
  pending: number
  /** Sentido del último giro con el dedo: el giro solo sigue en ese sentido. Empieza hacia la derecha. */
  direction: 1 | -1
  dragging: boolean
  /** Si el arrastre ya pasó el umbral horizontal; antes de eso el pastel no gira (puede ser un scroll vertical). */
  engaged: boolean
  pointerId: number | null
  startX: number
  lastX: number
  lastTime: number
  /** Muestras recientes del arrastre, para estimar la velocidad en una ventana de tiempo y no en un solo evento. */
  samples: { angle: number; time: number }[]
}

export const SPIN = {
  /** Giro solo, como el mockup: 7 grados por segundo. */
  autoSpeed: 7,
  /** Medio grado por píxel arrastrado, como el mockup. */
  degreesPerPixel: 0.5,
  /** Píxeles horizontales antes de que el arrastre gire el pastel. */
  dragThreshold: 4,
  /** Un paso de flecha. */
  keyStep: 15,
  /** Tope de la velocidad al soltar, para que un tirón no lo deje girando como trompo. */
  maxVelocity: 540,
  /** Constante de tiempo (s) con la que la inercia vuelve al giro solo. */
  friction: 0.45,
  /** Constante de tiempo (s) del paso de flecha: llega casi entero en unos 200 ms. */
  keyResponse: 0.06,
  /** Ventana (ms) en la que se mide la velocidad del dedo, y el mínimo de tiempo que debe cubrir para medirla. */
  velocityWindowMs: 80,
  minVelocitySpanMs: 16,
  /** Si el dedo se quedó quieto más que esto antes de soltar, no hay inercia. */
  releaseWindowMs: 80,
} as const

export function createSpin(angle: number): Spin {
  return {
    angle,
    velocity: 0,
    pending: 0,
    direction: 1,
    dragging: false,
    engaged: false,
    pointerId: null,
    startX: 0,
    lastX: 0,
    lastTime: 0,
    samples: [],
  }
}

/** Atrapar el pastel detiene en seco la inercia y el paso pendiente: el giro sigue al dedo desde donde está. */
export function startDrag(spin: Spin, pointerId: number, x: number, time: number) {
  spin.dragging = true
  spin.engaged = false
  spin.pointerId = pointerId
  spin.startX = x
  spin.lastX = x
  spin.lastTime = time
  spin.velocity = 0
  spin.angle += spin.pending
  spin.pending = 0
  spin.samples = [{ angle: spin.angle, time }]
}

/**
 * El giro sigue al puntero 1:1 una vez pasado el umbral (lo recorrido dentro del umbral no cuenta, para que no
 * salte). La velocidad sale de las muestras de los últimos 80 ms; si cubren menos de 16 ms, queda la anterior.
 */
export function moveDrag(spin: Spin, pointerId: number, x: number, time: number) {
  if (!spin.dragging || spin.pointerId !== pointerId) return
  if (!spin.engaged) {
    const offset = x - spin.startX
    if (Math.abs(offset) < SPIN.dragThreshold) return
    spin.engaged = true
    spin.lastX = spin.startX + Math.sign(offset) * SPIN.dragThreshold
  }
  const delta = (x - spin.lastX) * SPIN.degreesPerPixel
  spin.angle += delta
  if (delta !== 0) spin.direction = delta > 0 ? 1 : -1
  spin.lastX = x
  spin.lastTime = time
  spin.samples.push({ angle: spin.angle, time })
  spin.samples = spin.samples.filter((sample) => time - sample.time <= SPIN.velocityWindowMs)
  const oldest = spin.samples[0]
  const span = time - oldest.time
  if (span >= SPIN.minVelocitySpanMs) spin.velocity = ((spin.angle - oldest.angle) * 1000) / span
}

/** Al soltar, la velocidad del dedo pasa a la inercia; sin inercia (reducir movimiento o cancelación) se queda. */
export function endDrag(spin: Spin, pointerId: number, time: number, inertia: boolean) {
  if (!spin.dragging || spin.pointerId !== pointerId) return
  spin.dragging = false
  spin.pointerId = null
  const still = time - spin.lastTime > SPIN.releaseWindowMs
  spin.velocity = inertia && spin.engaged && !still ? clamp(spin.velocity, -SPIN.maxVelocity, SPIN.maxVelocity) : 0
  spin.samples = []
}

/** Un paso de flecha. Con animación se suma a lo pendiente (pulsar varias veces acumula); sin ella, salta. */
export function nudge(spin: Spin, direction: 1 | -1, animate: boolean) {
  if (animate) spin.pending += direction * SPIN.keyStep
  else spin.angle += direction * SPIN.keyStep
}

/**
 * Avanza el giro `dt` segundos. Con `auto`, la velocidad tiende al giro solo en el sentido del último giro (la
 * inercia se frena hacia él sin corte ni reversa); sin `auto`, tiende a cero. La integración es exacta para el
 * frenado exponencial, así no depende de los cuadros por segundo. Devuelve si algo sigue moviéndose.
 */
export function stepSpin(spin: Spin, dt: number, auto: boolean): boolean {
  if (spin.dragging) return false
  const rest = auto ? SPIN.autoSpeed * spin.direction : 0
  const excess = spin.velocity - rest
  const decay = Math.exp(-dt / SPIN.friction)
  spin.angle += rest * dt + excess * SPIN.friction * (1 - decay)
  spin.velocity = rest + excess * decay
  if (!auto && Math.abs(spin.velocity) < 0.5) spin.velocity = 0
  if (spin.pending !== 0) {
    const remaining = spin.pending * Math.exp(-dt / SPIN.keyResponse)
    const done = Math.abs(remaining) < 0.01
    spin.angle += done ? spin.pending : spin.pending - remaining
    spin.pending = done ? 0 : remaining
  }
  return spin.velocity !== 0 || spin.pending !== 0
}

/** Inclinación hacia el puntero: el puntero pone el destino (de -1 a 1) y la inclinación lo sigue suave. */
export type Tilt = { targetX: number; targetY: number; x: number; y: number }

export function createTilt(): Tilt {
  return { targetX: 0, targetY: 0, x: 0, y: 0 }
}

export function aimTilt(tilt: Tilt, x: number, y: number) {
  tilt.targetX = clamp(x, -1, 1)
  tilt.targetY = clamp(y, -1, 1)
}

/** Sigue al destino con una constante de tiempo; sin animación se queda derecho. */
export function stepTilt(tilt: Tilt, dt: number, animate: boolean, timeConstant: number) {
  tilt.x = animate ? approach(tilt.x, tilt.targetX, dt, timeConstant) : 0
  tilt.y = animate ? approach(tilt.y, tilt.targetY, dt, timeConstant) : 0
}

/**
 * Si algo que mueve la persona sigue en marcha: el arrastre, la inercia (la velocidad aún lejos del giro solo), un
 * paso de flecha o la inclinación hacia el puntero. Mientras tanto la escena dibuja a la tasa completa de la
 * pantalla; si no, el giro solo basta con unos 30 cuadros por segundo.
 */
export function needsFullRate(spin: Spin, tilt: Tilt, auto: boolean): boolean {
  const rest = auto ? SPIN.autoSpeed * spin.direction : 0
  return (
    spin.dragging ||
    spin.pending !== 0 ||
    Math.abs(spin.velocity - rest) > 0.5 ||
    Math.abs(tilt.targetX - tilt.x) > 0.002 ||
    Math.abs(tilt.targetY - tilt.y) > 0.002
  )
}

/** Se acerca a `target` con una constante de tiempo, sin depender de los cuadros por segundo. */
export function approach(current: number, target: number, dt: number, timeConstant: number): number {
  return target + (current - target) * Math.exp(-dt / timeConstant)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
