import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { DesignItem } from '../models/cart.ts'
import { occasionLabel } from '../models/occasion.ts'
import type { CakeDesignQuote } from '../models/cakeDesign.ts'
import { cakeTitle } from './cakeDesignReview.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { summaryRows } from './cakeDesignSummary.ts'
import { effectiveMessage, effectiveWafer, lidFor } from './cakeLid.ts'
import type { MessageMetrics } from './messageGeometry.ts'

/**
 * El pastel diseñado como línea del carrito (paso 8, "Agregar al pedido", D55): su nombre, lo elegido en frases, los montos que
 * dio la API y todo lo elegido para armar el pedido en la Etapa 4. Sin React. Guardar el diseño en el servidor no es de esta
 * etapa: la línea solo vive en el navegador.
 */

/** Una huella corta y estable (cyrb53) de un texto: el mismo diseño da siempre la misma, y dos distintos casi nunca la misma. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

type OrderInput = {
  draft: CakeDesignDraft
  design: DesignDerived
  options: CakeDesignOptions
  quote: CakeDesignQuote
  metrics: MessageMetrics
  /** Quién es el contenido de cada imagen subida (`DecorationImage.id`): dos fotos con el mismo nombre no son el mismo pastel. */
  imageIds: { decoration: string | null; wafer: string | null }
}

/** Lo elegido, con el acomodo de la oblea y del mensaje ya ajustado a la tapa de ahora (lo que se ve es lo que se guarda). */
export function designSnapshot({ draft, design, options, metrics }: Omit<OrderInput, 'quote' | 'imageIds'>): Record<string, unknown> {
  const lid = lidFor(draft, design, options)
  return {
    people: draft.people,
    kg: design.kg,
    form: draft.form,
    tiers: draft.tiers,
    cakeType: draft.cakeType,
    bread: draft.bread,
    fillingBase: design.fillingIncluded ? null : draft.fillingBase,
    flavors: design.fillingIncluded ? [] : draft.flavors,
    coverageColor: draft.coverageColor,
    decoration: draft.decoration,
    decorationColor: draft.decorationColor,
    decorationImageName: design.decoration?.requiresQuote ? draft.decorationImageName : null,
    message: effectiveMessage(draft, lid, metrics),
    wafer: effectiveWafer(draft, lid, options),
    waferImageName: draft.waferEnabled ? draft.waferImageName : null,
    occasion: draft.occasion,
  }
}

/** La línea del carrito, sin las claves de las imágenes (esas las da el guardado en `IndexedDB`). */
export function designLine(input: OrderInput): Omit<DesignItem, 'images'> | null {
  const { draft, design, options, quote, imageIds } = input
  const { breakdown, stand } = quote
  if (!breakdown) return null
  const snapshot = designSnapshot(input)
  const confirmed = { ...draft, confirmed: [1, 2, 3, 4, 5, 6, 7] }
  const details = summaryRows(confirmed, design, 0, options).map((row) => `${row.label}: ${row.value}`)
  const occasion = occasionLabel(draft.occasion)
  if (occasion) details.push(`Ocasión: ${occasion}`)
  return {
    kind: 'design',
    // La huella lleva también quién es cada imagen: el diseño guarda solo su nombre.
    designId: fingerprint(JSON.stringify([snapshot, design.decoration?.requiresQuote ? imageIds.decoration : null, draft.waferEnabled ? imageIds.wafer : null])),
    name: cakeTitle(design),
    details,
    total: breakdown.total,
    baseDeposit: stand?.deposit ?? null,
    requiresQuote: breakdown.requiresQuote,
    quantity: 1,
    design: snapshot,
  }
}
