/**
 * Borrador de "Diseña tu pastel": lo que la persona lleva elegido. Vive en `sessionStorage` (una pestaña, mientras
 * siga abierta) para que recargar la página no borre el avance; no es el pedido ni guarda precios. Leer y escribir
 * va en `try/catch`: con el almacenamiento bloqueado o lleno, el borrador sigue en memoria; con datos dañados, se
 * empieza de nuevo.
 */

import type { CakeSizeCode } from './cakeDesign.ts'
import { normalizeHex } from './color.ts'
import { defaultMessage, parseMessage, parseWafer } from './cakeDesignLayout.ts'
import type { MessageLayout, WaferLayout } from './cakeDesignLayout.ts'
import { displayFileName } from './decorationImage.ts'
import { parseOccasion } from './occasion.ts'
import type { Occasion } from './occasion.ts'
import { ownerClaim, parseOwner } from './owner.ts'
import type { OwnerClaim } from './owner.ts'

export type CakeForm = 'round' | 'rectangular'

/**
 * El pastel de vitrina de "Personalizar este pastel" (tanda 2): su `slug`, su nombre y las personas que rinde su completo. Con él,
 * el tipo, el pan y el relleno son los del producto y no se cambian.
 */
export type DesignSource = { slug: string; name: string; servings: number | null }

export type CakeDesignDraft = {
  people: number
  /**
   * El tamaño que la persona eligió en el paso 1 (tanda 2). `null` mientras no elige: con las personas basta cuando solo un
   * tamaño las rinde. El tamaño que vale lo decide `effectiveSize` (`viewmodels/cakeSizes.ts`).
   */
  cakeSize: CakeSizeCode | null
  /** El pastel de vitrina del que parte (`null` si se arma desde cero). */
  source: DesignSource | null
  form: CakeForm
  tiers: number
  cakeType: string | null
  bread: string | null
  fillingBase: string | null
  /** "Un sabor" (1) o "Dos sabores" (2); solo cuenta con una base que admite más de uno. */
  flavorCount: 1 | 2
  flavors: string[]
  /**
   * El color de la cobertura: `#rrggbb` en minúsculas, libre. `null` mientras no se confirma el paso 5: ahí vale el primero de la
   * lista de la pastelería. Un borrador viejo trae el `slug` de un color de la lista; `migrateLegacyColors` lo cambia por su
   * código al cargar las opciones.
   */
  coverageColor: string | null
  /**
   * El peinado lateral de la cobertura (tanda 4): surcos horizontales en los costados. Va por omisión; un borrador de antes, sin
   * este campo, lo lleva.
   */
  sideComb: boolean
  /** La decoración o el diseño elegido en el paso 6 (su identificador). */
  decoration: string | null
  /** Color de la decoración con duya o de rosas: `#rrggbb` en minúsculas, o `null` si es automático. */
  decorationColor: string | null
  /**
   * Nombre de la imagen de "Otra decoración". La imagen solo vive en la memoria de la pestaña (todavía no hay dónde
   * guardarla, D53): al recargar queda el nombre y se pide elegirla otra vez.
   */
  decorationImageName: string | null
  /** Si lleva mensaje (regla 6.2) y cómo se acomoda; el mensaje no cuesta. */
  messageEnabled: boolean
  message: MessageLayout
  /** Si lleva oblea (regla 6.3, con su precio) y cómo se acomoda; `null` hasta que se acomoda la primera vez. */
  waferEnabled: boolean
  wafer: WaferLayout | null
  /**
   * Nombre de la imagen de la oblea. Igual que la de "Otra decoración", la imagen solo vive en la memoria de la pestaña
   * mientras se arma el pastel (D55): al recargar queda el nombre y se pide elegirla otra vez.
   */
  waferImageName: string | null
  /** La ocasión del pastel (regla 6.4): opcional, no cambia el precio. */
  occasion: Occasion | null
  /** Pasos que la persona ya confirmó con "Continuar". Un paso está completo si es válido y está aquí. */
  confirmed: number[]
  /**
   * La huella del pastel del carrito que se está editando ("Editar pedido", D66): al agregar este, ese sale del carrito.
   * `null` en un diseño nuevo.
   */
  replaces: string | null
  /**
   * La cuenta que lo armó (tanda 5): la marca de `ownerMarker` (`owner.ts`), nunca el correo. `null` en uno armado sin
   * cuenta, que pasa a la primera cuenta con que se entra (`claimDraft`).
   */
  owner: string | null
}

export const DRAFT_STORAGE_KEY = 'ilusion.cakeDesign.v1'

