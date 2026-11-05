import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Envía tu referencia'

/** `/pedido/referencia`. Vista vacía: por ahora solo muestra su título. */
export default function ReferenceUpload() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
