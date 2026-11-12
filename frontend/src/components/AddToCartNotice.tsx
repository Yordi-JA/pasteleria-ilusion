import type { AddNotice } from '../viewmodels/useAddToCart.ts'
import Notice from './Notice.tsx'

type AddToCartNoticeProps = {
  /** Cada aviso lleva un `id` nuevo: lo agrega al carrito una oferta del catálogo o un pastel diseñado. */
  feedback: (AddNotice & { id: number }) | null
  className?: string
}

/**
 * Aviso de "Agregar al pedido". La región `role="status"` queda siempre montada y vacía hasta el primer clic,
 * porque una región que se monta con su texto puesto no se anuncia de forma fiable (D43). El aviso de adentro
 * va sin `role` y se vuelve a montar con cada `id`, para que se lea aunque el texto se repita.
 */
export default function AddToCartNotice({ feedback, className = '' }: AddToCartNoticeProps) {
  return (
    <div role="status" data-testid="aviso-carrito" className={className}>
      {feedback && (
        <Notice key={feedback.id} live={false} tone={feedback.tone} title={feedback.title}>
          {feedback.detail}
        </Notice>
      )}
    </div>
  )
}
