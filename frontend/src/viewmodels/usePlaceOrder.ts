import { useCallback, useRef, useState } from 'react'
import type { CartItem, DesignItem } from '../models/cart.ts'
import { finishPurchase, purchaseFingerprint, purchaseKey, rememberUpload, resetPurchase, uploadedImageId } from '../models/checkout.ts'
import { readDesignImage } from '../models/designImages.ts'
import { createOrder, designImageNeeds, orderLines, uploadCustomerImage } from '../models/orders.ts'
import type { ImagePurpose, PlacedOrder } from '../models/orders.ts'
import { lineError, orderErrorsFrom, plainError } from './orderErrors.ts'
import type { OrderErrorsView } from './orderErrors.ts'

export type PlaceOrderInput = {
  items: CartItem[]
  deliveryDate: string
  slotStartsAt: string
  pickupName: string
  pickupPhone: string
}

/** `uploading` y `creating` dicen qué está pasando ("Subiendo tus imágenes…", "Creando tu pedido…"). */
export type PlaceOrderStatus = 'idle' | 'uploading' | 'creating'

export type PlaceOrderResult = { ok: true; order: PlacedOrder } | { ok: false; errors: OrderErrorsView }

const MISSING_IMAGE = 'Su imagen ya no está en este navegador. Edita el pedido desde tu carrito y elígela otra vez.'
const OLD_DESIGN = 'Este pastel se guardó con otra versión del sitio. Edítalo desde tu carrito para continuar.'
const EXPIRED = 'Ese pedido ya venció. Vuelve a intentarlo para hacer uno nuevo.'
/** Los estados con que nace un pedido: otro (por ejemplo, `cancelled`) es un pedido viejo con la misma llave. */
const FRESH_STATUSES = new Set(['awaiting_payment', 'awaiting_quote'])

/**
 * Si el pedido que respondió el servidor es uno vigente: solo por su estado. El servidor decide el vencimiento (cancela
 * un apartado vencido antes de responder un reintento, re-revisión de D66); el reloj del navegador no cuenta, porque uno
 * adelantado rechazaría cada pedido recién creado y cada clic crearía otro (ronda 3 de la revisión).
 */
function isFresh(order: PlacedOrder): boolean {
  return FRESH_STATUSES.has(order.status)
}

class LineProblem extends Error {
  readonly view: OrderErrorsView

  constructor(view: OrderErrorsView) {
    super(view.messages.join(' '))
    this.view = view
  }
}

/**
 * Sube las imágenes de los pasteles que las llevan (la oblea y "Otra decoración", que viven en `IndexedDB`) y devuelve
 * sus ids por línea. Una imagen ya subida en este intento no se vuelve a subir: un reintento no gasta el tope de
 * imágenes sin pedido del cliente.
 */
async function uploadImages(items: CartItem[]): Promise<Map<DesignItem, Partial<Record<ImagePurpose, string>>>> {
  const ids = new Map<DesignItem, Partial<Record<ImagePurpose, string>>>()
  for (const item of items) {
    if (item.kind !== 'design') continue
    const lineIds: Partial<Record<ImagePurpose, string>> = {}
    for (const { slot, key } of designImageNeeds(item)) {
      if (!key) throw new LineProblem(lineError(item.name, MISSING_IMAGE))
      let id = uploadedImageId(key)
      if (!id) {
        const image = await readDesignImage(key)
        if (!image) throw new LineProblem(lineError(item.name, MISSING_IMAGE))
        try {
          id = await uploadCustomerImage(image, slot)
        } catch (error) {
          throw new LineProblem(orderErrorsFrom(error, [], item.name))
        }
        rememberUpload(key, id)
      }
      lineIds[slot] = id
    }
    ids.set(item, lineIds)
  }
  return ids
}

/**
 * "Continuar al pago" (D66): sube las imágenes y crea el pedido con la llave del intento de compra (`Idempotency-Key`),
 * así un doble clic o un reintento devuelven el mismo pedido. Mientras trabaja no acepta otra llamada. Devuelve el
 * pedido creado o los errores ya en frases; quien llama decide qué hacer con el carrito y a dónde ir.
 */
export function usePlaceOrder() {
  const [status, setStatus] = useState<PlaceOrderStatus>('idle')
  const running = useRef(false)

  const place = useCallback(async (input: PlaceOrderInput): Promise<PlaceOrderResult | null> => {
    if (running.current) return null
    running.current = true
    try {
      // La huella va antes de subir imágenes: si cambió algo, es otro intento, con otra llave y sin las subidas de antes.
      const key = purchaseKey(await purchaseFingerprint(input))
      setStatus('uploading')
      const images = await uploadImages(input.items)
      const prepared = orderLines(input.items, (item) => images.get(item) ?? {})
      if ('invalid' in prepared) return { ok: false, errors: lineError(input.items[prepared.invalid].name, OLD_DESIGN) }
      setStatus('creating')
      const order = await createOrder(
        {
          fulfillment: 'pickup',
          delivery_date: input.deliveryDate,
          slot_starts_at: input.slotStartsAt,
          pickup_name: input.pickupName,
          pickup_phone: input.pickupPhone,
          items: prepared.lines,
        },
        key,
      )
      if (!isFresh(order)) {
        // Un reintento recibió un pedido que ya venció (o lo canceló la pastelería): no es el de ahora. El carrito se
        // queda y el siguiente intento lleva otra llave.
        resetPurchase()
        return { ok: false, errors: plainError(EXPIRED) }
      }
      finishPurchase(order)
      return { ok: true, order }
    } catch (error) {
      if (error instanceof LineProblem) return { ok: false, errors: error.view }
      console.warn('No se pudo crear el pedido.', error)
      return { ok: false, errors: orderErrorsFrom(error, input.items.map((item) => item.name)) }
    } finally {
      running.current = false
      setStatus('idle')
    }
  }, [])

  return { place, status }
}
