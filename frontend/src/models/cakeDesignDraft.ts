/**
 * Borrador de "Diseña tu pastel": lo que la persona lleva elegido. Vive en `sessionStorage` (una pestaña, mientras
 * siga abierta) para que recargar la página no borre el avance; no es el pedido ni guarda precios. Leer y escribir
 * va en `try/catch`: con el almacenamiento bloqueado o lleno, el borrador sigue en memoria; con datos dañados, se
 * empieza de nuevo.
 */

import { normalizeHex } from './color.ts'
import { defaultMessage, parseMessage, parseWafer } from './cakeDesignLayout.ts'
import type { MessageLayout, WaferLayout } from './cakeDesignLayout.ts'
import { displayFileName } from './decorationImage.ts'
import { parseOccasion } from './occasion.ts'
import type { Occasion } from './occasion.ts'

export type CakeForm = 'round' | 'rectangular'

export type CakeDesignDraft = {
  people: number
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
}

export const DRAFT_STORAGE_KEY = 'ilusion.cakeDesign.v1'

/** Personas con que abre el paso 1, como el mockup (`CotizadorPersonas`). Es un punto de partida, no un límite. */
export const INITIAL_PEOPLE = 40
/** Tope técnico contra datos alterados; el máximo real lo fija `limits.max_online_kg` de la API. */
export const MAX_PEOPLE_INPUT = 9999
const MAX_STEPS = 8
const SLUG = /^[-a-zA-Z0-9_]+$/
const MAX_FLAVORS = 2

export function emptyDraft(): CakeDesignDraft {
  return {
    people: INITIAL_PEOPLE,
    form: 'round',
    tiers: 1,
    cakeType: null,
    bread: null,
    fillingBase: null,
    flavorCount: 1,
    flavors: [],
    coverageColor: null,
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
    form: raw.form === 'rectangular' ? 'rectangular' : 'round',
    tiers: wholeNumber(raw.tiers, 1, 10) ?? draft.tiers,
    cakeType: slugOrNull(raw.cakeType),
    bread: slugOrNull(raw.bread),
    fillingBase: slugOrNull(raw.fillingBase),
    flavorCount: raw.flavorCount === 2 ? 2 : 1,
    flavors: [...new Set(flavors)].slice(0, MAX_FLAVORS),
    coverageColor: colorOrLegacy(raw.coverageColor),
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
  }
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
