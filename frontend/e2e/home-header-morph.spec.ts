/// <reference lib="dom" />
// Los callbacks de `evaluate` y `addInitScript` corren en el navegador y usan sus tipos.
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCatalog } from './support/catalog.ts'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * El encabezado de la portada en escritorio (tanda 7, D90): arriba, los enlaces empiezan donde va el logo de la barra; al bajar,
 * el logotipo grande se encoge y viaja a la barra (una copia decorativa, `logo-viaje`) y los enlaces se recorren a su lugar. Todo
 * sale del scroll, así que subir lo deshace igual. Con "reducir movimiento" y hasta 600 px queda lo de la tanda 6. Y la entrada
 * del hero, una sola vez por carga. En desarrollo la copia expone `data-progreso` (0 a 1), `data-distancia` (px de scroll del
 * cambio) y `data-fase` (`top`, `travel`, `docked` o `foco`).
 */
test.use({ deviceScaleFactor: 1, viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })

async function openHome(page: Page) {
  await mockStoreInfo(page, fullStoreInfo)
  await mockCatalog(page)
  await page.goto('/')
  await expect(ghost(page)).toHaveAttribute('data-distancia', /\d/)
}

const ghost = (page: Page) => page.getByTestId('logo-viaje')
const barLogo = (page: Page) => page.getByTestId('logo-barra')
const bigLogo = (page: Page) => page.locator('#portada-titulo img')
const heading = (page: Page) => page.locator('#portada-titulo')
// La de la barra (el menú móvil tiene otra con el mismo nombre). Sin rol: entre 601 y 767 px está oculta y el rol no la encuentra.
const nav = (page: Page) => page.getByTestId('barra').locator('nav')

/** Baja a `y` y espera dos cuadros: el oyente pide uno y lo escribe en él. */
const scrollTo = (page: Page, y: number) =>
  page.evaluate(
    (top) =>
      new Promise<void>((resolve) => {
        window.scrollTo(0, top)
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
    y,
  )

const distance = async (page: Page) => Number(await ghost(page).getAttribute('data-distancia'))
/** El `translateX` de la navegación en px (0 sin `transform`). */
const navShift = (page: Page) => nav(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)
const rect = (locator: Locator) =>
  locator.evaluate((el) => {
    const { left, top, width, height } = el.getBoundingClientRect()
    return { left, top, width, height }
  })
/** El `img` del logo de la barra: su caja es el lugar a donde llega la copia. */
const barSlot = (page: Page) => rect(barLogo(page).locator('img'))

/** Termina la entrada del hero, para medir el logotipo grande en su lugar. */
const finishEntrance = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      if ((animation as CSSAnimation).animationName === 'home-entrada') animation.finish()
    }),
  )

