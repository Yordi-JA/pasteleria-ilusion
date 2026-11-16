/**
 * El sabor y la base de un envío de referencia (segunda ronda de D70): el tipo de pastel, el pan, el relleno y la base
 * que el servidor asignó con las personas. Llegan en la raíz de la solicitud y en `items[].reference` del pedido que
 * nace al aceptar. Una solicitud de antes de la `0040` trae `kg`, `bread` y `bread_name` en `null` y `cake_type` vacío:
 * esos campos quedan en `null` y la pantalla no los muestra.
 */
import { PRICE_PATTERN } from './money.ts'

/** La base que el servidor asignó: el rango de kilos que carga y su depósito, en texto. */
export type ReferenceStand = { minKg: number; maxKg: number; deposit: string }

export type ReferenceFlavor = {
  /** Los kilos que salen de las personas (regla 3.1); `null` en una solicitud vieja. */
  kg: number | null
  cakeType: string | null
  cakeTypeLabel: string | null
  bread: string | null
  breadName: string | null
  /** `null` con un pan de relleno incluido (o en una solicitud vieja). */
  fillingBase: string | null
  fillingBaseName: string | null
  fillingFlavors: string[]
  fillingFlavorNames: string[]
  stand: ReferenceStand | null
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []
}

/** Una base dudosa se descarta: nunca se muestra un depósito que no se entiende. */
function parseStand(data: unknown): ReferenceStand | null {
  if (!isRecord(data)) return null
  const minKg = positive(data.min_kg)
  const maxKg = positive(data.max_kg)
  const deposit = data.deposit
  if (minKg === null || maxKg === null || typeof deposit !== 'string' || !PRICE_PATTERN.test(deposit)) return null
  return { minKg, maxKg, deposit }
}

/** Lee el sabor de un objeto de la API; lo que falta o no se entiende queda vacío, sin romper la pantalla. */
export function parseReferenceFlavor(data: unknown): ReferenceFlavor {
  const raw = isRecord(data) ? data : {}
  return {
    kg: positive(raw.kg),
    cakeType: text(raw.cake_type),
    cakeTypeLabel: text(raw.cake_type_label),
    bread: text(raw.bread),
    breadName: text(raw.bread_name),
    fillingBase: text(raw.filling_base),
    fillingBaseName: text(raw.filling_base_name),
    fillingFlavors: texts(raw.filling_flavors),
    fillingFlavorNames: texts(raw.filling_flavor_names),
    stand: parseStand(raw.stand),
  }
}

/** `null` si el objeto no trae nada del sabor (una línea que no es de referencia). */
export function parseOptionalReferenceFlavor(data: unknown): ReferenceFlavor | null {
  return isRecord(data) ? parseReferenceFlavor(data) : null
}
