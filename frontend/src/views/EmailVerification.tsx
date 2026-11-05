import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Revisa tu correo'

/** `/verificar`. Vista vacía: por ahora solo muestra su título. */
export default function EmailVerification() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
