import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import AccountHeader from './account/AccountHeader.tsx'

/**
 * `/cuenta/bases`. Vista vacía: por ahora solo muestra el saludo con el nombre de la cuenta y "Cerrar sesión".
 * Pide sesión (`RequireSession`).
 */
export default function AccountBases() {
  usePageTitle('Bases en préstamo')
  return <AccountHeader />
}
