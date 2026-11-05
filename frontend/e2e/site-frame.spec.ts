import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  emptyStoreInfo,
  expectRequestCountStays,
  fullStoreInfo,
  hangStoreInfo,
  mockStoreInfo,
  mockStoreInfoSequence,
  shortenStoreInfoTimeout,
} from './support/store-info.ts'

const topStrip = (page: Page) => page.getByTestId('franja')
const footer = (page: Page) => page.getByRole('contentinfo')

test.describe('header bar at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('logo, main navigation, account and cart, with the active link marked', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/vitrina')
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Pastelería Ilusión, inicio' })).toHaveAttribute('href', '/')
    const nav = banner.getByRole('navigation', { name: 'Principal' })
    const expected = [
      ['Catálogo', '/catalogo'],
      ['Vitrina', '/vitrina'],
      ['Rebanadas de hoy', '/rebanadas'],
      ['Realizar pedido', '/pedido'],
    ]
    await expect(nav.getByRole('link')).toHaveText(expected.map(([name]) => name))
    for (const [name, href] of expected) await expect(nav.getByRole('link', { name })).toHaveAttribute('href', href)
    await expect(nav.getByRole('link', { name: 'Vitrina' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'Catálogo' })).not.toHaveAttribute('aria-current', 'page')
    await expect(banner.getByRole('link', { name: 'Cuenta' })).toHaveAttribute('href', '/entrar')
    await expect(banner.getByRole('link', { name: 'Carrito' })).toHaveAttribute('href', '/carrito')
    await expect(banner.getByRole('button', { name: 'Abrir menú' })).toBeHidden()

    await nav.getByRole('link', { name: 'Realizar pedido' }).click()
    await expect(page).toHaveURL('/pedido')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Realizar pedido')
    await expect(nav.getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('aria-current', 'page')
  })

  test('the awning sits between the strip and the bar, drawn with CSS only', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/')
    const awning = page.getByTestId('toldo')
    await expect(awning).toHaveAttribute('aria-hidden', 'true')
    await expect(awning).toHaveCSS('background-image', /repeating-linear-gradient.*|radial-gradient/)
    await expect(awning).not.toHaveCSS('background-image', /url\(/)
    const strip = (await topStrip(page).boundingBox())!
    const awningBox = (await awning.boundingBox())!
    const bar = (await page.getByTestId('barra').boundingBox())!
    expect(awningBox.y).toBeCloseTo(strip.y + strip.height, 0)
    expect(bar.y - (awningBox.y + awningBox.height)).toBeCloseTo(20, 0)
  })

  test('the bar stays at the top when scrolling', async ({ page }) => {
    await mockStoreInfo(page)
    await page.setViewportSize({ width: 1440, height: 500 })
    await page.goto('/catalogo')
    await page.mouse.wheel(0, 2000)
    await expect.poll(async () => (await page.getByTestId('barra').boundingBox())!.y).toBeCloseTo(16, 0)
  })
})

