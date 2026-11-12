import { useCallback, useRef, useState } from 'react'
import type { DesignItem } from '../models/cart.ts'
import { deleteDesignImages, saveDesignImage } from '../models/designImages.ts'
import type { AddNotice } from './useAddToCart.ts'
import { useCart } from './useCart.ts'
import { useCartFlight } from './useCartFlight.ts'

/** Una imagen que está en la memoria de la pestaña (dirección local) y el nombre con que se mostró. */
export type LocalImage = { url: string; name: string }

export type DesignFeedback = AddNotice & { id: number }

const LIMIT_NOTICE: AddNotice = {
  tone: 'attention',
  title: 'No se pudo agregar',
  detail: 'Tu pedido ya tiene el máximo de líneas que se pueden pedir en línea. Para más, escríbenos por WhatsApp.',
}

const FAILED_NOTICE: AddNotice = {
  tone: 'attention',
  title: 'No se pudo agregar',
  detail: 'No pudimos agregar tu pastel al pedido. Vuelve a intentarlo.',
}

const DUPLICATE_NOTICE: AddNotice = {
  tone: 'attention',
  title: 'Ya está en tu pedido',
  detail: 'Este pastel ya lo agregaste. Si quieres otro, cambia algo del diseño o empieza uno nuevo.',
}

/** El archivo de una dirección local, para guardarlo en `IndexedDB`. */
async function blobOf(image: LocalImage) {
  const response = await fetch(image.url)
  return response.blob()
}

/**
 * "Agregar al pedido" de la revisión (paso 8, D55): guarda las imágenes que la persona subió (`IndexedDB`, porque no caben en
 * `localStorage`), agrega el pastel al carrito del navegador y deja el aviso para `AddToCartNotice`. Si las imágenes no se
 * pueden guardar, el pastel entra igual y el aviso dice que hay que elegirlas otra vez. El mismo diseño no entra dos veces.
 * Guardar el diseño en el servidor es de la Etapa 4. Como el aviso del carrito, no se quita solo (WCAG 2.2.1).
 */
export function useAddDesignToCart() {
  const { addDesign, items } = useCart()
  const { launch } = useCartFlight()
  const [feedback, setFeedback] = useState<DesignFeedback | null>(null)
  const [busy, setBusy] = useState(false)
  const nextId = useRef(1)
  const adding = useRef(false)

  const show = useCallback((notice: AddNotice) => setFeedback({ ...notice, id: nextId.current++ }), [])

  const add = useCallback(
    async (line: Omit<DesignItem, 'images'>, images: { decoration: LocalImage | null; wafer: LocalImage | null }) => {
      if (adding.current) return
      adding.current = true
      setBusy(true)
      try {
        if (items.some((item) => item.kind === 'design' && item.designId === line.designId)) {
          show(DUPLICATE_NOTICE)
          return
        }
        const keys: DesignItem['images'] = {}
        let lost = false
        for (const slot of ['decoration', 'wafer'] as const) {
          const image = images[slot]
          if (!image) continue
          let key: string | null = null
          try {
            key = await saveDesignImage({ blob: await blobOf(image), name: image.name })
          } catch (error) {
            console.warn('No se pudo leer la imagen para guardarla.', error)
          }
          if (key) keys[slot] = key
          else lost = true
        }
        let outcome: ReturnType<typeof addDesign>
        try {
          outcome = addDesign({ ...line, images: keys })
        } catch (error) {
          // Una línea con otra forma o un carrito que no se puede escribir: no se pierde nada y las imágenes no quedan sueltas.
          console.warn('No se pudo agregar el pastel al pedido.', error)
          void deleteDesignImages(Object.values(keys))
          show(FAILED_NOTICE)
          return
        }
        if (!outcome.added) {
          void deleteDesignImages(Object.values(keys))
          show(outcome.limit ? LIMIT_NOTICE : DUPLICATE_NOTICE)
          return
        }
        launch(1)
        show({
          tone: lost ? 'attention' : 'success',
          title: 'Agregado al pedido',
          detail: lost
            ? 'Tu pastel quedó en tu pedido, pero no pudimos guardar tu imagen en este navegador: tendrás que elegirla otra vez.'
            : 'Tu pastel quedó en tu pedido.',
        })
      } finally {
        adding.current = false
        setBusy(false)
      }
    },
    [addDesign, items, launch, show],
  )

  /** Si un pastel con esa huella ya está en el pedido. */
  const inCart = useCallback((designId: string) => items.some((item) => item.kind === 'design' && item.designId === designId), [items])

  return { add, feedback, busy, inCart }
}
