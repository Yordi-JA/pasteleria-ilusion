import { useCallback, useRef, useState } from 'react'
import { lineQuantity } from '../models/cart.ts'
import type { CartOffering, LineKey } from '../models/cart.ts'
import { useCart } from './useCart.ts'
import { useCartFlight } from './useCartFlight.ts'
import type { AddOutcome } from './useCart.ts'

/** Lo que dice el aviso después de "Agregar al pedido" (libro de marca: el botón produce "Agregado al pedido"). */
export type AddNotice = {
  tone: 'success' | 'attention'
  title: string
  detail: string
}

/**
 * Cada aviso lleva un id nuevo para que la vista lo vuelva a montar y el lector lo lea aunque repita el texto.
 * Guarda de qué línea habla (presentación y tipo, encargo o vitrina de hoy) y cuántas había, para quitarse si esa
 * cantidad cambia.
 */
export type AddFeedback = AddNotice & { id: number; line: LineKey; quantity: number }

function remaining(maxQuantity: number): string {
  if (maxQuantity === 0) return 'Ya no quedan'
  return maxQuantity === 1 ? 'Solo queda 1' : `Solo quedan ${maxQuantity}`
}

/** Texto aprobado por el equipo para los topes técnicos del carrito (D47); va literal. */
const LIMIT_NOTICE: AddNotice = {
  tone: 'attention',
  title: 'No se pudo agregar',
  detail: 'Tu pedido ya tiene el máximo de piezas que se pueden pedir en línea. Para más, escríbenos por WhatsApp.',
}

/** Las rebanadas se venden solo de la vitrina del día (D60): una línea de encargo de rebanada no entra. */
const SLICE_ORDER_NOTICE: AddNotice = {
  tone: 'attention',
  title: 'No se pudo agregar',
  detail: 'Las rebanadas son solo de la vitrina del día; no se encargan para una fecha.',
}

/** Si la línea sería un encargo de rebanada, que no se permite (D60). */
export function isSliceOrder(offering: Pick<CartOffering, 'presentation' | 'fulfillment'>): boolean {
  return offering.presentation === 'slice' && offering.fulfillment === 'order'
}

/**
 * Arma el aviso a partir de lo que pasó: todo entró, entró una parte porque no quedaban más, no entró nada, o
 * el carrito ya tenía más de las que quedan (bajaron las existencias). En el último caso el carrito no se
 * recorta solo: el aviso lo dice y pide revisarlo. Si un tope técnico lo impidió (`limit`), lo dice antes que
 * cualquier otra cosa. `requested` es lo que se pidió agregar y `maxQuantity`, lo que quedaba.
 */
export function describeAdd(
  offering: CartOffering,
  outcome: AddOutcome,
  requested: number,
  maxQuantity?: number,
): AddNotice {
  if (outcome.limit) return LIMIT_NOTICE
  const { added, quantity } = outcome
  if (added === requested || maxQuantity === undefined) {
    return { tone: 'success', title: 'Agregado al pedido', detail: `${offering.name}. Tienes ${quantity} en tu pedido.` }
  }
  if (added > 0) {
    return {
      tone: 'success',
      title: 'Agregado al pedido',
      detail: `${offering.name}. ${remaining(maxQuantity)}: tienes ${quantity} en tu pedido.`,
    }
  }
  if (quantity > maxQuantity) {
    return { tone: 'attention', title: remaining(maxQuantity), detail: `${offering.name}: tienes ${quantity} en tu pedido; revisa tu carrito.` }
  }
  if (maxQuantity === 0) {
    return { tone: 'attention', title: 'Ya no quedan', detail: `${offering.name} no se agregó al pedido.` }
  }
  return {
    tone: 'attention',
    title: maxQuantity === 1 ? 'Ya tienes el único que queda' : `Ya tienes los ${maxQuantity} que quedan`,
    detail: `${offering.name} no se agregó otra vez.`,
  }
}

/**
 * "Agregar al pedido" de una pantalla: agrega al carrito compartido y deja el aviso para `AddToCartNotice`. Una
 * pantalla lleva un solo `useAddToCart` y un solo `AddToCartNotice`. El aviso no se quita con un temporizador
 * (WCAG 2.2.1): lo reemplaza el siguiente, se va al salir de la pantalla y se quita si la cantidad de su
 * presentación cambia (se quitó, se vació el carrito u otra pestaña la cambió), porque ya no diría la verdad.
 */
export function useAddToCart() {
  const { add: addToCart, items } = useCart()
  const { launch } = useCartFlight()
  const [feedback, setFeedback] = useState<AddFeedback | null>(null)
  const nextId = useRef(1)

  // Se compara durante el render, sin efecto: React vuelve a pintar de inmediato con el aviso ya quitado.
  if (feedback) {
    if (lineQuantity(items, feedback.line) !== feedback.quantity) setFeedback(null)
  }

  const add = useCallback(
    (offering: CartOffering, quantity = 1, maxQuantity?: number) => {
      const line = { offeringId: offering.offeringId, fulfillment: offering.fulfillment }
      // Defensa en el único camino al carrito de las presentaciones: ninguna pantalla debería pedirlo.
      if (isSliceOrder(offering)) {
        setFeedback({ ...SLICE_ORDER_NOTICE, id: nextId.current++, line, quantity: lineQuantity(items, line) })
        return
      }
      const outcome = addToCart(offering, quantity, maxQuantity)
      // Solo vuela una perla si entró algo, y trae las piezas que entraron.
      launch(outcome.added)
      const notice = describeAdd(offering, outcome, quantity, maxQuantity)
      setFeedback({ ...notice, id: nextId.current++, line, quantity: outcome.quantity })
    },
    [addToCart, items, launch],
  )

  /** Quita el aviso ("Cerrar" del aviso fijo); la región sigue montada. */
  const dismiss = useCallback(() => setFeedback(null), [])

  return { add, feedback, dismiss }
}

/** Algo que se puede agregar al pedido desde una tarjeta. */
export type Addable = {
  offering: CartOffering
  /** Lo que queda hoy, cuando se sabe: el carrito no lo pasa. */
  maxQuantity?: number
}

/** "Agregar al pedido" de una pieza por clic, el de las tarjetas sin contador (portada y vitrina). */
export function useAddOne() {
  const { add, feedback, dismiss } = useAddToCart()
  const addItem = useCallback((item: Addable) => add(item.offering, 1, item.maxQuantity), [add])
  return { add: addItem, feedback, dismiss }
}
