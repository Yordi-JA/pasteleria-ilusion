import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { morphDistance, morphFrame } from './headerMorph.ts'
import type { Box, MorphGeometry } from './headerMorph.ts'
import { prefersReducedMotion, subscribeReducedMotion } from './reducedMotion.ts'

/**
 * El encabezado de la portada en escritorio (tanda 7, D90): arriba, la barra no lleva logo y los enlaces empiezan donde iría;
 * al bajar, los enlaces se recorren a su lugar y el logotipo grande se encoge y viaja hasta el lugar del logo de la barra, que
 * aparece cuando llega. Al subir se deshace igual, porque todo sale del scroll.
 *
 * Lo que viaja es una copia decorativa del logotipo (`aria-hidden`, en la barra, por encima de ella): el `h1` sigue siendo el
 * logotipo grande para el lector de pantalla y el logo de la barra sigue siendo un enlace de verdad, enfocable solo cuando se
 * ve. Solo se escriben `transform` y `visibility` (y `opacity` del logo de la barra al llegar); las medidas se toman una vez,
 * al empezar y cuando algo cambia de tamaño, nunca en cada cuadro. Un solo oyente de `scroll` pasivo pide un cuadro por
 * refresco con `requestAnimationFrame`.
 *
 * Se eligió esto y no las animaciones ligadas al scroll de CSS (`animation-timeline: scroll()`): Firefox no las trae activas,
 * así que de todos modos haría falta este mismo código como respaldo, y los cambios que no son de un cuadro a otro (qué logo se
 * ve, cuál se puede enfocar) necesitan JavaScript. Un solo camino funciona igual en Chrome, Firefox y Safari y se prueba una vez.
 */

/** Lo que el encabezado presta para el cambio: el logo de la barra, la navegación y la copia que viaja. */
export type HeaderMorphParts = {
  barLogo: RefObject<HTMLAnchorElement | null>
  nav: RefObject<HTMLElement | null>
  ghost: RefObject<HTMLImageElement | null>
}

/** Escritorio (más de 600 px, donde se ve el logotipo grande) y sin "reducir movimiento". */
const DESKTOP = '(min-width: 601px)'

function subscribeMorphAllowed(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const desktop = window.matchMedia(DESKTOP)
  desktop.addEventListener('change', onChange)
  const stopReduced = subscribeReducedMotion(onChange)
  return () => {
    desktop.removeEventListener('change', onChange)
    stopReduced()
  }
}

function morphAllowed() {
  return typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches && !prefersReducedMotion()
}

/** Si el encabezado puede hacer el cambio: escritorio y sin "reducir movimiento". Se actualiza si cambia el ancho o la preferencia. */
export function useMorphAllowed(): boolean {
  return useSyncExternalStore(subscribeMorphAllowed, morphAllowed)
}

/** Las tres referencias del encabezado, estables durante toda la vida del marco. */
export function useHeaderMorphParts(): HeaderMorphParts {
  const barLogo = useRef<HTMLAnchorElement>(null)
  const nav = useRef<HTMLElement>(null)
  const ghost = useRef<HTMLImageElement>(null)
  return useMemo(() => ({ barLogo, nav, ghost }), [])
}

/**
 * Mide una vez: el logotipo grande (su caja de diseño, sin la entrada animada que pueda tener encima: se mide su `h1`), el logo
 * de la barra como queda con la barra fija, cuánto falta para que la barra se fije y cuánto se recorre la navegación.
 */
function measure(heroLogo: HTMLElement, heading: HTMLElement, header: HTMLElement, link: HTMLElement, barImage: HTMLElement, nav: HTMLElement | null): MorphGeometry | null {
  const scrollY = window.scrollY
  const width = heroLogo.offsetWidth
  const height = heroLogo.offsetHeight
  if (width === 0 || height === 0) return null
  const headingBox = heading.getBoundingClientRect()
  const start: Box = {
    left: headingBox.left + heroLogo.offsetLeft - heading.offsetLeft,
    top: headingBox.top + scrollY + heroLogo.offsetTop - heading.offsetTop,
    width,
    height,
  }
  const headerBox = header.getBoundingClientRect()
  const stickyTop = Number.parseFloat(getComputedStyle(header).top) || 0
  const barBox = barImage.getBoundingClientRect()
  if (barBox.width === 0) return null
  const end: Box = { left: barBox.left, top: barBox.top - headerBox.top + stickyTop, width: barBox.width, height: barBox.height }
  // Dónde estaría la barra sin fijarse. Si ya está fija, se deduce del elemento que la sigue (la barra no ocupa otro lugar).
  let naturalTop = headerBox.top + scrollY
  const next = header.nextElementSibling
  if (headerBox.top <= stickyTop + 0.5 && next) naturalTop = next.getBoundingClientRect().top + scrollY - header.offsetHeight
  // `offsetLeft` no cuenta el `transform` que ya tenga la navegación. Oculta (menos de 768 px), no se recorre.
  const navOffset = nav && nav.offsetParent !== null && nav.offsetParent === link.offsetParent ? Math.max(0, nav.offsetLeft - link.offsetLeft) : 0
  return { start, end, stickScroll: Math.max(0, naturalTop - stickyTop), distance: morphDistance(start, end), navOffset }
}

type StyleProperty = 'transform' | 'visibility' | 'opacity' | 'width' | 'height'

/** Pone (o quita, con `''`, para que manden las clases) los estilos en línea de un elemento del encabezado o del hero. */
function setStyles(element: HTMLElement, styles: Partial<Record<StyleProperty, string>>) {
  for (const [property, value] of Object.entries(styles) as [StyleProperty, string][]) element.style[property] = value
}

