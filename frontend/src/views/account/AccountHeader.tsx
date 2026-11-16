import { User } from '@phosphor-icons/react'
import PageHeader from '../../components/PageHeader.tsx'
import { firstName, useSession, useSignOut } from '../../viewmodels/useSession.ts'
import AccountNav from './AccountNav.tsx'

/**
 * El encabezado de las vistas de la cuenta (Cuenta.dc.html): "Hola, Ana" y el correo y, bajo las conchas, el submenú
 * de la cuenta con "Cerrar sesión" (D69: pestañas en escritorio, menú "Tu cuenta" en móvil). Solo se monta dentro de
 * `RequireSession`, así que siempre hay cuenta.
 */
export default function AccountHeader() {
  const session = useSession()
  const signOut = useSignOut()
  if (session.status !== 'authenticated') return null
  const name = firstName(session.user)
  return (
    <>
      <PageHeader
        title={name ? `Hola, ${name}` : 'Hola'}
        before={
          <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-betun" aria-hidden="true">
            <User size={34} weight="regular" />
          </span>
        }
      >
        <p className="text-mermelada-suave">{session.user.email}</p>
      </PageHeader>
      <AccountNav user={session.user} onSignOut={() => void signOut()} />
    </>
  )
}
