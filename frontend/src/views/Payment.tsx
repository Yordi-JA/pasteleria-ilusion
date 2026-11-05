import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Paga tu pedido'

/** `/pedido/pago`. Vista vacía: por ahora solo muestra su título. */
export default function Payment() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