/** Escribe un estilo en línea solo si cambió desde la última vez. */
function writer() {
  const last = new Map<string, string>()
  return (element: HTMLElement, property: StyleProperty, value: string, key: string) => {
    if (last.get(key) === value) return
    last.set(key, value)
    setStyles(element, { [property]: value })
  }
}

/** Solo en desarrollo: lo que leen las pruebas (avance, distancia y fase), o nada para quitarlo. */
function writeProbe(element: HTMLElement, probe: { progreso: string; distancia: string; fase: string } | null) {
  for (const key of ['progreso', 'distancia', 'fase'] as const) {
    if (probe) element.dataset[key] = probe[key]
    else delete element.dataset[key]
  }
}

/**
 * Corre el cambio mientras `heroLogo` (el `img` del logotipo grande) esté registrado; con `null` no hace nada. Al terminar
 * (otra ruta, móvil o "reducir movimiento") quita todo lo que escribió y la barra vuelve a mandar con sus clases.
 */
export function useHeaderMorph(heroLogo: HTMLElement | null, parts: HeaderMorphParts) {
  useLayoutEffect(() => {
    const link = parts.barLogo.current
    const ghost = parts.ghost.current
    const nav = parts.nav.current
    if (!heroLogo || !link) return
    const heading = heroLogo.parentElement
    const header = link.closest('header')
    const barImage = link.querySelector('img')
    if (!ghost || !heading || !header || !barImage) {
      // Sin las piezas no hay cambio: el logo de la barra no se queda oculto para siempre.
      setStyles(link, { visibility: 'visible', opacity: '1' })
      return () => setStyles(link, { visibility: '', opacity: '' })
    }

    const write = writer()
    let geometry: MorphGeometry | null = null
    let stale = true
    let pending = 0
    let focused = link.matches(':focus')

    const render = () => {
      pending = 0
      // Las lecturas van antes que las escrituras: medir solo cuando algo cambió de tamaño.
      if (stale) {
        geometry = measure(heroLogo, heading, header, link, barImage, nav)
        stale = false
        if (geometry) {
          write(ghost, 'width', `${geometry.start.width}px`, 'ghost-width')
          write(ghost, 'height', `${geometry.start.height}px`, 'ghost-height')
        }
      }
      if (!geometry) {
        write(link, 'visibility', 'visible', 'link-visibility')
        write(link, 'opacity', '1', 'link-opacity')
        return
      }
      const frame = morphFrame(geometry, window.scrollY)
      const docked = frame.phase === 'docked'
      // Con el foco en el logo de la barra (D89: nunca se oculta con el foco) la barra queda como la de las demás páginas y el
      // logotipo grande, si todavía está en su lugar, se ve donde está.
      const traveling = frame.phase === 'travel' && !focused
      const barShown = docked || focused
      write(ghost, 'visibility', traveling ? 'visible' : '', 'ghost-visibility')
      if (traveling) {
        const { x, y, scale } = frame.logo
        write(ghost, 'transform', `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`, 'ghost-transform')
      }
      if (nav) write(nav, 'transform', barShown || frame.navShift > -0.05 ? '' : `translate3d(${frame.navShift.toFixed(2)}px, 0, 0)`, 'nav-transform')
      write(heroLogo, 'visibility', focused ? (docked ? 'hidden' : '') : frame.phase === 'top' ? '' : 'hidden', 'hero-visibility')
      write(link, 'visibility', barShown ? 'visible' : '', 'link-visibility')
      write(link, 'opacity', barShown ? '1' : '', 'link-opacity')
      if (import.meta.env.DEV) {
        writeProbe(ghost, { progreso: frame.progress.toFixed(3), distancia: geometry.distance.toFixed(1), fase: focused ? 'foco' : frame.phase })
      }
    }
    const schedule = () => {
      if (pending === 0) pending = requestAnimationFrame(render)
    }
    const remeasure = () => {
      stale = true
      schedule()
    }
    const onFocusChange = () => {
      focused = link.matches(':focus')
      schedule()
    }

    // El primer cuadro se escribe antes de pintar: una portada que abre con scroll ya empieza en su lugar, sin destello.
    render()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', remeasure)
    // Al volver con atrás y adelante desde la caché del navegador (bfcache), el scroll puede cambiar sin evento.
    window.addEventListener('pageshow', remeasure)
    link.addEventListener('focus', onFocusChange)
    link.addEventListener('blur', onFocusChange)
    // La barra, el `h1` o la página cambian de alto (fuentes que llegan, secciones que cargan, un aviso bajo la barra).
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(remeasure) : null
    resize?.observe(header)
    resize?.observe(heading)
    resize?.observe(document.body)
    let alive = true
    document.fonts?.ready.then(() => {
      if (alive) remeasure()
    })

    return () => {
      alive = false
      if (pending !== 0) cancelAnimationFrame(pending)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('pageshow', remeasure)
      link.removeEventListener('focus', onFocusChange)
      link.removeEventListener('blur', onFocusChange)
      resize?.disconnect()
      setStyles(ghost, { visibility: '', transform: '', width: '', height: '' })
      if (nav) setStyles(nav, { transform: '' })
      setStyles(heroLogo, { visibility: '' })
      setStyles(link, { visibility: '', opacity: '' })
      if (import.meta.env.DEV) writeProbe(ghost, null)
    }
  }, [heroLogo, parts])
}
