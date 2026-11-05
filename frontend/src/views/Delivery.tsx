import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = '¿Cómo recibes tu pedido?'

/** `/pedido/entrega`. Vista vacía: por ahora solo muestra su título. */
export default function Delivery() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
