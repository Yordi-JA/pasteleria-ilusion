import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import AccountBases from './views/AccountBases.tsx'
import AccountDetails from './views/AccountDetails.tsx'
import BasesInfo from './views/BasesInfo.tsx'
import CakeDesigner from './views/CakeDesigner.tsx'
import Cart from './views/Cart.tsx'
import Catalog from './views/Catalog.tsx'
import Delivery from './views/Delivery.tsx'
import EmailVerification from './views/EmailVerification.tsx'
import Home from './views/Home.tsx'
import Legal from './views/Legal.tsx'
import Login from './views/Login.tsx'
import MyOrders from './views/MyOrders.tsx'
import NotFound from './views/NotFound.tsx'
import NoteVerification from './views/NoteVerification.tsx'
import OrderConfirmation from './views/OrderConfirmation.tsx'
import OrderDetail from './views/OrderDetail.tsx'
import OrderReserved from './views/OrderReserved.tsx'
import OrderStart from './views/OrderStart.tsx'
import PasswordRecovery from './views/PasswordRecovery.tsx'
import Payment from './views/Payment.tsx'
import ProductDetail from './views/ProductDetail.tsx'
import Quote from './views/Quote.tsx'
import ReferenceSent from './views/ReferenceSent.tsx'
import ReferenceUpload from './views/ReferenceUpload.tsx'
import Register from './views/Register.tsx'
import Showcase from './views/Showcase.tsx'
import SiteLayout from './views/SiteLayout.tsx'
import Slices from './views/Slices.tsx'

// La muestra de componentes solo existe en desarrollo: Vite reemplaza `import.meta.env.DEV` por `false` en el build y descarta la rama.
const ComponentSample = import.meta.env.DEV ? lazy(() => import('./views/ComponentSample.tsx')) : null

// Rutas de docs/mapa-de-vistas.md. Los estados (cargando, error, vacío) y el menú abierto no son rutas propias.
export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalogo" element={<Catalog />} />
        <Route path="/vitrina" element={<Showcase />} />
        <Route path="/rebanadas" element={<Slices />} />
        <Route path="/pasteles/:slug" element={<ProductDetail />} />
        <Route path="/bases" element={<BasesInfo />} />

        <Route path="/entrar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/recuperar" element={<PasswordRecovery />} />
        <Route path="/verificar" element={<EmailVerification />} />

        <Route path="/cuenta" element={<MyOrders />} />
        <Route path="/cuenta/bases" element={<AccountBases />} />
        <Route path="/cuenta/datos" element={<AccountDetails />} />
        <Route path="/cuenta/pedidos/:id" element={<OrderDetail />} />
        <Route path="/cuenta/cotizaciones/:id" element={<Quote />} />

        <Route path="/carrito" element={<Cart />} />
        <Route path="/pedido" element={<OrderStart />} />
        <Route path="/pedido/disena" element={<CakeDesigner />} />
        <Route path="/pedido/referencia" element={<ReferenceUpload />} />
        <Route path="/pedido/referencia/enviada" element={<ReferenceSent />} />
        <Route path="/pedido/entrega" element={<Delivery />} />
        <Route path="/pedido/pago" element={<Payment />} />
        <Route path="/pedido/confirmacion" element={<OrderConfirmation />} />
        <Route path="/pedido/apartado" element={<OrderReserved />} />

        <Route path="/nota/:token" element={<NoteVerification />} />
        <Route path="/legal" element={<Legal />} />

        {ComponentSample && (
          <Route
            path="/muestra"
            element={
              <Suspense fallback={null}>
                <ComponentSample />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
