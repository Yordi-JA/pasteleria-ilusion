import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { AddNotice } from '../viewmodels/useAddToCart.ts'
import { focusRing } from './focus.ts'
import Notice from './Notice.tsx'

/**
 * El aviso fijo bajo la barra del sitio (100 px, 84 px en móvil, como la barra de filtros del catálogo), para una
 * pantalla larga: se ve aunque se agregue desde la última repisa. Flota sobre las tarjetas, así que lleva su sombra.
 */
const stickyClass = 'sticky top-[100px] z-20 max-[600px]:top-[84px] [&:not(:empty)]:mb-8 [&>*]:shadow-flotante'
// Aire entre el aviso fijo y lo que el teclado enfoca debajo.
const FOCUS_GAP_PX = 8

type AddToCartNoticeProps = {
  /** Cada aviso lleva un `id` nuevo: lo agrega al carrito una oferta del catálogo o un pastel diseñado. */
  feedback: (AddNotice & { id: number }) | null
  className?: string
  /** Fijo bajo la barra al bajar (`/vitrina`, `/rebanadas`). Lleva "Cerrar" y reserva su alto para el foco. */
  sticky?: boolean
  /** Quita el aviso; con `sticky`, lo pide el botón "Cerrar". */
  onDismiss?: () => void
}

/**
 * Mientras el aviso fijo se ve, el documento reserva arriba su alto (`scroll-padding-top`): lo que el teclado enfoca
 * al bajar o subir no queda tapado por la barra ni por el aviso. Al quitarse el aviso, vuelve el valor de antes.
 */
function useFocusClearance(region: RefObject<HTMLDivElement | null>, noticeId: number | null) {
  useEffect(() => {
    const element = region.current
    if (noticeId === null || !element) return
    const root = document.documentElement
    const previous = root.style.scrollPaddingTop
    const top = Number.parseFloat(getComputedStyle(element).top) || 0
    root.style.scrollPaddingTop = `${top + element.offsetHeight + FOCUS_GAP_PX}px`
    return () => {
      root.style.scrollPaddingTop = previous
    }
    // Con cada aviso nuevo se mide otra vez: su texto, y su alto, cambian.
  }, [region, noticeId])
}

/**
 * Aviso de "Agregar al pedido". La región `role="status"` queda siempre montada y vacía hasta el primer clic,
 * porque una región que se monta con su texto puesto no se anuncia de forma fiable (D43). El aviso de adentro
 * va sin `role` y se vuelve a montar con cada `id`, para que se lea aunque el texto se repita.
 */
export default function AddToCartNotice({ feedback, className = '', sticky = false, onDismiss }: AddToCartNoticeProps) {
  const region = useRef<HTMLDivElement>(null)
  useFocusClearance(region, sticky && feedback ? feedback.id : null)
  const dismiss = () => {
    onDismiss?.()
    // El botón desaparece con el aviso: el foco vuelve al contenido sin mover la página.
    document.getElementById('contenido')?.focus({ preventScroll: true })
  }
  return (
    <div ref={region} role="status" data-testid="aviso-carrito" className={`${sticky ? stickyClass : ''} ${className}`}>
      {feedback && (
        <Notice key={feedback.id} live={false} tone={feedback.tone} title={feedback.title}>
          {feedback.detail}
          {sticky && onDismiss && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Cerrar el aviso"
              className={`mt-1 flex min-h-11 cursor-pointer items-center self-start rounded-sm text-etiqueta text-mermelada underline underline-offset-4 ${focusRing}`}
            >
              Cerrar
            </button>
          )}
        </Notice>
      )}
    </div>
  )
}
