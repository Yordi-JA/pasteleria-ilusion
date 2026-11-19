import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import CartPearls from '../components/CartPearls.tsx'
import Duya from '../components/Duya.tsx'
import SiteFooter from '../components/SiteFooter.tsx'
import SiteHeader, { CheckoutHeader } from '../components/SiteHeader.tsx'
import CheckoutStrip from '../components/CheckoutStrip.tsx'
import LogoutUnconfirmedNotice from './account/LogoutUnconfirmedNotice.tsx'
import { claimDesignDraft, forgetDesignDraft } from '../viewmodels/useCakeDesigner.ts'
import { CartContext, useCartState } from '../viewmodels/useCart.ts'
import { CartFlightContext, useCartFlightState } from '../viewmodels/useCartFlight.ts'
import { ClosingFieldContext, useClosingFieldState } from '../viewmodels/useClosingField.ts'
import { checkoutBack } from '../viewmodels/referenceView.ts'
import { useRouteFade } from '../viewmodels/useRouteFade.ts'
import { useRouteFocus } from '../viewmodels/useRouteFocus.ts'
import { claimDeliveryChoice, forgetDeliveryChoice } from '../viewmodels/useDelivery.ts'
import { BarLogoContext, useBarLogoState } from '../viewmodels/useBarLogo.ts'
import { useRestoreSession, useSession, useSignInEffect, useSignOut, useSignOutAcknowledgement, useSignOutEffect } from '../viewmodels/useSession.ts'
import { useSiteMenu } from '../viewmodels/useSiteMenu.ts'
import { useStoreInfo } from '../viewmodels/useStoreInfo.ts'

/** La entrega y el pago llevan el marco de la compra (mockup de Entrega y Pago): franja, barra y pie propios. */
const CHECKOUT_PATHS = new Set(['/pedido/entrega', '/pedido/pago'])
/** Solo el pago dice quién procesa los pagos (tanda 1, D77). */
const PAYMENT_PATH = '/pedido/pago'

/**
 * Marco común de todas las rutas: toldo, barra flotante, contenido, guirnalda y pie; la entrega y el pago llevan además la
 * franja de la compra (la franja de los días y el WhatsApp del resto del sitio se quitó en D77: el WhatsApp está en el pie y
 * los días, en las pantallas de pedido). Pide los datos de la pastelería una sola vez y los pasa a esa franja, el menú y el pie. Guarda el carrito y lo
 * comparte con las pantallas por `CartContext`; el vuelo de la perla al carrito va por `CartFlightContext`; al encabezado le pasa solo el contador (D46).
 * Recupera la sesión al cargar y le pasa al encabezado y al menú si hay cuenta (D62); al cerrarla, vacía el carrito (D77); la guirnalda cuelga del campo
 * con que termina la vista (`useClosingField`).
 */
export default function SiteLayout() {
  const store = useStoreInfo()
  const menu = useSiteMenu()
  const cart = useCartState()
  const { flight, pearls, arrive, iconRef, shownCount } = useCartFlightState(cart.count)
  const main = useRef<HTMLElement>(null)
  useRouteFocus(main)
  useRouteFade(main)
  useRestoreSession()
  useSignOutAcknowledgement()
  // Cerrar sesión vacía el carrito (D77): lo que se eligió con la cuenta no queda para quien use el navegador después.
  useSignOutEffect(cart.clear)
  // Con el carrito se olvidan la fecha y la hora elegidas en la entrega de esta pestaña (D77, D80).
  useSignOutEffect(forgetDeliveryChoice)
  // Y el borrador de "Diseña tu pastel", que vive en la misma pestaña (tanda 4).
  useSignOutEffect(forgetDesignDraft)
  // Una sesión que termina sola no los borra (la misma cuenta puede volver), pero otra cuenta que entra no los hereda (tanda 5).
  // El carrito hace lo mismo en `useCartState`.
  useSignInEffect(claimDesignDraft)
  useSignInEffect(claimDeliveryChoice)
  const session = useSession()
  const signOut = useSignOut()
  const [closingField, setClosingField] = useClosingFieldState()
  const location = useLocation()
  const checkout = CHECKOUT_PATHS.has(location.pathname)
  // El logo de la barra y el logotipo grande de la portada no se ven juntos (tanda 6).
  const { barLogoHidden, barLogoAnimated, registerHeroLogo } = useBarLogoState(location.pathname === '/')

  return (
    <CartContext value={cart}>
      <CartFlightContext value={flight}>
        <ClosingFieldContext value={setClosingField}>
          <BarLogoContext value={registerHeroLogo}>
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
              {checkout && <CheckoutStrip store={store} payments={location.pathname === PAYMENT_PATH} />}
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
                  logoHidden={barLogoHidden}
                  logoAnimated={barLogoAnimated}
                />
              )}
              {session.status === 'anonymous' && session.logoutUnconfirmed && <LogoutUnconfirmedNotice onRetry={signOut} />}
              <main id="contenido" ref={main} tabIndex={-1} className="flex-1 scroll-mt-24 bg-nata outline-none">
                {/* Las vistas que necesitan los datos del negocio los leen con `useStoreDetails`, sin otra petición. */}
                <Outlet context={store} />
              </main>
              <Duya color={closingField} below="mermelada" />
              <SiteFooter store={store} compact={checkout} />
            </div>
            <CartPearls pearls={pearls} onArrive={arrive} />
          </BarLogoContext>
        </ClosingFieldContext>
      </CartFlightContext>
    </CartContext>
  )
}
