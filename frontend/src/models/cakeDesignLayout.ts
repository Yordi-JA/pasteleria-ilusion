/**
 * El acomodo del mensaje y de la oblea sobre la tapa del último piso (paso 7, regla 6.2 y 6.3, D55). Solo tipos,
 * valores iniciales y la validación de lo guardado en el borrador: la geometría está en `viewmodels/lidGeometry.ts`.
 *
 * Las posiciones (`x`, `y`) van relativas al radio de la parte plana de la tapa del último piso (sin el canto redondeado del
 * piso, `TIER_EDGE_UNITS`), con `y` hacia arriba en la vista superior; los giros,
 * en grados, positivos hacia la derecha (como las manecillas del reloj); las medidas de la oblea, en centímetros. Son
 * los mismos números que el servidor revisa (`backend/core_pasteleria/services/design_layout.py`).
 */

export type WaferShape = 'sheet' | 'circle'

export type WaferLayout = {
  shape: WaferShape
  /** En un círculo, el diámetro (ancho y alto valen lo mismo). */
  widthCm: number
  heightCm: number
  rotation: number
  x: number
  y: number
  /** Encuadre de la imagen: 1 la cubre justo; más acerca. `imageX` e `imageY` (de -1 a 1) la desplazan. */
  imageZoom: number
  imageX: number
  imageY: number
}

/** De dónde sale el color del texto: `auto` es negro; `tones`, `deep` o `light` de la cobertura; `list`, un color suyo. */
export type MessageColorMode = 'auto' | 'tones' | 'list'
export type MessageColor = { mode: MessageColorMode; value: string | null }
export type MessageArrangement = 'straight' | 'arc'

export type MessageLayout = {
  text: string
  color: MessageColor
  arrangement: MessageArrangement
  /** Con `arc`: positivo, el texto sube en el centro (como un arco); negativo, baja. Nunca cerca de 0. */
  curve: number
  /** Alto de la letra respecto al radio de la parte plana de la tapa. */
  scale: number
  rotation: number
  x: number
  y: number
}

/** Cotas técnicas (las mismas del servidor) contra datos alterados; no son reglas de negocio. */
export const LAYOUT_BOUNDS = {
  messageMaxLength: 80,
  waferMinCm: 2,
  waferMaxCm: 100,
  position: 10,
  rotation: 180,
  imageZoom: { min: 1, max: 4 },
  messageScale: { min: 0.05, max: 1.5 },
  minArcCurve: 0.05,
} as const

/** La palabra de "tono" que acepta el servidor para el color del texto. */
export type ToneValue = 'deep' | 'light'
export const TONE_VALUES: readonly ToneValue[] = ['deep', 'light']

export function defaultMessage(): MessageLayout {
  return {
    text: '',
    color: { mode: 'auto', value: null },
    arrangement: 'straight',
    curve: 0.5,
    scale: 0.22,
    rotation: 0,
    x: 0,
    y: 0,
  }
}

const SLUG = /^[-a-zA-Z0-9_]+$/
// El mismo criterio que el servidor (`design_layout.has_unsafe_characters`), por categoría Unicode y no por una lista de rangos:
// control (Cc), formato (Cf: ZWJ, U+202E, U+00AD, etiquetas), sustitutos (Cs), uso privado (Co), sin asignar (Cn) y separadores
// de línea y de párrafo (Zl, Zp), más los caracteres que se ven en blanco o no pintan nada (rellenos de hangul, braille vacío,
// junta de grafemas, vocales inherentes del jemer y selectores mongoles; los que son marcas van fuera de la clase de caracteres). Los dos lados coinciden salvo en Cn: lo "sin asignar"
// depende de la versión de Unicode de cada motor (Python 3.11 trae la 14, el navegador una más nueva), así que un carácter
// asignado hace poco, como un emoji nuevo, pasa aquí y el servidor lo rechaza. El servidor manda: no se afloja allá.
const UNSAFE_CHAR = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u3164\u115f\u1160\uffa0\u2800]|\u{34f}|\u{17b4}|\u{17b5}|\u{180b}|\u{180c}|\u{180d}|\u{180e}|\u{180f}/gu
// Más de dos marcas combinantes (Mn y Me) seguidas apilan el texto sobre las líneas de arriba y de abajo: sobran.
const COMBINING_EXCESS = /([\p{Mn}\p{Me}]{2})[\p{Mn}\p{Me}]+/gu

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

/**
 * El texto del mensaje sin lo que no se puede imprimir (ver `UNSAFE_CHAR`), con a lo más dos marcas combinantes seguidas y
 * recortado a 80 caracteres. Quita casi todo lo que el servidor rechazaría (con la salvedad de `UNSAFE_CHAR` sobre Cn).
 */
export function cleanMessageText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const printable = value.replace(UNSAFE_CHAR, '').replace(COMBINING_EXCESS, '$1')
  return [...printable].slice(0, LAYOUT_BOUNDS.messageMaxLength).join('')
}

/**
 * El canto redondeado de arriba de cada piso, en unidades de escena. La oblea y el mensaje no llegan a él: sobresaldrían del
 * pastel. Lo usan la escena y la geometría de la tapa, para que el editor y la vista previa coincidan.
 */
export const TIER_EDGE_UNITS = 0.06

const bounded = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value))

