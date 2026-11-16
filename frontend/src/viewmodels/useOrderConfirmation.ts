import { useSearchParams } from 'react-router'

/** El número del pedido que llega en `?pedido=` desde el pago (D68); `null` si no hay uno válido. */
export function useOrderConfirmation(): { orderId: number | null } {
  const [search] = useSearchParams()
  const raw = search.get('pedido')
  return { orderId: raw !== null && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null }
}
