import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import AccountHeader from './account/AccountHeader.tsx'

/**
 * `/cuenta/datos`. Vista vacía: por ahora solo muestra el saludo con el nombre de la cuenta y "Cerrar sesión".
 * Pide sesión (`RequireSession`).
 */
export default function AccountDetails() {
  usePageTitle('Datos y avisos')
  return <AccountHeader />
}
