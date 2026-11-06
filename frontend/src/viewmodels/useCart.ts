import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addItem, cartCount, CART_STORAGE_KEY, readCart, removeItem, writeCart } from '../models/cart.ts'
import type { CartItem, CartOffering } from '../models/cart.ts'

// `setQuantity` llega con la pantalla del carrito (Etapa 4), que es la única que la necesita.
export type Cart = {
  items: CartItem[]
  /** Suma de las cantidades: lo que dice el contador del encabezado. */
  count: number
  /** Agrega piezas sin pasar de `maxQuantity` (lo que queda hoy). Devuelve cuántas entraron y cuántas hay. */
  add: (offering: CartOffering, quantity: number, maxQuantity?: number) => { added: number; quantity: number }
  remove: (offeringId: number) => void
  clear: () => void
}

/**
 * El carrito del marco del sitio. Lo dan `SiteLayout` y `useCartState`; fuera del marco no hay carrito, y
 * `useCart` lo dice en lugar de devolver uno vacío que no guarda nada.
 */
export const CartContext = createContext<Cart | null>(null)

/**
 * Estado del carrito, guardado en `localStorage` y sincronizado entre pestañas con el evento `storage`. Lo
 * llama solo `SiteLayout`, que lo comparte con `CartContext`: el contador y cada pantalla con "Agregar al
 * pedido" leen el mismo carrito (D46).
 */
export function useCartState(): Cart {
  const [items, setItems] = useState<CartItem[]>(() => readCart() ?? [])
  // La lista vigente en esta pestaña. Es la base de cada cambio solo cuando el almacenamiento falla; mientras
  // funciona, cada cambio parte de lo guardado para no pisar lo que otra pestaña escribió y aún no avisa.
  const latest = useRef(items)
  // Resultado de la última escritura: con `false`, lo guardado puede ser más viejo que la memoria.
  const storageWorks = useRef(true)

  const show = useCallback((next: CartItem[]) => {
    latest.current = next
    setItems(next)
  }, [])

  const update = useCallback(
    <T>(change: (base: CartItem[]) => { items: CartItem[]; result: T }): T => {
      const base = (storageWorks.current ? readCart() : null) ?? latest.current
      const { items: next, result } = change(base)
      if (next !== base) storageWorks.current = writeCart(next)
      show(next)
      return result
    },
    [show],
  )

  useEffect(() => {
    // Otra pestaña cambió el carrito o vació todo el almacenamiento (`key === null`). El evento no llega a la
    // pestaña que escribió, así que no hay eco.
    const sync = () => {
      const stored = readCart()
      if (stored) show(stored)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    // Un cambio de otra pestaña entre el primer render y la suscripción no llegó como evento.
    sync()
    return () => window.removeEventListener('storage', onStorage)
  }, [show])

  const add = useCallback(
    (offering: CartOffering, quantity: number, maxQuantity?: number) =>
      update((base) => {
        const { items: next, added, quantity: inCart } = addItem(base, offering, quantity, maxQuantity)
        return { items: next, result: { added, quantity: inCart } }
      }),
    [update],
  )

  const remove = useCallback(
    (offeringId: number) => update((base) => ({ items: removeItem(base, offeringId), result: undefined })),
    [update],
  )

  const clear = useCallback(() => update(() => ({ items: [], result: undefined })), [update])

  return useMemo(() => ({ items, count: cartCount(items), add, remove, clear }), [items, add, remove, clear])
}

/** El carrito compartido. Solo funciona dentro del marco del sitio (`SiteLayout`). */
export function useCart(): Cart {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart necesita el CartContext que da SiteLayout.')
  return cart
}
