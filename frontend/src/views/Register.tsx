import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Crea tu cuenta'

/** `/registro`. Vista vacía: por ahora solo muestra su título. */
export default function Register() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
