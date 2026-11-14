import { User } from '@phosphor-icons/react'
import { focusRing } from '../../components/focus.ts'
import PageHeader from '../../components/PageHeader.tsx'
import { firstName, useSession, useSignOut } from '../../viewmodels/useSession.ts'

/**
 * El encabezado de las vistas de la cuenta (Cuenta.dc.html): "Hola, Ana", el correo y "Cerrar sesión". Solo se monta
 * dentro de `RequireSession`, así que siempre hay cuenta. Las pestañas y el contenido llegan con "Mis pedidos".
 */
export default function AccountHeader() {
  const session = useSession()
  const signOut = useSignOut()
  if (session.status !== 'authenticated') return null
  const name = firstName(session.user)
  return (
    <PageHeader
      title={name ? `Hola, ${name}` : 'Hola'}
      before={
        <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-betun" aria-hidden="true">
          <User size={34} weight="regular" />
        </span>
      }
    >
      <p className="text-mermelada-suave">{session.user.email}</p>
      <button
        type="button"
        onClick={() => void signOut()}
        className={`inline-flex min-h-11 cursor-pointer items-center self-start rounded-sm text-etiqueta underline underline-offset-4 ${focusRing}`}
      >
        Cerrar sesión
      </button>
    </PageHeader>
  )
}
