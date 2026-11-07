import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addItem, cartCount, CART_STORAGE_KEY, readCart, removeItem, writeCart } from '../models/cart.ts'
import type { AddResult, CartItem, CartOffering, LineKey, StoredCart } from '../models/cart.ts'

/** Lo que devuelve `add`: cuántas entraron, cuántas hay y, si no entró nada por un tope técnico, `limit`. */
export type AddOutcome = Omit<AddResult, 'items'>

// `setQuantity` llega con la pantalla del carrito (Etapa 4), que es la única que la necesita.
export type Cart = {
  items: CartItem[]
  /** Suma de las cantidades: lo que dice el contador del encabezado. */
  count: number
  /** Agrega piezas sin pasar de `maxQuantity` (lo que queda hoy). Devuelve cuántas entraron y cuántas hay. */
  add: (offering: CartOffering, quantity: number, maxQuantity?: number) => AddOutcome
  /** Quita la línea de esa presentación y ese tipo (encargo o vitrina de hoy). */
  remove: (key: LineKey) => void
  /**
   * Vacía las líneas que esta versión muestra. Las de una versión más nueva (`unknown`) se conservan: esta pestaña
   * no las ve, así que no puede decidir quitarlas.
   */
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
  const [initial] = useState<StoredCart>(() => readCart() ?? { items: [], unknown: [] })
  const [items, setItems] = useState<CartItem[]>(initial.items)
  // Lo vigente en esta pestaña, con las líneas de una versión más nueva que se conservan sin leer. Es la base
  // de cada cambio solo cuando el almacenamiento falla; mientras funciona, cada cambio parte de lo guardado
  // para no pisar lo que otra pestaña escribió y aún no avisa.
  const latest = useRef(initial)
  // Resultado de la última escritura: con `false`, lo guardado puede ser más viejo que la memoria.
  const storageWorks = useRef(true)

  const show = useCallback((next: StoredCart) => {
    latest.current = next
    setItems(next.items)
  }, [])

  const update = useCallback(
    <T>(change: (base: StoredCart) => { items: CartItem[]; result: T }): T => {
      const base = (storageWorks.current ? readCart() : null) ?? latest.current
      const { items: next, result } = change(base)
      if (next !== base.items) storageWorks.current = writeCart(next, base.unknown)
      show({ items: next, unknown: base.unknown })
      return result
    },
    [show],
  )

  useEffect(() => {
    // Otra pestaña cambió el carrito o vació todo el almacenamiento (`key === null`). El evento no llega a la
    // pestaña que escribió, así que no hay eco. Si esta pestaña no pudo guardar, lo guardado es más viejo que
    // su memoria: leerlo borraría lo que el cliente agregó aquí, así que la memoria manda hasta que una
    // escritura vuelva a funcionar.
    const sync = () => {
      if (!storageWorks.current) return
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
        const { items: next, ...outcome } = addItem(base.items, offering, quantity, maxQuantity, base.unknown.length)
        return { items: next, result: outcome }
      }),
    [update],
  )

  const remove = useCallback(
    (key: LineKey) => update((base) => ({ items: removeItem(base.items, key), result: undefined })),
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