/** Personas con que abre el paso 1, como el mockup (`CotizadorPersonas`). Es un punto de partida, no un límite. */
export const INITIAL_PEOPLE = 40
/** Tope técnico contra datos alterados; el máximo real lo fija `limits.max_online_kg` de la API. */
export const MAX_PEOPLE_INPUT = 9999
const MAX_STEPS = 8
const SLUG = /^[-a-zA-Z0-9_]+$/
const MAX_FLAVORS = 2
const SIZE_CODES = new Set<unknown>(['by_weight', 'showcase', 'mini'])
// `max_length` del nombre de un producto.
const MAX_SOURCE_NAME = 80

export function emptyDraft(): CakeDesignDraft {
  return {
    people: INITIAL_PEOPLE,
    cakeSize: null,
    source: null,
    form: 'round',
    tiers: 1,
    cakeType: null,
    bread: null,
    fillingBase: null,
    flavorCount: 1,
    flavors: [],
    coverageColor: null,
    sideComb: true,
    decoration: null,
    decorationColor: null,
    decorationImageName: null,
    messageEnabled: false,
    message: defaultMessage(),
    waferEnabled: false,
    wafer: null,
    waferImageName: null,
    occasion: null,
    confirmed: [],
    replaces: null,
    owner: null,
  }
}

function slugOrNull(value: unknown): string | null {
  return typeof value === 'string' && SLUG.test(value) && value.length <= 80 ? value : null
}

/** Un color guardado: `#rrggbb` o, en un borrador viejo, el `slug` de la lista de la pastelería (que se migra al cargar las opciones). */
function colorOrLegacy(value: unknown): string | null {
  return normalizeHex(value) ?? slugOrNull(value)
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null
}

function sizeOrNull(value: unknown): CakeSizeCode | null {
  return SIZE_CODES.has(value) ? (value as CakeSizeCode) : null
}

/** El pastel de vitrina de origen, o `null` si lo guardado no tiene la forma esperada. */
function sourceOrNull(value: unknown): DesignSource | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const slug = slugOrNull(raw.slug)
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!slug || !name || name.length > MAX_SOURCE_NAME) return null
  return { slug, name, servings: wholeNumber(raw.servings, 1, MAX_PEOPLE_INPUT) }
}

/** Valida un borrador guardado campo por campo; lo que no sirve toma el valor inicial. */
export function parseDraft(data: unknown): CakeDesignDraft {
  const draft = emptyDraft()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return draft
  const raw = data as Record<string, unknown>
  const flavors = Array.isArray(raw.flavors) ? raw.flavors.map(slugOrNull).filter((f): f is string => f !== null) : []
  const confirmed = Array.isArray(raw.confirmed)
    ? raw.confirmed.map((step) => wholeNumber(step, 1, MAX_STEPS)).filter((step): step is number => step !== null)
    : []
  return {
    people: wholeNumber(raw.people, 1, MAX_PEOPLE_INPUT) ?? draft.people,
    cakeSize: sizeOrNull(raw.cakeSize),
    source: sourceOrNull(raw.source),
    form: raw.form === 'rectangular' ? 'rectangular' : 'round',
    tiers: wholeNumber(raw.tiers, 1, 10) ?? draft.tiers,
    cakeType: slugOrNull(raw.cakeType),
    bread: slugOrNull(raw.bread),
    fillingBase: slugOrNull(raw.fillingBase),
    flavorCount: raw.flavorCount === 2 ? 2 : 1,
    flavors: [...new Set(flavors)].slice(0, MAX_FLAVORS),
    coverageColor: colorOrLegacy(raw.coverageColor),
    sideComb: raw.sideComb !== false,
    decoration: slugOrNull(raw.decoration),
    decorationColor: colorOrLegacy(raw.decorationColor),
    decorationImageName: displayFileName(raw.decorationImageName),
    messageEnabled: raw.messageEnabled === true,
    message: parseMessage(raw.message),
    waferEnabled: raw.waferEnabled === true,
    wafer: parseWafer(raw.wafer),
    waferImageName: displayFileName(raw.waferImageName),
    occasion: parseOccasion(raw.occasion),
    confirmed: [...new Set(confirmed)].sort((a, b) => a - b),
    replaces: typeof raw.replaces === 'string' && raw.replaces.length <= 40 ? slugOrNull(raw.replaces) : null,
    owner: parseOwner(raw.owner),
  }
}

/** Los pasos que un pastel ya armado tiene confirmados: todos menos la revisión. */
const ARMED_STEPS = [1, 2, 3, 4, 5, 6, 7]

/**
 * El borrador de un pastel que ya está en el carrito ("Editar pedido", D66), a partir de lo que guardó la línea
 * (`designSnapshot`). Pasa por `parseDraft`, así lo que no sirva toma su valor inicial. Las imágenes no viajan: viven en
 * `IndexedDB` con la línea, y el diseñador pide elegirlas otra vez. `owner` es la cuenta dueña del carrito (tanda 5): el
 * pastel de otra cuenta no pasa a la siguiente que entra por abrirlo sin sesión.
 */