test.describe('home header morph at 1440 px', () => {
  test('at the top the links start where the bar logo goes, and only the big logo is shown', async ({ page }) => {
    await openHome(page)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'top')
    const shift = await navShift(page)
    expect(shift).toBeLessThan(-100)
    // El primer enlace empieza en el borde del logo de la barra.
    const firstLink = await rect(nav(page).getByRole('link').first())
    expect(Math.abs(firstLink.left - (await barSlot(page)).left)).toBeLessThanOrEqual(1)
    await expect(bigLogo(page)).toBeVisible()
    await expect(barLogo(page)).toBeHidden()
    await expect(ghost(page)).toBeHidden()
    await expect(ghost(page)).toHaveAttribute('aria-hidden', 'true')
    // La distancia es lo que sube el logotipo grande hasta el lugar del logo de la barra fija.
    const logoTop = (await rect(heading(page))).top
    expect(await distance(page)).toBeCloseTo(logoTop - 16 - (await barSlot(page)).top + (await rect(barLogo(page).locator('xpath=ancestor::header'))).top, 0)
  })

  test('the first pixel of scroll hands the big logo to its copy in the same place', async ({ page }) => {
    await openHome(page)
    await finishEntrance(page)
    const big = await rect(bigLogo(page))
    await scrollTo(page, 1)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'travel')
    await expect(ghost(page)).toBeVisible()
    await expect(bigLogo(page)).toHaveCSS('visibility', 'hidden')
    const copy = await rect(ghost(page))
    expect(Math.abs(copy.left - big.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(copy.top - (big.top - 1))).toBeLessThanOrEqual(1)
    // En 1 px de scroll se encoge lo que toca a ese px (la curva cuadrática empieza a 2/distancia del cambio por px), no más.
    const slot = await barSlot(page)
    const firstStep = ((big.width - slot.width) * 2) / (await distance(page))
    expect(big.width - copy.width).toBeGreaterThan(0)
    expect(big.width - copy.width).toBeLessThanOrEqual(firstStep + 0.5)
  })

  test('halfway the copy and the links are in between, and past the distance the bar is the one of every page', async ({ page }) => {
    await openHome(page)
    await finishEntrance(page)
    const big = await rect(bigLogo(page))
    const atTop = await navShift(page)
    const d = await distance(page)

    await scrollTo(page, Math.round(d / 2))
    expect(Number(await ghost(page).getAttribute('data-progreso'))).toBeCloseTo(Math.round(d / 2) / d, 2)
    const half = await rect(ghost(page))
    const slot = await barSlot(page)
    expect(half.width).toBeLessThan(big.width)
    expect(half.width).toBeGreaterThan(slot.width)
    expect(half.top).toBeLessThan(big.top)
    expect(half.top).toBeGreaterThan(slot.top)
    const shift = await navShift(page)
    expect(shift).toBeGreaterThan(atTop)
    expect(shift).toBeLessThan(0)
    await expect(barLogo(page)).toBeHidden()

    // Un px antes de llegar, la copia ya está en el lugar del logo de la barra.
    await scrollTo(page, Math.floor(d) - 1)
    const near = await rect(ghost(page))
    expect(Math.abs(near.left - slot.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(near.top - slot.top)).toBeLessThanOrEqual(2)
    expect(Math.abs(near.width - slot.width)).toBeLessThanOrEqual(1)

    await scrollTo(page, Math.ceil(d) + 40)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'docked')
    await expect(ghost(page)).toBeHidden()
    await expect(barLogo(page)).toBeVisible()
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await expect(bigLogo(page)).toHaveCSS('visibility', 'hidden')
    const docked = await barSlot(page)
    expect(Math.abs(docked.left - slot.left)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(docked.width - slot.width)).toBeLessThanOrEqual(0.5)
  })

  test('docked, the bar is pixel for pixel the bar of another page', async ({ page }) => {
    // Sin las esquinas redondeadas (24 px, `rounded-lg`): por ellas se ve lo que pasa detrás de la barra, que en cada página es otra cosa.
    const barPixels = async () => {
      const box = (await page.getByTestId('barra').boundingBox())!
      return page.screenshot({ clip: { x: box.x + 24, y: box.y, width: box.width - 48, height: box.height }, animations: 'disabled' })
    }
    await openHome(page)
    await scrollTo(page, Math.ceil(await distance(page)) + 300)
    const home = await barPixels()
    await page.goto('/carrito')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const cart = await barPixels()
    expect(home.equals(cart)).toBe(true)
  })

  test('at progress 1 the copy lands exactly on the bar slot (the geometry, to the pixel)', async ({ page }) => {
    await openHome(page)
    // La ruta va como dato: el navegador importa el módulo del servidor de Vite (como `catalog-model.spec.ts`).
    const landing = await page.evaluate(async (url) => {
      const { morphFrame } = await import(url)
      const geometry = {
        start: { left: 136, top: 160, width: 550, height: 240.4 },
        end: { left: 169, top: 25, width: 150, height: 65.6 },
        stickScroll: 28,
        distance: 135,
        navOffset: 182,
      }
      return [morphFrame(geometry, 0), morphFrame(geometry, 135), morphFrame(geometry, 500), morphFrame(geometry, 10)]
    }, '/src/viewmodels/headerMorph.ts')
    const [top, arrived, beyond, early] = landing
    expect(top).toMatchObject({ progress: 0, phase: 'top', logo: { x: 136, y: 160, scale: 1 }, navShift: -182 })
    // Los enlaces van delante del logo: a mitad del camino ya se recorrieron más de lo que el logo se encogió.
    const half = await page.evaluate(async (url) => {
      const { morphFrame } = await import(url)
      const geometry = { start: { left: 0, top: 200, width: 500, height: 200 }, end: { left: 0, top: 0, width: 100, height: 40 }, stickScroll: 0, distance: 200, navOffset: 100 }
      return morphFrame(geometry, 100)
    }, '/src/viewmodels/headerMorph.ts')
    expect(half.navShift).toBeCloseTo(-12.5, 6)
    expect(half.logo.scale * 500).toBeCloseTo(200, 6)
    expect(arrived.phase).toBe('docked')
    expect(arrived.logo.x).toBeCloseTo(169, 6)
    expect(arrived.logo.y).toBeCloseTo(25, 6)
    expect(arrived.logo.scale * 550).toBeCloseTo(150, 6)
    expect(Math.abs(arrived.navShift)).toBeLessThan(1e-9)
    expect(beyond).toEqual(arrived)
    // Antes de que la barra se fije, el lugar de llegada baja con ella.
    expect(early.logo.y).toBeGreaterThan(160 + (25 - 160) * (10 / 135))
  })

  test('scrolling back up undoes it exactly, frame for frame', async ({ page }) => {
    await openHome(page)
    await finishEntrance(page)
    const d = await distance(page)
    const atTop = await navShift(page)
    const samples = [0.25, 0.5, 0.75].map((t) => Math.round(d * t))
    const down: { box: Awaited<ReturnType<typeof rect>>; shift: number }[] = []
    for (const y of samples) {
      await scrollTo(page, y)
      down.push({ box: await rect(ghost(page)), shift: await navShift(page) })
    }
    await scrollTo(page, Math.ceil(d) + 200)
    for (const [i, y] of [...samples.entries()].reverse()) {
      await scrollTo(page, y)
      const up = { box: await rect(ghost(page)), shift: await navShift(page) }
      expect(up.shift).toBeCloseTo(down[i].shift, 1)
      expect(up.box.left).toBeCloseTo(down[i].box.left, 1)
      expect(up.box.top).toBeCloseTo(down[i].box.top, 1)
      expect(up.box.width).toBeCloseTo(down[i].box.width, 1)
    }
    await scrollTo(page, 0)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'top')
    await expect(ghost(page)).toBeHidden()
    await expect(bigLogo(page)).toBeVisible()
    await expect(barLogo(page)).toBeHidden()
    expect(await navShift(page)).toBeCloseTo(atTop, 1)
  })

  test('only transform and visibility change while scrolling: no layout of the bar or the hero moves', async ({ page }) => {
    await openHome(page)
    await finishEntrance(page)
    const bar = await rect(page.getByTestId('barra'))
    const navBox = await nav(page).evaluate((el) => ({ left: (el as HTMLElement).offsetLeft, width: (el as HTMLElement).offsetWidth }))
    const d = await distance(page)
    await scrollTo(page, Math.round(d / 2))
    expect(await nav(page).evaluate((el) => ({ left: (el as HTMLElement).offsetLeft, width: (el as HTMLElement).offsetWidth }))).toEqual(navBox)
    expect((await rect(page.getByTestId('barra'))).height).toBe(bar.height)
    expect(await bigLogo(page).evaluate((el) => (el as HTMLElement).offsetWidth)).toBeGreaterThan(400)
  })

  test('a page loaded already scrolled starts with the bar in place, without the copy ever showing', async ({ page }) => {
    await openHome(page)
    await scrollTo(page, 700)
    // Registra, desde el primer cuadro de la recarga, si la copia llegó a verse.
    await page.addInitScript(() => {
      const win = window as unknown as { copySeen: boolean }
      win.copySeen = false
      const watch = () => {
        const copy = document.querySelector<HTMLElement>('[data-testid="logo-viaje"]')
        if (copy && getComputedStyle(copy).visibility === 'visible') win.copySeen = true
        if (performance.now() < 4000) requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'docked')
    await expect(barLogo(page)).toBeVisible()
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { copySeen: boolean }).copySeen)).toBe(false)
  })

  test('the focus rule holds: a focused bar logo is shown with the links in place, even back at the top', async ({ page }) => {
    await openHome(page)
    // Arriba, Tab llega a los enlaces recorridos (visibles), no al logo oculto.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(nav(page).getByRole('link').first()).toBeFocused()
    await expect(nav(page).getByRole('link').first()).toBeInViewport()
    await scrollTo(page, Math.ceil(await distance(page)) + 40)
    await page.keyboard.press('Shift+Tab')
    await expect(barLogo(page)).toBeFocused()
    await scrollTo(page, 0)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'foco')
    await expect(barLogo(page)).toHaveCSS('visibility', 'visible')
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await expect(ghost(page)).toBeHidden()
    await expect(bigLogo(page)).toBeVisible()
    // Al salir el foco, vuelve el estado de arriba.
    await page.keyboard.press('Tab')
    await expect(ghost(page)).toHaveAttribute('data-fase', 'top')
    await expect(barLogo(page)).toBeHidden()
    expect(await navShift(page)).toBeLessThan(-100)
  })

  test('crossing 600 px turns it off and on without leftovers', async ({ page }) => {
    await openHome(page)
    await scrollTo(page, Math.round((await distance(page)) / 2))
    await expect(ghost(page)).toBeVisible()
    await page.setViewportSize({ width: 500, height: 900 })
    await expect(ghost(page)).toHaveCount(0)
    await expect(barLogo(page)).toBeVisible()
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await page.setViewportSize({ width: 1440, height: 900 })
    await scrollTo(page, 0)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'top')
    await expect(barLogo(page)).toBeHidden()
    expect(await navShift(page)).toBeLessThan(-100)
  })

  test('leaving the home page clears it, and coming back starts again at the top', async ({ page }) => {
    await openHome(page)
    await scrollTo(page, Math.round((await distance(page)) / 2))
    await nav(page).getByRole('link', { name: 'Vitrina', exact: true }).click()
    await expect(page).toHaveURL(/\/vitrina$/)
    await expect(ghost(page)).toHaveCount(0)
    await expect(barLogo(page)).toBeVisible()
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await barLogo(page).click()
    await expect(page).toHaveURL(/\/$/)
    await scrollTo(page, 0)
    await expect(ghost(page)).toHaveAttribute('data-fase', 'top')
    await expect(barLogo(page)).toBeHidden()
    expect(await navShift(page)).toBeLessThan(-100)
  })

  test('between 601 and 767 px the logo still travels, the links live in the menu and the menu opens', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 })
    await openHome(page)
    await expect(nav(page)).toBeHidden()
    const d = await distance(page)
    await scrollTo(page, Math.round(d / 2))
    await expect(ghost(page)).toBeVisible()
    await scrollTo(page, Math.ceil(d) + 40)
    await expect(barLogo(page)).toBeVisible()
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(page.locator('#menu-sitio')).toBeVisible()
  })
})

