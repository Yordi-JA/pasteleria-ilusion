import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Catálogo'

/** `/catalogo`. Vista vacía: por ahora solo muestra su título. */
export default function Catalog() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
