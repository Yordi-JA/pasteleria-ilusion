import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { unstable_HistoryRouter as HistoryRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { createRouteHistory } from './viewmodels/routeTransition.ts'

// El historial lleva la transición entre vistas (`routeTransition.ts`): decide él cuándo el cambio va en `startTransition`
// y cuándo en `flushSync` dentro de la transición, así que el enrutador no envuelve nada por su cuenta.
const history = createRouteHistory()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HistoryRouter history={history} useTransitions={false}>
      <App />
    </HistoryRouter>
  </StrictMode>,
)
