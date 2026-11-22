import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { signedIn } from './support/auth.ts'
import { mockOrderList, orderPage } from './support/account-orders.ts'
import { mockCatalog } from './support/catalog.ts'
import { mockProducts } from './support/products.ts'
import { mockReferenceList } from './support/references.ts'
import { loanPage, mockStandLoans } from './support/stand-notes.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La transición entre vistas (22 de noviembre, `viewmodels/routeTransition.ts`): al cambiar de ruta, el contenido de `<main>`
 * sale desvaneciéndose y el nuevo entra subiendo un poco, con `document.startViewTransition`; la barra, el toldo, la guirnalda
 * y el pie no se animan. No corre al cambiar solo `?paso=` ni con "reducir movimiento", y sin la API queda el desvanecido de
 * `useRouteFade` (su prueba está en `animations.spec.ts`). La API real de Chromium se espía con `addInitScript`: cada llamada anota lo que se anima al estar lista.
 */

type PseudoAnimation = { pseudo: string; properties: string[]; duration: number; easing: string }
type TransitionRecord = {
  path: string
  skipped: boolean
  finished: boolean
  animations: PseudoAnimation[] | null
  rootName: string | null
  barName: string | null
}

const CURVE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const ATTRIBUTE = 'data-transicion-ruta'

/** Espía `startViewTransition` y los `animate()` de `<main>` (el desvanecido de respaldo), desde antes de cargar la página. */
function spyTransitions(page: Page) {
  return page.addInitScript(() => {
    const records: unknown[] = []
    const mainAnimations: string[][] = []
    Reflect.set(window, '__transitions', records)
    Reflect.set(window, '__mainAnimations', mainAnimations)

    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if (this.id === 'contenido') {
        const frames = Array.isArray(keyframes) ? keyframes : []
        mainAnimations.push([...new Set(frames.flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'easing', 'composite'].includes(key))))])
      }
      return animate.call(this, keyframes, options)
    }

    const start = Document.prototype.startViewTransition
    if (typeof start !== 'function') return
    Document.prototype.startViewTransition = function (this: Document, ...args: Parameters<Document['startViewTransition']>) {
      const record = { path: location.pathname, skipped: false, finished: false, animations: null as unknown, rootName: null as string | null, barName: null as string | null }
      records.push(record)
      const transition = start.apply(this, args)
      transition.ready.then(
        () => {
          // Lo que se anima en los seudoelementos de la transición, leído en el primer cuadro.
          record.animations = document
            .getAnimations()
            .filter((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition'))
            .map((animation) => {
              const effect = animation.effect as KeyframeEffect
              const frames = effect.getKeyframes()
              return {
                pseudo: effect.pseudoElement,
                properties: [...new Set(frames.flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))].sort(),
                duration: Number(effect.getTiming().duration),
                easing: String(frames[0]?.easing),
              }
            })
            .sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo)))
          record.rootName = getComputedStyle(document.documentElement).viewTransitionName
          const bar = document.querySelector('.barra-sitio')
          record.barName = bar ? getComputedStyle(bar).viewTransitionName : null
        },
        () => {
          record.skipped = true
        },
      )
      transition.finished.then(() => {
        record.finished = true
      })
      return transition
    }
  })
}

const transitions = (page: Page) => page.evaluate(() => Reflect.get(window, '__transitions') as TransitionRecord[])
const mainAnimations = (page: Page) => page.evaluate(() => Reflect.get(window, '__mainAnimations') as string[][])
const navLink = (page: Page, name: string) => page.getByRole('banner').getByRole('link', { name, exact: true })

