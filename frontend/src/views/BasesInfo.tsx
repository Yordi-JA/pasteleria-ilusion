import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Bases en préstamo'

/** `/bases`. Vista vacía: por ahora solo muestra su título. */
export default function BasesInfo() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
