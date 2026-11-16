import { useStoreDetails } from './useStoreInfo.ts'

/** Lo que `/pedido` toma de los datos del negocio: los días de anticipación de "Diseña tu pastel". */
export function useOrderStart() {
  const store = useStoreDetails()
  return {
    /** `null` pendiente, `undefined` mientras cargan los datos del negocio. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}
