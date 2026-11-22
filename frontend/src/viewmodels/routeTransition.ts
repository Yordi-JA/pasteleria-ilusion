import { startTransition } from 'react'
import { flushSync } from 'react-dom'
import { UNSAFE_createBrowserHistory } from 'react-router'
import type { HistoryRouterProps } from 'react-router'
import { prefersReducedMotion } from './reducedMotion.ts'

type RouterHistory = HistoryRouterProps['history']
type RouterListener = Parameters<RouterHistory['listen']>[0]
type RouterUpdate = Parameters<RouterListener>[0]

/** Mientras dura la transición, `index.css` nombra con este atributo lo que entra en ella (`<main>` y la barra). */
const ACTIVE_ATTRIBUTE = 'data-transicion-ruta'
/** Cuánto hay que bajar la imagen de la vista vieja para que salga donde estaba (ver `contentTop`). */
const EXIT_OFFSET = '--transicion-ruta-salida'
/** Los rechazos de `ready` que solo dicen que la transición no se hizo; la vista se pinta igual. */
const EXPECTED_SKIPS = new Set(['AbortError', 'InvalidStateError'])
/** El `<main>` del marco (`SiteLayout`): lo único que se anima. */
const CONTENT_ID = 'contenido'

/** Si el navegador tiene transiciones de vista en el mismo documento. Sin ellas queda el desvanecido de `useRouteFade`. */
export function supportsRouteTransition(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

/** El borde de arriba de `<main>` en la ventana, o `null` si la vista no lleva el marco (`/muestra/modelo/:slug`). */
function contentTop(): number | null {
  return document.getElementById(CONTENT_ID)?.getBoundingClientRect().top ?? null
}

/**
 * El historial del navegador del enrutador, con la transición entre vistas (22 de noviembre). Cada cambio de ruta (`pathname`),
 * venga de un enlace, de `navigate`, de una redirección o de atrás y adelante, se pinta dentro de `document.startViewTransition`:
 * la vista vieja de `<main>` se desvanece y la nueva entra subiendo 6 px (`index.css`); la barra, el toldo, la guirnalda y el pie
 * se quedan quietos. Va aquí, debajo de React Router, para que todos los enlaces del sitio la tengan sin tocarlos uno por uno: la
 * opción `viewTransition` de `Link` solo existe con los enrutadores de datos, y `<ViewTransition>` de React también animaría los
 * cambios de `?paso=`, que tienen su propia entrada, y no se puede apagar por completo con "reducir movimiento".
 *
 * Sin transición, el aviso llega a React dentro de `startTransition`, como en `BrowserRouter`: cuando solo cambian la búsqueda
 * o el ancla, con "reducir movimiento", sin la API (ahí `useRouteFade` desvanece la vista nueva) o fuera del marco. Con transición,
 * llega con `flushSync`, para que la vista nueva quede en el DOM antes de la foto del estado nuevo; por eso el enrutador va con
 * `useTransitions={false}`.
 *
 * Ningún aviso se pierde ni cambia de orden, porque hay efectos que dependen de pasar por una ruta (`useSignOutAcknowledgement`
 * olvida de dónde se salió al llegar a otra). La URL cambia en cuanto se navega, pero la vista nueva se pinta un cuadro después,
 * en el callback de la transición; si en ese lapso llega otra navegación (una redirección, atrás, otro clic), la transición se
 * salta, el aviso que esperaba se entrega en el acto, sin animación, y el nuevo le sigue con `startTransition`, también sin
 * animación. Una navegación que ocurre mientras se pinta la vista nueva (por ejemplo, `<Navigate>` en un efecto) va con
 * `startTransition`, como en `BrowserRouter`: entregarla dentro del mismo `flushSync` convertiría un ir y venir entre dos
 * redirecciones en un ciclo síncrono que congela la página. En una pestaña oculta no hay transición.
 */
export function createRouteHistory(): RouterHistory {
  const history = UNSAFE_createBrowserHistory({ v5Compat: true })
  let pathname = history.location.pathname
  /** El aviso que espera el callback de su transición para llegar a React. */
  let waiting: RouterUpdate | null = null
  let painting = false
  let active: ViewTransition | null = null

  function notify(listener: RouterListener, update: RouterUpdate) {
    const changesRoute = update.location.pathname !== pathname
    pathname = update.location.pathname

    // La vista anterior todavía no se pinta: va primero, sin animación y fuera de `startTransition`. Si la navegación vino de
    // un evento discreto (un clic), React la pinta en el carril síncrono; si vino de un `fetch`, un temporizador, otra pestaña o
    // un efecto, en el carril por omisión. En los dos casos se monta sola y corren sus efectos antes que la nueva, siempre que la
    // nueva no abra otra transición: su `flushSync` la absorbería y la anterior nunca se montaría. Por eso, tras entregar una
    // vista que esperaba, la nueva va con `startTransition`, de menor prioridad, sin animación.
    const flushed = waiting !== null
    if (waiting) {
      const previous = waiting
      waiting = null
      active?.skipTransition()
      listener(previous)
    }
    // En una pestaña oculta el navegador no hace la transición (rechaza `ready` con `InvalidStateError`): ni se intenta.
    if (
      flushed ||
      painting ||
      !changesRoute ||
      !supportsRouteTransition() ||
      prefersReducedMotion() ||
      document.visibilityState === 'hidden' ||
      contentTop() === null
    ) {
      startTransition(() => listener(update))
      return
    }

    active?.skipTransition()
    const root = document.documentElement
    root.setAttribute(ACTIVE_ATTRIBUTE, '')
    waiting = update
    const transition = document.startViewTransition(() => {
      // Si otra navegación ya lo entregó, no hay nada que pintar aquí.
      if (waiting !== update) return
      waiting = null
      // La foto de la vista vieja ya se tomó y el DOM todavía es el de antes: aquí se mide dónde estaba `<main>`.
      const before = contentTop()
      painting = true
      try {
        flushSync(() => listener(update))
      } finally {
        painting = false
      }
      // `useRouteFocus` ya subió el scroll al inicio (los efectos de `flushSync` corren antes de volver). El grupo de la
      // transición queda en el lugar nuevo de `<main>`; la imagen vieja baja lo que haga falta para salir donde se veía.
      const after = contentTop()
      root.style.setProperty(EXIT_OFFSET, `${before !== null && after !== null ? before - after : 0}px`)
    })
    active = transition
    const finish = () => {
      if (active !== transition) return
      active = null
      root.removeAttribute(ACTIVE_ATTRIBUTE)
      root.style.removeProperty(EXIT_OFFSET)
    }
    // Si pintar la vista nueva falla, el error sale por `updateCallbackDone`; aquí solo se limpia el atributo.
    transition.finished.then(finish, finish)
    // Saltarla (otra navegación) rechaza `ready` con `AbortError`, y una pestaña que se oculta antes de la foto, con
    // `InvalidStateError`: es lo esperado y no se reporta. Otro error sigue su curso.
    transition.ready.catch((error: unknown) => {
      if (!(error instanceof DOMException && EXPECTED_SKIPS.has(error.name))) throw error
    })
  }

  return {
    get action() {
      return history.action
    },
    get location() {
      return history.location
    },
    createHref: history.createHref,
    createURL: history.createURL,
    encodeLocation: history.encodeLocation,
    push: history.push,
    replace: history.replace,
    go: history.go,
    listen: (listener) => history.listen((update) => notify(listener, update)),
  }
}