async function openHome(page: Page) {
  await mockStoreInfo(page)
  await mockCatalog(page)
  await mockProducts(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test.describe('without reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })

  test('a link of the bar runs a view transition where only the main content fades and rises, and the bar stays still', async ({ page }) => {
    await spyTransitions(page)
    await openHome(page)
    expect(await transitions(page)).toEqual([])

    await navLink(page, 'Catálogo').click()
    await expect(page).toHaveURL(/\/catalogo$/)
    await expect.poll(async () => (await transitions(page))[0]?.animations ?? null).not.toBeNull()
    const [record] = await transitions(page)
    expect(record.path).toBe('/catalogo')
    expect(record.skipped).toBe(false)
    // La raíz no entra en la transición (el toldo, la guirnalda y el pie se pintan tal cual); la barra va aparte y sin animación.
    expect(record.rootName).toBe('none')
    expect(record.barName).toBe('barra-sitio')
    expect(record.animations).toEqual([
      { pseudo: '::view-transition-new(contenido)', properties: ['opacity', 'transform'], duration: 220, easing: CURVE },
      { pseudo: '::view-transition-old(contenido)', properties: ['opacity'], duration: 150, easing: CURVE },
    ])

    await expect.poll(async () => (await transitions(page))[0].finished).toBe(true)
    await expect(page.locator('html')).not.toHaveAttribute(ATTRIBUTE)
    // Una sola animación: el desvanecido de respaldo no corre encima.
    expect(await mainAnimations(page)).toEqual([])
    // El foco sigue llegando al contenido nuevo (`useRouteFocus`).
    await expect(page.locator('main')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('the old view leaves from where it was seen, even after scrolling down', async ({ page }) => {
    await spyTransitions(page)
    await openHome(page)
    await page.evaluate(() => window.scrollTo(0, 900))
    const before = await page.locator('main').evaluate((main) => main.getBoundingClientRect().top)
    await navLink(page, 'Catálogo').click()
    await expect.poll(async () => (await transitions(page))[0]?.animations ?? null).not.toBeNull()
    const state = await page.evaluate(() => ({
      scroll: window.scrollY,
      top: document.getElementById('contenido')!.getBoundingClientRect().top,
      offset: document.documentElement.style.getPropertyValue('--transicion-ruta-salida'),
    }))
    // La vista nueva empieza arriba y la imagen vieja baja lo que subió `<main>`.
    expect(state.scroll).toBe(0)
    expect(parseFloat(state.offset)).toBeCloseTo(before - state.top, 0)
    await expect(page.locator('html')).not.toHaveAttribute(ATTRIBUTE)
    await expect(page.locator('html')).not.toHaveAttribute('style', /--transicion-ruta-salida/)
  })

  test('the back button also transitions and lands on the previous view', async ({ page }) => {
    await spyTransitions(page)
    await openHome(page)
    await navLink(page, 'Catálogo').click()
    await expect(page).toHaveURL(/\/catalogo$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect.poll(async () => (await transitions(page)).map((record) => record.path)).toEqual(['/catalogo', '/'])
    await expect(page.getByRole('region', { name: 'Pastelería Ilusión', exact: true })).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
  })

  test('a new navigation during a transition replaces it, and clicks go through while it runs', async ({ page }) => {
    await spyTransitions(page)
    await openHome(page)
    // Más lenta, para alcanzar a hacer clic a media transición, como una persona.
    await page.addStyleTag({ content: '::view-transition-new(contenido), ::view-transition-old(contenido) { animation-duration: 4s !important; }' })
    await navLink(page, 'Catálogo').click()
    await expect.poll(async () => (await transitions(page))[0]?.animations ?? null).not.toBeNull()
    expect((await transitions(page))[0].finished).toBe(false)

    await navLink(page, 'Vitrina').click()
    await expect(page).toHaveURL(/\/vitrina$/)
    await expect.poll(async () => (await transitions(page)).map((record) => record.path)).toEqual(['/catalogo', '/vitrina'])
    // La primera terminó en cuanto empezó la segunda, sin esperar sus 4 s.
    expect((await transitions(page))[0].finished).toBe(true)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/vitrina/i)
    await expect(page.locator('main')).toBeFocused()
  })

  // La vuelta llega como un clic (evento discreto) o desde un temporizador, como un `fetch`, otra pestaña o un efecto: en ese
  // caso React pinta la vista que esperaba en el carril por omisión, y una transición nueva la absorbería con su `flushSync`.
  for (const [origin, goBack] of [
    ['right away', () => {
      history.pushState({}, '', '/cuenta/bases')
      dispatchEvent(new PopStateEvent('popstate'))
    }],
    ['from a timer', () => {
      setTimeout(() => {
        history.pushState({}, '', '/cuenta/bases')
        dispatchEvent(new PopStateEvent('popstate'))
      }, 0)
    }],
  ] as const) {
    test(`a view still waiting to be painted when another navigation arrives ${origin} is painted first and runs its effects`, async ({ page }) => {
      // Al salir en /cuenta/bases, `RequireSession` redirige a la portada y la portada olvida de dónde se salió
      // (`useSignOutAcknowledgement`); volver a /cuenta/bases pide entrar. Con la transición alargada, la vuelta llega antes de
      // que la animación termine: la portada tiene que haberse pintado ya, no después ni nunca.
      await spyTransitions(page)
      await mockStoreInfo(page)
      await mockOrderList(page, { 1: { status: 200, body: orderPage([]) } })
      await mockReferenceList(page)
      await mockStandLoans(page, { status: 200, body: loanPage([]) })
      await signedIn(page)
      await page.goto('/cuenta/bases')
      await page.addStyleTag({ content: '::view-transition-new(contenido), ::view-transition-old(contenido) { animation-duration: 4s !important; }' })
      await page.getByRole('button', { name: 'Cerrar sesión' }).click()
      await expect(page).toHaveURL(/\/$/)
      await page.evaluate(goBack)
      await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fbases$/, { timeout: 3000 })
      await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
    })
  }

  test('changing only ?paso= in "Diseña tu pastel" does not start a transition', async ({ page }) => {
    await spyTransitions(page)
    await mockStoreInfo(page)
    await mockCakeDesignOptions(page)
    await mockCakeDesignPrice(page)
    const draft = {
      people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal',
      flavorCount: 1, flavors: ['durazno'], coverageColor: COVERAGE_HEX.lila, decoration: 'rosetones', decorationColor: null,
      confirmed: [1, 2, 3, 4, 5, 6],
    }
    await page.addInitScript((value) => sessionStorage.setItem('ilusion.cakeDesign.v1', value), JSON.stringify(draft))
    await page.goto('/pedido/disena?paso=2')
    await expect(page.locator('#paso-titulo')).toHaveText(/^2\. /)
    await page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page).toHaveURL(/paso=3/)
    await expect(page.locator('#paso-titulo')).toHaveText(/^3\. /)
    expect(await transitions(page)).toEqual([])
    expect(await mainAnimations(page)).toEqual([])
  })
})

test.describe('with reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('changing the route neither starts a transition nor fades', async ({ page }) => {
    await spyTransitions(page)
    await openHome(page)
    await navLink(page, 'Catálogo').click()
    await expect(page).toHaveURL(/\/catalogo$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await transitions(page)).toEqual([])
    expect(await mainAnimations(page)).toEqual([])
    await expect(page.locator('html')).not.toHaveAttribute(ATTRIBUTE)
    await expect(page.locator('main')).toBeFocused()
  })
})