/** Una oblea con sus números dentro de las cotas técnicas, sin ajustarla a la carta ni a la tapa (eso lo hace quien la dibuja). */
export function boundWafer(wafer: WaferLayout): WaferLayout {
  const { waferMinCm, waferMaxCm, position, rotation, imageZoom } = LAYOUT_BOUNDS
  const size = (cm: number) => Math.min(waferMaxCm, Math.max(waferMinCm, cm))
  const widthCm = size(wafer.widthCm)
  return {
    ...wafer,
    widthCm,
    heightCm: wafer.shape === 'circle' ? widthCm : size(wafer.heightCm),
    rotation: bounded(wafer.rotation, rotation),
    x: bounded(wafer.x, position),
    y: bounded(wafer.y, position),
    imageZoom: Math.min(imageZoom.max, Math.max(imageZoom.min, wafer.imageZoom)),
    imageX: bounded(wafer.imageX, 1),
    imageY: bounded(wafer.imageY, 1),
  }
}

/** Un mensaje con sus números dentro de las cotas técnicas, sin ajustarlo a la tapa. */
export function boundMessage(message: MessageLayout): MessageLayout {
  const { position, rotation, messageScale, minArcCurve } = LAYOUT_BOUNDS
  const curve = bounded(message.curve, 1)
  return {
    ...message,
    scale: Math.min(messageScale.max, Math.max(messageScale.min, message.scale)),
    curve: Math.abs(curve) < minArcCurve ? minArcCurve * (curve < 0 ? -1 : 1) : curve,
    rotation: bounded(message.rotation, rotation),
    x: bounded(message.x, position),
    y: bounded(message.y, position),
  }
}

function parseColor(data: unknown): MessageColor {
  const auto: MessageColor = { mode: 'auto', value: null }
  if (typeof data !== 'object' || data === null) return auto
  const { mode, value } = data as Record<string, unknown>
  if (mode === 'tones' && (value === 'deep' || value === 'light')) return { mode, value }
  if (mode === 'list' && typeof value === 'string' && SLUG.test(value) && value.length <= 80) return { mode, value }
  return auto
}

/** Valida un mensaje guardado campo por campo; lo que no sirve toma el valor inicial. */
export function parseMessage(data: unknown): MessageLayout {
  const base = defaultMessage()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return base
  const raw = data as Record<string, unknown>
  const curve = finite(raw.curve, -1, 1)
  return {
    text: cleanMessageText(raw.text),
    color: parseColor(raw.color),
    arrangement: raw.arrangement === 'arc' ? 'arc' : 'straight',
    curve: curve !== null && Math.abs(curve) >= LAYOUT_BOUNDS.minArcCurve ? curve : base.curve,
    scale: finite(raw.scale, LAYOUT_BOUNDS.messageScale.min, LAYOUT_BOUNDS.messageScale.max) ?? base.scale,
    rotation: finite(raw.rotation, -LAYOUT_BOUNDS.rotation, LAYOUT_BOUNDS.rotation) ?? base.rotation,
    x: finite(raw.x, -LAYOUT_BOUNDS.position, LAYOUT_BOUNDS.position) ?? base.x,
    y: finite(raw.y, -LAYOUT_BOUNDS.position, LAYOUT_BOUNDS.position) ?? base.y,
  }
}

/** Valida una oblea guardada; con algo que no sirve devuelve `null` y se vuelve a acomodar desde cero. */
export function parseWafer(data: unknown): WaferLayout | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const raw = data as Record<string, unknown>
  const { waferMinCm, waferMaxCm, position, rotation, imageZoom } = LAYOUT_BOUNDS
  const widthCm = finite(raw.widthCm, waferMinCm, waferMaxCm)
  const heightCm = finite(raw.heightCm, waferMinCm, waferMaxCm)
  const x = finite(raw.x, -position, position)
  const y = finite(raw.y, -position, position)
  const turn = finite(raw.rotation, -rotation, rotation)
  const zoom = finite(raw.imageZoom, imageZoom.min, imageZoom.max)
  const imageX = finite(raw.imageX, -1, 1)
  const imageY = finite(raw.imageY, -1, 1)
  if ([widthCm, heightCm, x, y, turn, zoom, imageX, imageY].includes(null)) return null
  if (raw.shape !== 'sheet' && raw.shape !== 'circle') return null
  const shape: WaferShape = raw.shape
  return {
    shape,
    widthCm: widthCm as number,
    heightCm: shape === 'circle' ? (widthCm as number) : (heightCm as number),
    rotation: turn as number,
    x: x as number,
    y: y as number,
    imageZoom: zoom as number,
    imageX: imageX as number,
    imageY: imageY as number,
  }
}

/** Dónde se dibuja la imagen dentro de la oblea, en cm respecto al centro de su caja (con `y` hacia abajo, como el SVG). */
export type ImagePlacement = { x: number; y: number; width: number; height: number }

/**
 * El encuadre de la imagen: con `zoom` 1 la cubre justo (sin huecos); más acerca. `panX` y `panY` (de -1 a 1) la
 * desplazan dentro de lo que sobra, sin dejar huecos: con 1 pega el borde de la imagen al de la oblea.
 */
export function imagePlacement(image: { width: number; height: number }, box: { width: number; height: number }, zoom: number, panX: number, panY: number): ImagePlacement {
  const scale = Math.max(box.width / image.width, box.height / image.height) * zoom
  const [width, height] = [image.width * scale, image.height * scale]
  const [spareX, spareY] = [(width - box.width) / 2, (height - box.height) / 2]
  return { x: panX * spareX - width / 2, y: panY * spareY - height / 2, width, height }
}
