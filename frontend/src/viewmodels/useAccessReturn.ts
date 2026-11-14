import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { accessLink, RETURN_PARAM, safeReturnPath } from './returnPath.ts'

/**
 * El destino después de entrar (`?volver=`), los enlaces entre `/entrar` y `/registro` que lo conservan, y el salto
 * al destino. El carrito vive en el navegador (D46): entrar no lo toca.
 */
export function useAccessReturn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const returnTo = safeReturnPath(params.get(RETURN_PARAM))
  const goToReturn = useCallback(() => navigate(returnTo, { replace: true }), [navigate, returnTo])
  return {
    returnTo,
    goToReturn,
    loginLink: accessLink('/entrar', returnTo),
    registerLink: accessLink('/registro', returnTo),
  }
}
