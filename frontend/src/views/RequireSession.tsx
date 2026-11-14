import { Navigate, Outlet, useLocation } from 'react-router'
import Duya from '../components/Duya.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { accessLink } from '../viewmodels/returnPath.ts'
import { useSession } from '../viewmodels/useSession.ts'

/** El encabezado de una vista de la cuenta mientras se recupera la sesión: la misma estructura, sin datos. */
function AccountSkeleton() {
  return (
    <>
      <div className="bg-fresa">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-6 pb-12 pt-8 max-[600px]:px-4">
          <Skeleton tone="fresa" className="h-11 w-72 max-w-full" />
          <Skeleton tone="fresa" className="h-5 w-56 max-w-full" />
        </div>
      </div>
      <Duya type="concha" color="fresa" />
    </>
  )
}

/**
 * Las rutas de la cuenta (`/cuenta/...`) piden sesión (D62). Mientras se recupera, el esqueleto; sin sesión, a
 * `/entrar` con `?volver=` para regresar aquí al entrar, o a la portada si la persona acaba de salir.
 */
export default function RequireSession() {
  const session = useSession()
  const location = useLocation()
  if (session.status === 'anonymous') {
    // Salió a propósito desde esta misma ruta: a la portada. La sesión venció, nunca hubo o salió en otra ruta y ahora
    // vuelve a la cuenta: a entrar, para volver aquí.
    if (session.signedOutFrom === location.pathname) return <Navigate to="/" replace />
    return <Navigate to={accessLink('/entrar', `${location.pathname}${location.search}${location.hash}`)} replace />
  }
  return (
    <LoadingRegion loading={session.status === 'checking'} label="Cargando tu cuenta" skeleton={<AccountSkeleton />}>
      <Outlet />
    </LoadingRegion>
  )
}
