import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Recupera tu contraseña'

/** `/recuperar`. Vista vacía: por ahora solo muestra su título. */
export default function PasswordRecovery() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