test.describe('home header with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no copy and no slide: the bar logo appears when the big logo is gone, at once', async ({ page }) => {
    await mockStoreInfo(page, fullStoreInfo)
    await mockCatalog(page)
    await page.goto('/')
    await expect(bigLogo(page)).toBeVisible()
    await expect(ghost(page)).toHaveCount(0)
    await expect(nav(page)).toHaveCSS('transform', 'none')
    await expect(barLogo(page)).toBeHidden()
    const logoBottom = await bigLogo(page).evaluate((img) => img.getBoundingClientRect().bottom + window.scrollY)
    await scrollTo(page, Math.ceil(logoBottom))
    await expect(barLogo(page)).toBeVisible()
    await expect(barLogo(page)).toHaveCSS('transition-property', 'none')
    await expect(nav(page)).toHaveCSS('transform', 'none')
  })
})

test.describe('home header at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('stays as before: no copy, the bar logo always shown', async ({ page }) => {
    await mockStoreInfo(page, fullStoreInfo)
    await mockCatalog(page)
    await page.goto('/')
    await expect(ghost(page)).toHaveCount(0)
    await expect(barLogo(page)).toBeVisible()
    await scrollTo(page, 300)
    await expect(barLogo(page)).toBeVisible()
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
  })
})

test.describe('hero entrance', () => {
  const hero = (page: Page) => page.locator('section[aria-labelledby="portada-titulo"]')
  const pieces = (page: Page) => [
    bigLogo(page),
    hero(page).getByText('Pide un deseo. Del pastel nos encargamos.'),
    hero(page).getByText('Pasteles artesanales para bodas'),
    hero(page).getByRole('link', { name: 'Realizar pedido' }),
    hero(page).getByRole('link', { name: 'Ver la vitrina' }),
    page.getByTestId('pastel-portada-entrada'),
  ]

  test('runs once per load, in a short sequence, and ends with everything in place', async ({ page }) => {
    await openHome(page)
    const delays: string[] = []
    for (const piece of pieces(page)) {
      await expect(piece).toHaveCSS('animation-name', 'home-entrada')
      await expect(piece).toHaveCSS('animation-duration', '0.45s')
      delays.push(await piece.evaluate((el) => getComputedStyle(el).animationDelay))
    }
    expect(delays).toEqual(['0s', '0.06s', '0.12s', '0.18s', '0.24s', '0.12s'])
    await finishEntrance(page)
    for (const piece of pieces(page)) {
      await expect(piece).toHaveCSS('opacity', '1')
      await expect(piece).toHaveCSS('transform', 'none')
    }
    // Volver a la portada en la misma carga no la repite.
    await nav(page).getByRole('link', { name: 'Vitrina', exact: true }).click()
    await expect(page).toHaveURL(/\/vitrina$/)
    await barLogo(page).click()
    await expect(page).toHaveURL(/\/$/)
    for (const piece of pieces(page)) await expect(piece).toHaveCSS('animation-name', 'none')
  })

  test('the buttons answer during the entrance', async ({ page }) => {
    await openHome(page)
    // `force` salta la espera de Playwright a que el botón deje de moverse: la persona no espera.
    await hero(page).getByRole('link', { name: 'Ver la vitrina' }).click({ force: true })
    await expect(page).toHaveURL(/\/vitrina$/)
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('nothing moves and everything is visible from the first frame', async ({ page }) => {
      await mockStoreInfo(page, fullStoreInfo)
      await mockCatalog(page)
      await page.goto('/')
      for (const piece of pieces(page)) {
        await expect(piece).toHaveCSS('animation-name', 'none')
        await expect(piece).toHaveCSS('opacity', '1')
      }
    })
  })
})
