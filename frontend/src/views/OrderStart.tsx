import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Realizar pedido'

/** `/pedido`. Vista vacía: por ahora solo muestra su título. */
export default function OrderStart() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
