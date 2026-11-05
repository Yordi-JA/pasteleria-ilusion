import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Tu pedido está apartado'

/** `/pedido/apartado`. Vista vacía: por ahora solo muestra su título. */
export default function OrderReserved() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
