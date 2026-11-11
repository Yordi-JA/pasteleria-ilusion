/**
 * La imagen de "Otra decoración" (paso 6, D53). Por ahora solo se revisa y se muestra en el navegador: todavía no hay
 * dónde guardarla en producción ni el endpoint del pedido (Etapa 4), así que no se sube. Aquí vive la revisión previa;
 * la definitiva la hará el servidor abriendo el archivo (`backend/AGENTS.md`, "Subidas"): lo que se revisa aquí solo
 * evita mostrar algo que no es una imagen o que puede agotar la memoria del navegador al decodificarla.
 */

/** Tipos que acepta la pastelería para imágenes de clientes: JPG, PNG y WebP. */
export const DECORATION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * Tamaño máximo en el navegador: 5 MB, el mismo que `backend/AGENTS.md` ("Subidas", D31) fija al inicio para las
 * imágenes de "otra decoración". Las reglas de negocio no lo dicen: es una propuesta que la pastelería debe confirmar
 * (`docs/pendientes.md`); cuando exista el endpoint, el límite saldrá de la configuración del admin.
 */
export const DECORATION_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const DECORATION_IMAGE_MAX_MB = DECORATION_IMAGE_MAX_BYTES / (1024 * 1024)

/** Límites de píxeles: un archivo chico puede decodificarse en cientos de MB (una "bomba de descompresión"). */
export const DECORATION_IMAGE_MAX_SIDE = 12_000
export const DECORATION_IMAGE_MAX_PIXELS = 40_000_000

/** Se lee la cabecera en un trozo de 64 KB; un JPEG con metadatos muy grandes puede pedir hasta 1 MB. */
const HEADER_BYTES = 65_536
const HEADER_BYTES_JPEG_LONG = 1_048_576

const MAX_FILE_NAME = 120

export type ImageProblem = 'type' | 'size' | 'empty' | 'signature' | 'unreadable' | 'dimensions'

/** Qué le pasa a la imagen elegida por su tipo declarado y su tamaño, o `null`. Es la primera revisión, sin leer bytes. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): ImageProblem | null {
  if (!(DECORATION_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size <= 0) return 'empty'
  return file.size > DECORATION_IMAGE_MAX_BYTES ? 'size' : null
}

type Dimensions = { width: number; height: number }

const be16 = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1]
const be32 = (bytes: Uint8Array, at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
const le24 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
const ascii = (bytes: Uint8Array, at: number, text: string) => [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0))

/** PNG: la firma y el bloque IHDR, que va primero y trae el ancho y el alto. */
function pngSize(bytes: Uint8Array): Dimensions | null | 'other' {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 8 || !signature.every((byte, i) => bytes[i] === byte)) return 'other'
  return bytes.length >= 24 && ascii(bytes, 12, 'IHDR') ? { width: be32(bytes, 16), height: be32(bytes, 20) } : null
}

/** JPEG: recorre los segmentos hasta el de inicio de cuadro (SOF), que trae la altura y el ancho. */
function jpegSize(bytes: Uint8Array): Dimensions | null | 'other' {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return 'other'
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    if (marker === 0xff) {
      at += 1
      continue
    }
    // SOF0 a SOF15, menos DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return at + 9 <= bytes.length ? { height: be16(bytes, at + 5), width: be16(bytes, at + 7) } : null
    }
    // Fin de imagen o de cabecera sin haber visto el tamaño.
    if (marker === 0xd9 || marker === 0xda) return null
    // Sin longitud: TEM (01) y los reinicios y el inicio de imagen (D0 a D8) miden solo sus 2 bytes.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2
      continue
    }
    at += 2 + be16(bytes, at + 2)
  }
  return null
}

/** WebP: contenedor RIFF con un bloque VP8 (con pérdida), VP8L (sin pérdida) o VP8X (extendido). */
function webpSize(bytes: Uint8Array): Dimensions | null | 'other' {
  if (bytes.length < 12 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return 'other'
  if (ascii(bytes, 12, 'VP8X') && bytes.length >= 30) return { width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 }
  if (ascii(bytes, 12, 'VP8L') && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (ascii(bytes, 12, 'VP8 ') && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff }
  }
  return null
}

/** El ancho y el alto de la cabecera, `null` si no se pudieron leer y `'other'` si no es JPEG, PNG ni WebP. */
export function imageSize(bytes: Uint8Array): Dimensions | null | 'other' {
  for (const read of [pngSize, jpegSize, webpSize]) {
    const size = read(bytes)
    if (size !== 'other') return size
  }
  return 'other'
}

/**
 * Revisa lo que dice el contenido, no el tipo que declara el navegador: la firma de JPEG, PNG o WebP y, con el ancho y
 * el alto de la cabecera, que no pase de 12 000 px por lado ni de 40 megapíxeles. Lee solo un trozo del archivo.
 */
export async function inspectImage(file: Blob): Promise<ImageProblem | null> {
  let size: ReturnType<typeof imageSize>
  try {
    let bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer())
    size = imageSize(bytes)
    // Un JPEG con metadatos grandes (miniaturas, perfiles de color) deja el tamaño más allá del primer trozo.
    if (size === null && bytes.length === HEADER_BYTES && bytes[0] === 0xff) {
      bytes = new Uint8Array(await file.slice(0, HEADER_BYTES_JPEG_LONG).arrayBuffer())
      size = imageSize(bytes)
    }
  } catch {
    // El archivo cambió o se borró después de elegirlo (`NotReadableError`): no se puede leer.
    return 'unreadable'
  }
  if (size === 'other') return 'signature'
  if (size === null || size.width < 1 || size.height < 1) return 'unreadable'
  const tooLong = size.width > DECORATION_IMAGE_MAX_SIDE || size.height > DECORATION_IMAGE_MAX_SIDE
  return tooLong || size.width * size.height > DECORATION_IMAGE_MAX_PIXELS ? 'dimensions' : null
}

/** La frase para quien eligió una imagen que no sirve. */
export function imageProblemMessage(problem: ImageProblem): string {
  switch (problem) {
    case 'type':
      return 'Esa imagen no es JPG, PNG ni WebP. Elige otra.'
    case 'empty':
      return 'Ese archivo está vacío. Elige otra imagen.'
    case 'size':
      return `La imagen pesa más de ${DECORATION_IMAGE_MAX_MB} MB. Elige una más ligera.`
    case 'signature':
      return 'Ese archivo no es una imagen JPG, PNG ni WebP, aunque lo parezca. Elige otra.'
    case 'unreadable':
      return 'No pudimos leer el tamaño de esa imagen. Elige otra.'
    case 'dimensions':
      return 'Esa imagen tiene demasiados píxeles (más de 12 000 por lado o 40 megapíxeles). Elige una más chica.'
  }
}

/**
 * Un nombre de archivo para mostrar: sin caracteres de control ni de formato (como U+202E, que invierte el texto) ni
 * separadores de línea (salvo U+200D, que une emojis), recortado a 120 caracteres y sin espacios en los extremos. El nombre original no se guarda ni se usa para nada más que mostrarlo.
 */
export function displayFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // Se conserva U+200D (ZWJ): une los emojis compuestos y no cambia el sentido del texto como U+202E.
  const cleaned = value.replace(/(?!\u200d)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
  // Un nombre hecho solo de ZWJ queda invisible.
  if (!cleaned.replace(/[\u200d\s]/gu, '')) return null
  const shown = [...cleaned].slice(0, MAX_FILE_NAME).join('').trim()
  return shown || null
}
