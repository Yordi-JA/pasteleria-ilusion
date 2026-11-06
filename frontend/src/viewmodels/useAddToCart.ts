import { useCallback, useRef, useState } from 'react'
import type { CartOffering } from '../models/cart.ts'
import { useCart } from './useCart.ts'

/** Lo que dice el aviso después de "Agregar al pedido" (libro de marca: el botón produce "Agregado al pedido"). */
export type AddNotice = {
  tone: 'success' | 'attention'
  title: string
  detail: string
}

/**
 * Cada aviso lleva un id nuevo para que la vista lo vuelva a montar y el lector lo lea aunque repita el texto.
 * Guarda de qué presentación habla y cuántas había, para quitarse si esa cantidad cambia.
 */
export type AddFeedback = AddNotice & { id: number; offeringId: number; quantity: number }

function remaining(maxQuantity: number): string {
  if (maxQuantity === 0) return 'Ya no quedan'
  return maxQuantity === 1 ? 'Solo queda 1' : `Solo quedan ${maxQuantity}`
}

/**
 * Arma el aviso a partir de lo que pasó: todo entró, entró una parte porque no quedaban más, no entró nada, o
 * el carrito ya tenía más de las que quedan (bajaron las existencias). En el último caso el carrito no se
 * recorta solo: el aviso lo dice y pide revisarlo. `requested` es lo que se pidió agregar y `maxQuantity`, lo
 * que quedaba.
 */
export function describeAdd(
  offering: CartOffering,
  outcome: { added: number; quantity: number },
  requested: number,
  maxQuantity?: number,
): AddNotice {
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
  const [feedback, setFeedback] = useState<AddFeedback | null>(null)
  const nextId = useRef(1)

  // Se compara durante el render, sin efecto: React vuelve a pintar de inmediato con el aviso ya quitado.
  if (feedback) {
    const inCart = items.find((item) => item.offeringId === feedback.offeringId)?.quantity ?? 0
    if (inCart !== feedback.quantity) setFeedback(null)
  }

  const add = useCallback(
    (offering: CartOffering, quantity = 1, maxQuantity?: number) => {
      const outcome = addToCart(offering, quantity, maxQuantity)
      const notice = describeAdd(offering, outcome, quantity, maxQuantity)
      setFeedback({ ...notice, id: nextId.current++, offeringId: offering.offeringId, quantity: outcome.quantity })
    },
    [addToCart],
  )

  return { add, feedback }
}