test.describe('store data in the strip and the footer', () => {
  test('with data: lead days, hours, address and a WhatsApp link', async ({ page }) => {
    const requests = await mockStoreInfo(page, fullStoreInfo)
    await page.goto('/')
    await expect(topStrip(page)).toContainText('Pedidos con 2 días de anticipación')
    await expect(topStrip(page)).toContainText('WhatsApp +520000000000')
    await expect(footer(page)).toContainText('Calle de Prueba 123, Col. Centro')
    await expect(footer(page)).toContainText('Todos los días, de 10:00 a 22:30')
    await expect(footer(page)).toContainText('WhatsApp +520000000000')
    const whatsapp = footer(page).getByRole('link', { name: /Escribir por WhatsApp/ })
    await expect(whatsapp).toHaveAttribute('href', 'https://wa.me/520000000000')
    await expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(whatsapp).toHaveAttribute('target', '_blank')
    await expect(page.locator('[data-pendiente]')).toHaveCount(0)
    // Franja, menú y pie comparten una sola petición, también al navegar dentro del sitio.
    await footer(page).getByRole('link', { name: 'Vitrina' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vitrina')
    await expectRequestCountStays(requests, 1)
  })

  test('a 500 and then a 200 shows the data after the retry, at most one retry per minute', async ({ page }) => {
    await page.clock.install()
    const requests = await mockStoreInfoSequence(page, [
      { status: 500, body: { detail: 'error' } },
      { status: 200, body: fullStoreInfo },
    ])
    await page.goto('/')
    await expect(footer(page)).toContainText('[Dirección por confirmar]')
    // Antes de 60 s, navegar no vuelve a pedir: nunca una petición por cada navegación.
    await footer(page).getByRole('link', { name: 'Catálogo' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
    await footer(page).getByRole('link', { name: 'Vitrina' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vitrina')
    await expectRequestCountStays(requests, 1)
    // Pasado el minuto, la siguiente navegación reintenta una vez y los datos aparecen.
    await page.clock.fastForward(61_000)
    await footer(page).getByRole('link', { name: 'Rebanadas de hoy' }).click()
    await expect(footer(page)).toContainText('Calle de Prueba 123, Col. Centro')
    await expect(page.locator('[data-pendiente]')).toHaveCount(0)
    expect(requests).toHaveLength(2)
    // Con los datos ya cargados no hay más peticiones.
    await page.clock.fastForward(61_000)
    await footer(page).getByRole('link', { name: 'Catálogo' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
    await expectRequestCountStays(requests, 2)
  })

  test('coming back online retries right away, with a 5 s floor instead of a minute', async ({ page, context }) => {
    await page.clock.install()
    const requests = await mockStoreInfoSequence(page, [
      { status: 500, body: { detail: 'error' } },
      { status: 200, body: fullStoreInfo },
    ])
    await page.goto('/')
    await expect(footer(page)).toContainText('[Dirección por confirmar]')
    // Una reconexión justo después del error no repite la petición: el piso es de 5 s.
    await context.setOffline(true)
    await context.setOffline(false)
    await expectRequestCountStays(requests, 1)
    // A los 5 s, reconectar reintenta en ese momento, sin esperar el minuto de la navegación.
    await page.clock.fastForward(5_000)
    await context.setOffline(true)
    await context.setOffline(false)
    await expect(footer(page)).toContainText('Calle de Prueba 123, Col. Centro')
    expect(requests).toHaveLength(2)
  })

  test('the address is plain text, never markup', async ({ page }) => {
    await mockStoreInfo(page, { ...fullStoreInfo, address: '<b id="inyectado">Calle 1</b> & Co.' })
    await page.goto('/')
    await expect(footer(page)).toContainText('<b id="inyectado">Calle 1</b> & Co.')
    await expect(page.locator('#inyectado')).toHaveCount(0)
  })

  test('one day is singular', async ({ page }) => {
    await mockStoreInfo(page, { ...fullStoreInfo, custom_lead_days: 1 })
    await page.goto('/')
    await expect(topStrip(page)).toContainText('Pedidos con 1 día de anticipación')
  })

  const markerCases: { name: string; body: object; status: number }[] = [
    { name: 'null data', body: emptyStoreInfo, status: 200 },
    { name: 'a 500 error', body: { detail: 'error' }, status: 500 },
    { name: 'a 429 error', body: { detail: 'Solicitud fue regulada.' }, status: 429 },
    { name: 'malformed data', body: { address: '  ', whatsapp: '+52 55-1234', opens_at: 'diez', closes_at: 22, custom_lead_days: -1 }, status: 200 },
  ]
  for (const { name, body, status } of markerCases) {
    test(`with ${name}: visible pending markers and no WhatsApp link`, async ({ page }) => {
      await mockStoreInfo(page, body, status)
      await page.goto('/')
      await expect(topStrip(page)).toContainText('Pedidos con [días por confirmar] de anticipación')
      await expect(footer(page)).toContainText('[Dirección por confirmar]')
      await expect(footer(page)).toContainText('[Horario por confirmar]')
      // Sin número, el pie dice una sola vez que falta: solo la frase "Escribir por WhatsApp", sin la línea del número.
      await expect(footer(page).locator('[data-pendiente]').filter({ hasText: 'número' })).toHaveCount(1)
      await expect(footer(page).getByText('WhatsApp', { exact: false })).toHaveCount(1)
      const writePending = footer(page).getByText('Escribir por WhatsApp [número por confirmar]')
      await expect(writePending).toBeVisible()
      // Una sola línea: la frase no se parte en columnas dentro de su contenedor flex.
      expect((await writePending.boundingBox())!.height).toBeLessThan(30)
      await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0)
      await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0)
      await expect(footer(page)).not.toContainText(/\d{1,2}:\d{2}/)
      await expect(topStrip(page)).not.toContainText(/\d/)
    })
  }

  test('while the request has not answered: a busy skeleton, never a pending marker', async ({ page }) => {
    await hangStoreInfo(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(topStrip(page).locator('[aria-busy="true"]')).toHaveCount(1)
    await expect(footer(page).locator('[aria-busy="true"]')).not.toHaveCount(0)
    await expect(page.locator('[data-esqueleto]').first()).toBeVisible()
    // Los bloques son decorativos; cada región ocupada dice una sola vez qué se carga.
    for (const block of await page.locator('[data-esqueleto]').all()) {
      await expect(block).toHaveAttribute('aria-hidden', 'true')
      await expect(block).toHaveText('')
    }
    await expect(topStrip(page).getByText('Cargando datos de la pastelería')).toHaveCount(1)
    await expect(footer(page).getByText('Cargando datos de la pastelería')).toHaveCount(2)
    await expect(page.locator('[data-pendiente]')).toHaveCount(0)
    await expect(topStrip(page)).not.toContainText('por confirmar')
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0)
  })

  test('a request that hangs ends as pending when the timeout runs out', async ({ page }) => {
    // En producción el corte es de 10 s; en desarrollo la prueba lo baja para no esperar 10 s reales.
    await shortenStoreInfoTimeout(page, 300)
    await hangStoreInfo(page)
    await page.goto('/')
    await expect(topStrip(page)).toContainText('Pedidos con [días por confirmar] de anticipación', { timeout: 3_000 })
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  })
})

test.describe('footer', () => {
  test('stamp, motto, columns, legal links and touch targets', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/catalogo')
    const foot = footer(page)
    await expect(foot.getByText('Pide un deseo. Del pastel nos encargamos.')).toBeVisible()
    await expect(foot.locator('img[src*="ilusion-simbolo"]')).toHaveCount(1)
    for (const heading of ['Visítanos', 'Pedidos', 'La pastelería']) {
      await expect(foot.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    }
    const nav = foot.getByRole('navigation', { name: 'Pie de página' })
    await expect(nav.getByRole('link')).toHaveText(['Catálogo', 'Vitrina', 'Rebanadas de hoy', 'Bases en préstamo', 'Realizar pedido'])
    await expect(nav.getByRole('link', { name: 'Bases en préstamo' })).toHaveAttribute('href', '/bases')
    await expect(foot).toContainText('© 2026 Pastelería Ilusión')
    await expect(foot.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/legal#privacidad')
    await expect(foot.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/legal#terminos')
    for (const link of await foot.getByRole('link').all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(foot).not.toContainText(/proyecto|escuela|escolar|materia|profesor/i)
  })

  test('a guirnalda in nata hangs right before the footer, without negative margins', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/catalogo')
    const garland = page.locator('.duya[data-tipo="guirnalda"]')
    await expect(garland).toHaveCount(1)
    await expect(garland).toHaveAttribute('aria-hidden', 'true')
    await expect(garland).toHaveCSS('margin-top', '0px')
    await expect(garland).toHaveCSS('margin-bottom', '0px')
    await expect(garland).toHaveCSS('height', '21px')
    const color = await garland.evaluate((el) => el.ownerDocument.defaultView!.getComputedStyle(el).getPropertyValue('--c').trim())
    expect(color).toBe('#fff4f4')
    const next = await garland.evaluate((el) => el.nextElementSibling?.tagName)
    expect(next).toBe('FOOTER')
    await expect(footer(page)).toHaveCSS('margin-top', '0px')
  })
})

test.describe('links to an anchor', () => {
  test.use({ viewport: { width: 1440, height: 700 } })

  /** El ancla queda en pantalla, con el foco, y sin quedar tapada por la barra fija. */
  async function expectAtAnchor(page: Page, id: string) {
    const target = page.locator(`section#${id}`)
    await expect(target).toBeFocused()
    await expect(target).toBeInViewport()
    const bar = (await page.getByTestId('barra').boundingBox())!
    const heading = (await target.getByRole('heading', { level: 2 }).boundingBox())!
    expect(heading.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  }

  test('the footer legal links land on their section, not on top of main', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/catalogo')
    await footer(page).getByRole('link', { name: 'Términos y condiciones' }).click()
    await expect(page).toHaveURL('/legal#terminos')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aviso de privacidad y términos')
    await expectAtAnchor(page, 'terminos')
    // Ya en la página, el otro enlace cambia solo el ancla.
    await footer(page).getByRole('link', { name: 'Aviso de privacidad' }).click()
    await expect(page).toHaveURL('/legal#privacidad')
    await expectAtAnchor(page, 'privacidad')
  })

  test('clicking the anchor you are already on takes you back to it', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/catalogo')
    const terms = footer(page).getByRole('link', { name: 'Términos y condiciones' })
    await terms.click()
    await expectAtAnchor(page, 'terminos')
    await terms.scrollIntoViewIfNeeded()
    await expect(page.locator('section#terminos')).not.toBeInViewport()
    await terms.click()
    await expect(page).toHaveURL('/legal#terminos')
    await expectAtAnchor(page, 'terminos')
  })

  test('opening /legal#terminos directly goes to the section', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/legal#terminos')
    await expectAtAnchor(page, 'terminos')
  })
})

test.describe('keyboard', () => {
  test('the first Tab reveals "Saltar al contenido" and Enter moves focus to main', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/vitrina')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Saltar al contenido' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#contenido')).toBeFocused()
    await page.keyboard.press('Tab')
    // El siguiente Tab ya está dentro del contenido o después de él, no en la barra.
    const inBanner = await page.getByRole('banner').evaluate((el) => el.contains(el.ownerDocument.activeElement))
    expect(inBanner).toBe(false)
  })

  test('header controls show the focus ring', async ({ page }) => {
    await mockStoreInfo(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const cart = page.getByRole('banner').getByRole('link', { name: 'Carrito' })
    await cart.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(cart).toBeFocused()
    await expect(cart).toHaveCSS('outline-style', 'solid')
    await expect(cart).toHaveCSS('outline-color', 'rgb(94, 25, 33)')
  })

  test('going back does not jump to the top', async ({ page }) => {
    await mockStoreInfo(page)
    await page.setViewportSize({ width: 1440, height: 400 })
    const scrollY = () => page.locator('html').evaluate((el) => el.ownerDocument.defaultView!.scrollY)
    await page.goto('/legal')
    const catalog = footer(page).getByRole('link', { name: 'Catálogo' })
    await catalog.scrollIntoViewIfNeeded()
    const saved = await scrollY()
    expect(saved).toBeGreaterThan(0)
    await catalog.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
    await expect.poll(scrollY).toBe(0)
    // En Chromium, la posición final no basta para distinguir: el navegador restaura el scroll de la entrada
    // del historial después de que el sitio lo movió, así que un `scrollTo(0, 0)` del sitio queda tapado.
    // Por eso un espía registra cualquier scroll que pida el sitio al volver (window, scrollingElement y
    // scrollIntoView) y la prueba exige que no haya ninguno.
    await page.locator('html').evaluate((el) => {
      const w = el.ownerDocument.defaultView!
      const calls: string[] = []
      Reflect.set(w, '__scrollCalls', calls)
      const spy = (target: object, method: string, label: string) => {
        const original = Reflect.get(target, method)
        Reflect.set(target, method, function (this: unknown, ...args: unknown[]) {
          calls.push(label)
          return Reflect.apply(original, this, args)
        })
      }
      spy(w, 'scrollTo', 'window.scrollTo')
      spy(el.ownerDocument.scrollingElement!, 'scrollTo', 'scrollingElement.scrollTo')
      spy(w.Element.prototype, 'scrollIntoView', 'scrollIntoView')
    })
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aviso de privacidad y términos')
    await expect.poll(async () => Math.abs((await scrollY()) - saved)).toBeLessThanOrEqual(2)
    const calls = await page.locator('html').evaluate((el) => Reflect.get(el.ownerDocument.defaultView!, '__scrollCalls'))
    expect(calls).toEqual([])
  })

  test('navigating inside the site moves focus to main and scrolls to the top', async ({ page }) => {
    await mockStoreInfo(page)
    await page.setViewportSize({ width: 1440, height: 600 })
    await page.goto('/')
    await footer(page).getByRole('link', { name: 'Catálogo' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
    await expect(page.locator('main#contenido')).toBeFocused()
    await expect.poll(() => page.locator('html').evaluate((el) => el.ownerDocument.defaultView!.scrollY)).toBe(0)
  })
})

for (const width of [1440, 390]) {
  test(`frame: no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockStoreInfo(page)
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/pedido/disena']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    }
  })
}

test('a malformed or unknown anchor does not break the page', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal#%E0')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aviso de privacidad y términos')
  await page.goto('/catalogo#no-existe')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
})
