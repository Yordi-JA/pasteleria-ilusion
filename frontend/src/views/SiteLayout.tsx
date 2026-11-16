import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import CartPearls from '../components/CartPearls.tsx'
import Duya from '../components/Duya.tsx'
import SiteFooter from '../components/SiteFooter.tsx'
import SiteHeader, { CheckoutHeader } from '../components/SiteHeader.tsx'
import TopStrip from '../components/TopStrip.tsx'
import LogoutUnconfirmedNotice from './account/LogoutUnconfirmedNotice.tsx'
import { CartContext, useCartState } from '../viewmodels/useCart.ts'
import { CartFlightContext, useCartFlightState } from '../viewmodels/useCartFlight.ts'
import { ClosingFieldContext, useClosingFieldState } from '../viewmodels/useClosingField.ts'
import { checkoutBack } from '../viewmodels/referenceView.ts'
import { useRouteFocus } from '../viewmodels/useRouteFocus.ts'
import { useRestoreSession, useSession, useSignOut, useSignOutAcknowledgement } from '../viewmodels/useSession.ts'
import { useSiteMenu } from '../viewmodels/useSiteMenu.ts'
import { useStoreInfo } from '../viewmodels/useStoreInfo.ts'

/** La entrega y el pago llevan el marco de la compra (mockup de Entrega y Pago): franja, barra y pie propios. */
const CHECKOUT_PATHS = new Set(['/pedido/entrega', '/pedido/pago'])

/**
 * Marco común de todas las rutas: franja, toldo, barra flotante, contenido, guirnalda y pie.
 * Pide los datos de la pastelería una sola vez y los pasa a la franja, el menú y el pie. Guarda el carrito y lo
 * comparte con las pantallas por `CartContext`; el vuelo de la perla al carrito va por `CartFlightContext`; al encabezado le pasa solo el contador (D46).
 * Recupera la sesión al cargar y le pasa al encabezado y al menú si hay cuenta (D62); la guirnalda cuelga del campo
 * con que termina la vista (`useClosingField`).
 */
export default function SiteLayout() {
  const store = useStoreInfo()
  const menu = useSiteMenu()
  const cart = useCartState()
  const { flight, pearls, arrive, iconRef, shownCount } = useCartFlightState(cart.count)
  const main = useRef<HTMLElement>(null)
  useRouteFocus(main)
  useRestoreSession()
  useSignOutAcknowledgement()
  const session = useSession()
  const signOut = useSignOut()
  const [closingField, setClosingField] = useClosingFieldState()
  const location = useLocation()
  const checkout = CHECKOUT_PATHS.has(location.pathname)

  return (
    <CartContext value={cart}>
      <CartFlightContext value={flight}>
        <ClosingFieldContext value={setClosingField}>
          {/* El fondo fresa es el campo detrás de la barra flotante, entre el toldo y la primera sección. */}
          <div className="flex min-h-screen flex-col bg-fresa font-sans text-cuerpo text-mermelada">
            <a
              href="#contenido"
              className={
                'fixed left-4 top-4 z-50 -translate-y-[200%] rounded-md bg-mermelada px-[18px] py-3 text-etiqueta text-sobre-color ' +
                'shadow-[0_0_0_3px_theme(colors.fresa)] outline-none focus:translate-y-0 motion-safe:transition-transform'
              }
            >
              Saltar al contenido
            </a>
            <TopStrip store={store} checkout={checkout} />
            <div data-testid="toldo" className="toldo" aria-hidden="true" />
            {checkout ? (
              <CheckoutHeader back={checkoutBack(location.pathname, location.search)} />
            ) : (
              <SiteHeader
                store={store}
                menu={menu}
                session={session}
                onSignOut={signOut}
                cartCount={cart.count}
                shownCount={shownCount}
                cartIconRef={iconRef}
              />
            )}
            {session.status === 'anonymous' && session.logoutUnconfirmed && <LogoutUnconfirmedNotice onRetry={signOut} />}
            <main id="contenido" ref={main} tabIndex={-1} className="flex-1 scroll-mt-24 bg-nata outline-none">
              {/* Las vistas que necesitan los datos del negocio los leen con `useStoreDetails`, sin otra petición. */}
              <Outlet context={store} />
            </main>
            <Duya type="guirnalda" color={closingField} below="mermelada" />
            <SiteFooter store={store} compact={checkout} />
          </div>
          <CartPearls pearls={pearls} onArrive={arrive} />
        </ClosingFieldContext>
      </CartFlightContext>
    </CartContext>
  )
}
