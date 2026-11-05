import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Recibimos tu pedido'

/** `/pedido/confirmacion`. Vista vacía: por ahora solo muestra su título. */
export default function OrderConfirmation() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