export function draftFromDesign(snapshot: Record<string, unknown>, designId: string, owner: string | null = null): CakeDesignDraft {
  const flavors = Array.isArray(snapshot.flavors) ? snapshot.flavors : []
  const message = snapshot.message
  const wafer = snapshot.wafer
  return parseDraft({
    ...snapshot,
    flavorCount: flavors.length === 2 ? 2 : 1,
    messageEnabled: typeof message === 'object' && message !== null,
    message: message ?? undefined,
    waferEnabled: typeof wafer === 'object' && wafer !== null,
    confirmed: ARMED_STEPS,
    replaces: designId,
    owner,
  })
}

export function readDraft(): CakeDesignDraft {
  try {
    const stored = window.sessionStorage.getItem(DRAFT_STORAGE_KEY)
    return stored ? parseDraft(JSON.parse(stored)) : emptyDraft()
  } catch {
    // Almacenamiento bloqueado o JSON dañado: se empieza de nuevo, en memoria.
    return emptyDraft()
  }
}

/** Guarda el borrador; devuelve `false` si el navegador no lo permitió (sigue en memoria). */
export function writeDraft(draft: CakeDesignDraft): boolean {
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/**
 * Borra el borrador guardado: el pastel ya está a salvo en su línea del carrito, o la sesión se cerró (tanda 4). La siguiente
 * visita a "Diseña tu pastel" empieza de cero.
 */
export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // Sin almacenamiento no hay borrador guardado que borrar.
  }
}

/** Qué pasa con el borrador cuando entra la cuenta `owner` (`ownerClaim`). */
export function draftClaim(draft: CakeDesignDraft, owner: string): OwnerClaim {
  return ownerClaim(draft.owner, owner)
}

/**
 * El borrador que ve la cuenta `owner`: el mismo objeto si ya es suyo; con su marca si se armó sin cuenta (quien diseña y
 * luego entra para pagar no lo pierde); vacío si es de otra cuenta, que nunca se muestra a esta.
 */
export function claimDraft(draft: CakeDesignDraft, owner: string): CakeDesignDraft {
  const claim = draftClaim(draft, owner)
  if (claim === 'keep') return draft
  return claim === 'adopt' ? { ...draft, owner } : { ...emptyDraft(), owner }
}

/**
 * Aplica `claimDraft` al borrador guardado cuando entra la cuenta `owner`, aunque "Diseña tu pastel" no esté abierto: el de otra
 * cuenta se borra y uno sin cuenta queda con su marca. Sin borrador guardado no escribe nada.
 */
export function claimStoredDraft(owner: string): void {
  try {
    if (window.sessionStorage.getItem(DRAFT_STORAGE_KEY) === null) return
  } catch {
    // Sin almacenamiento no hay borrador guardado que revisar.
    return
  }
  const draft = readDraft()
  const claim = draftClaim(draft, owner)
  if (claim === 'discard') clearDraft()
  else if (claim === 'adopt') writeDraft(claimDraft(draft, owner))
}

/** Los colores de la lista de la pastelería, con los que se cambia un `slug` viejo por su código. */
type ColorReference = { slug: string; previewColor: string }

/**
 * Cambia por su código `#rrggbb` los colores que un borrador viejo guardó como `slug` de la lista (cobertura, decoración y
 * mensaje). Un `slug` que ya no está en la lista se descarta: la decoración vuelve a "automático", el mensaje a "negro" y la
 * cobertura se vuelve a confirmar. Devuelve el mismo objeto si no hay nada que migrar.
 */
export function migrateLegacyColors(draft: CakeDesignDraft, references: readonly ColorReference[]): CakeDesignDraft {
  const isLegacy = (value: string | null): value is string => value !== null && normalizeHex(value) === null
  const hexOf = (slug: string) => normalizeHex(references.find((reference) => reference.slug === slug)?.previewColor)
  const message = draft.message.color
  const legacyMessage = message.mode === 'custom' && isLegacy(message.value)
  if (!isLegacy(draft.coverageColor) && !isLegacy(draft.decorationColor) && !legacyMessage) return draft
  let next = draft
  if (isLegacy(draft.coverageColor)) {
    const coverageColor = hexOf(draft.coverageColor)
    next = { ...next, coverageColor, confirmed: coverageColor ? next.confirmed : next.confirmed.filter((step) => step !== 5) }
  }
  if (isLegacy(draft.decorationColor)) next = { ...next, decorationColor: hexOf(draft.decorationColor) }
  if (legacyMessage && message.value) {
    const hex = hexOf(message.value)
    next = { ...next, message: { ...next.message, color: hex ? { mode: 'custom', value: hex } : { mode: 'auto', value: null } } }
  }
  return next
}
