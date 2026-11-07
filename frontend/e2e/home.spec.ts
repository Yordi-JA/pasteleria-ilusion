import { expect, test } from '@playwright/test'
import type { Locator, Page, Request } from '@playwright/test'
import {
  featuredProducts,
  mockCatalog,
  ok,
  serverError,
  shortenCatalogTimeout,
  SHOWCASE_PATH,
  showcaseItems,
  sliceItems,
  todayStock,
} from './support/catalog.ts'
import type { CatalogMocks } from './support/catalog.ts'
import { emptyStoreInfo, expectRequestCountStays, fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

const KEY = 'ilusion.cart.v1'

async function openHome(page: Page, mocks: CatalogMocks = {}, store: object = fullStoreInfo) {
  await mockStoreInfo(page, store)
  const requests = await mockCatalog(page, mocks)
  await page.goto('/')
  return requests
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const hero = (page: Page) => region(page, 'Pastelería Ilusión')
const featured = (page: Page) => region(page, 'Pasteles de la casa')
const showcase = (page: Page) => region(page, 'Vitrina')
const slices = (page: Page) => region(page, 'Rebanadas de hoy')
const cartLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Carrito/ })
const notice = (section: Locator) => section.getByTestId('aviso-carrito')
const addTo = (section: Locator, name: string) => section.getByRole('button', { name: `Agregar al pedido: ${name}`, exact: true })
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)

const NATA = 'rgb(255, 244, 244)'
const MERMELADA = 'rgb(94, 25, 33)'

/**
 * Los pisos de `<main>` en orden, de sus hijos directos: `field:<campo>` para cada campo de color y
 * `duya:<tipo>:<color del que cuelga>:<fondo del campo de abajo que pinta>` para cada borde. Una sola secuencia
 * revisa a la vez el orden, que no haya dos campos oscuros juntos y que cada borde sea del campo de arriba.
 */
const floors = (page: Page) =>
  page.locator('main > *').evaluateAll((els) =>
    els.map((el) => {
      const style = el.ownerDocument.defaultView!.getComputedStyle(el)
      if (el.classList.contains('duya')) {
        return `duya:${el.getAttribute('data-tipo')}:${style.getPropertyValue('--c').trim()}:${style.backgroundColor}`
      }
      return `field:${el.getAttribute('data-campo')}`
    }),
  )

/** Los nombres (h3) de las tarjetas, para comparar con `toHaveText`, que espera a que lleguen los datos. */
const articleNames = (list: Locator) => list.getByRole('article').getByRole('heading', { level: 3 })
/** El chip visible: el radio va oculto dentro de su etiqueta, y el cliente toca la etiqueta. */
const chip = (section: Locator, name: string) => section.locator('label').filter({ hasText: name })

test.describe('portada with data', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('hero: the wordmark is the h1, with the motto, the two actions and no drag hint yet', async ({ page }) => {
    await openHome(page)
    await expect(page).toHaveTitle('Pastelería Ilusión')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Pastelería Ilusión')
    await expect(hero(page).locator('h1 img[src*="ilusion-logo"]')).toBeVisible()
    await expect(hero(page)).toContainText('Pide un deseo. Del pastel nos encargamos.')
    await expect(hero(page)).toContainText(
      'Pasteles artesanales para bodas, XV años y cumpleaños, y postres del día, hechos por una pastelería familiar.',
    )
    await expect(hero(page).getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
    await expect(hero(page).getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
    // El lugar del pastel ya ocupa su tamaño; el pastel 3D llega en otro PR y hasta entonces no se pide arrastrarlo.
    const cake = page.getByTestId('pastel-portada')
    await expect(cake).toHaveAttribute('aria-hidden', 'true')
    expect((await cake.boundingBox())!.height).toBeCloseTo(600, 0)
    await expect(page.locator('main')).not.toContainText(/Arrastra|3D|proyecto|escolar|escuela/i)
  })

  test('the three data sections follow the mockup order with their copy', async ({ page }) => {
    await openHome(page)
    await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText(['Pasteles de la casa', 'Vitrina', 'Rebanadas de hoy'])
    await expect(featured(page)).toContainText('Combinaciones de la casa. Pídelas así o cambia lo que quieras al realizar tu pedido.')
    await expect(showcase(page)).toContainText('Pasteles y postres listos para llevar.')
    await expect(slices(page)).toContainText('Viernes 6 de noviembre, hasta agotar existencias.')
    await expect(slices(page).locator('img[src*="ilusion-simbolo"]')).toHaveCount(1)
  })

  test('color floors: fresa, nata, mermelada, nata, with a concha and two perlas of the field above', async ({ page }) => {
    await openHome(page)
    await expect(showcase(page)).toBeVisible()
    expect(await floors(page)).toEqual([
      'field:fresa',
      `duya:concha:#f9c1c1:${NATA}`,
      'field:nata',
      `duya:perlas:#fff4f4:${MERMELADA}`,
      'field:mermelada',
      `duya:perlas:#5e1921:${NATA}`,
      'field:nata',
    ])
    // La guirnalda del marco cuelga de nata: el último campo de la portada es nata.
    await expect(slices(page)).toHaveCSS('background-color', 'rgb(255, 244, 244)')
  })

  test('Pasteles de la casa: one large card and three in a list, with the API prices and the catalog link', async ({ page }) => {
    await openHome(page)
    const section = featured(page)
    await expect(articleNames(section)).toHaveText([
      'Tres leches de durazno',
      'Tres leches con queso y zarzamora',
      'Imposible',
      'Gelatina de mosaico',
    ])
    const cards = section.getByRole('article')
    const large = (await cards.nth(0).boundingBox())!
    const row = (await cards.nth(1).boundingBox())!
    expect(large.width).toBeGreaterThan(row.width)
    expect(large.height).toBeGreaterThan(row.height * 2)
    await expect(cards.nth(0)).toContainText('Relleno de durazno y cobertura de crema pastelera.')
    await expect(cards.nth(0)).toContainText('$350')
    await expect(cards.nth(1)).toContainText('$420')
    // El Imposible ofrece su pastel completo aunque no sea la primera presentación.
    await expect(cards.nth(2)).toContainText('$350')
    // Sin pastel completo se ofrece la primera presentación, con su nombre.
    await expect(cards.nth(3)).toContainText('Vaso, $45.50')
    await expect(cards.nth(0).getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
    await expect(cards.nth(2).getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expect(section.getByRole('link', { name: 'Ver el catálogo completo' })).toHaveAttribute('href', '/catalogo')
  })

  test('Vitrina: eight items with the presentation in the name, sold out last, and named cart buttons', async ({ page }) => {
    await openHome(page)
    const section = showcase(page)
    const list = section.getByRole('list')
    await expect(list.getByRole('listitem')).toHaveCount(8)
    await expect(articleNames(list)).toHaveText([
      'Tres leches de durazno',
      'Tres leches con queso y zarzamora',
      'Choco-pingüino',
      'Mini de tres leches de durazno',
      'Flan napolitano',
      'Tarta de frutas',
      'Gelatina de molde',
      'Vaso de gelatina de mosaico',
    ])
    await expect(list.getByRole('article').first()).toContainText('$350')
    await expect(addTo(section, 'Mini de tres leches de durazno')).toBeVisible()
    await expect(list.getByRole('article').nth(3)).toContainText('$130')
    await expect(section.getByRole('link', { name: 'Ver toda la vitrina' })).toHaveAttribute('href', '/vitrina')
    // Cuatro columnas en escritorio: los primeros cuatro en la misma fila.
    const tops = await list.getByRole('listitem').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops.slice(0, 4)).size).toBe(1)
    expect(tops[4]).toBeGreaterThan(tops[0])
  })

  test('the chips filter on the client, without a new request, and say when a sold-out item cannot be added', async ({ page }) => {
    const requests = await openHome(page)
    const section = showcase(page)
    const group = section.getByRole('group', { name: 'Filtrar la vitrina' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'Todo' })).toBeChecked()
    await expect(section.getByRole('listitem')).toHaveCount(8)
    const before = requests.showcase.length

    await chip(group, 'Pasteles').click()
    await expect(group.getByRole('radio', { name: 'Pasteles' })).toBeChecked()
    await expect(articleNames(section.getByRole('list'))).toHaveText([
      'Tres leches de durazno',
      'Tres leches con queso y zarzamora',
      'Choco-pingüino',
      'Mini de tres leches de durazno',
      'Tres leches de cajeta',
    ])
    await expect(section.getByRole('article').last()).toContainText('$1,250')

    await chip(group, 'Postres').click()
    const desserts = section.getByRole('article')
    await expect(desserts).toHaveCount(5)
    const soldOut = desserts.last()
    await expect(soldOut.getByRole('heading')).toHaveText('Imposible')
    await expect(soldOut).toContainText('Agotada por hoy')
    await expect(soldOut.getByRole('button')).toHaveCount(0)
    await expect(desserts.first().getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expectRequestCountStays(requests.showcase, before)
  })

  test('a chip with nothing today says so and keeps the other chips', async ({ page }) => {
    const cakesOnly = showcaseItems.filter((item) => item.category === 'cake')
    await openHome(page, { showcase: [todayStock(cakesOnly)] })
    const section = showcase(page)
    await chip(section, 'Postres').click()
    await expect(section).toContainText('Hoy no hay postres en la vitrina.')
    await expect(section.getByRole('listitem')).toHaveCount(0)
    await chip(section, 'Todo').click()
    await expect(section.getByRole('listitem')).toHaveCount(5)
  })

  test('Rebanadas: the date, the price per slice, what is left and the sold-out slice last', async ({ page }) => {
    await openHome(page)
    const cards = slices(page).getByRole('article')
    await expect(articleNames(slices(page))).toHaveText(['Tres leches de durazno', 'Tres leches con flan y cajeta', 'Posible', 'Imposible'])
    await expect(cards.nth(0)).toContainText('$35 la rebanada')
    await expect(cards.nth(0)).toContainText('Quedan 2')
    await expect(cards.nth(1)).toContainText('$40 la rebanada')
    await expect(cards.nth(1)).toContainText('Queda 1')
    await expect(cards.nth(2)).toContainText('Quedan 5')
    await expect(cards.nth(3)).toContainText('Agotada por hoy')
    await expect(cards.nth(3).getByRole('button', { name: 'Agotada' })).toBeDisabled()
    await expect(cards.nth(0).getByRole('img', { name: 'Foto de la rebanada pendiente' })).toBeVisible()
  })
})

test.describe('adding to the order', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('each button adds the right offering, with the presentation in the name', async ({ page }) => {
    await openHome(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await addTo(featured(page), 'Imposible').click()
    await addTo(featured(page), 'Vaso de gelatina de mosaico').click()
    await addTo(showcase(page), 'Mini de tres leches de durazno').click()
    await addTo(slices(page), 'Rebanada de tres leches de durazno').click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 5 productos')
    const line = (offeringId: number, name: string, presentation: string, unitPrice: string, slug: string, fulfillment: string) => ({
      offeringId,
      name,
      presentation,
      unitPrice,
      slug,
      fulfillment,
      kind: 'offering',
      quantity: 1,
    })
    expect(await stored(page)).toEqual({
      items: [
        // Pasteles de la casa da encargos; la vitrina y las rebanadas, líneas de la vitrina de hoy.
        line(1, 'Tres leches de durazno', 'whole', '350.00', 'tres-leches-de-durazno', 'order'),
        line(21, 'Imposible', 'whole', '350.00', 'imposible', 'order'),
        line(30, 'Vaso de gelatina de mosaico', 'cup', '45.50', 'gelatina-de-mosaico', 'order'),
        line(3, 'Mini de tres leches de durazno', 'mini', '130.00', 'tres-leches-de-durazno', 'showcase'),
        line(2, 'Rebanada de tres leches de durazno', 'slice', '35.00', 'tres-leches-de-durazno', 'showcase'),
      ],
    })
  })

  test('the same cake by order and from the vitrina are two lines; only the vitrina one is capped', async ({ page }) => {
    await openHome(page)
    const byOrder = addTo(featured(page), 'Tres leches de durazno')
    const fromShowcase = addTo(showcase(page), 'Tres leches de durazno')
    for (let i = 0; i < 3; i++) await byOrder.click()
    for (let i = 0; i < 3; i++) await fromShowcase.click()
    // Hay 2 en la vitrina hoy: el encargo no tiene ese tope.
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 5 productos')
    const items = (await stored(page)).items as { offeringId: number; fulfillment: string; quantity: number }[]
    expect(items.map((item) => `${item.offeringId}:${item.fulfillment}:${item.quantity}`)).toEqual(['1:order:3', '1:showcase:2'])
    await expect(notice(showcase(page))).toContainText('Ya tienes los 2 que quedan')
    await expect(notice(featured(page))).toContainText('Tienes 3 en tu pedido.')
  })

  test('what is left today caps the slices and the vitrina', async ({ page }) => {
    await openHome(page)
    const slice = addTo(slices(page), 'Rebanada de tres leches con flan y cajeta')
    await slice.click()
    await slice.click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
    await expect(notice(slices(page))).toContainText('Ya tienes el único que queda')
    const cake = addTo(showcase(page), 'Tres leches de durazno')
    await cake.click()
    await cake.click()
    await cake.click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos')
    await expect(notice(showcase(page))).toContainText('Ya tienes los 2 que quedan')
  })

  test('each section has its own notice, between its heading and its cards', async ({ page }) => {
    await openHome(page)
    await expect(page.locator('main').getByTestId('aviso-carrito')).toHaveCount(3)
    await addTo(showcase(page), 'Choco-pingüino').click()
    const vitrina = notice(showcase(page))
    await expect(vitrina).toHaveAttribute('role', 'status')
    await expect(vitrina).toContainText('Agregado al pedido')
    await expect(vitrina).toContainText('Choco-pingüino. Tienes 1 en tu pedido.')
    await expect(notice(featured(page))).toBeEmpty()
    await expect(notice(slices(page))).toBeEmpty()
    const heading = (await showcase(page).getByRole('heading', { level: 2 }).boundingBox())!
    const box = (await vitrina.boundingBox())!
    const firstCard = (await showcase(page).getByRole('listitem').first().boundingBox())!
    expect(box.y).toBeGreaterThan(heading.y)
    expect(box.y + box.height).toBeLessThan(firstCard.y)
  })
})

test.describe('hidden sections and states', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('nothing loaded in the vitrina today hides it with its perlas, and nata meets nata without a border', async ({ page }) => {
    await openHome(page, { showcase: [todayStock([])] })
    await expect(slices(page).getByRole('article').first()).toBeVisible()
    await expect(showcase(page)).toHaveCount(0)
    expect(await floors(page)).toEqual(['field:fresa', `duya:concha:#f9c1c1:${NATA}`, 'field:nata', 'field:nata'])
  })

  test('no slices today hides the section, and a nata field keeps the vitrina away from the footer', async ({ page }) => {
    await openHome(page, { slices: [todayStock([])] })
    await expect(showcase(page).getByRole('listitem').first()).toBeVisible()
    await expect(slices(page)).toHaveCount(0)
    // El último `field:nata` es el campo de cierre: la guirnalda del marco cuelga de él.
    expect(await floors(page)).toEqual([
      'field:fresa',
      `duya:concha:#f9c1c1:${NATA}`,
      'field:nata',
      `duya:perlas:#fff4f4:${MERMELADA}`,
      'field:mermelada',
      `duya:perlas:#5e1921:${NATA}`,
      'field:nata',
    ])
  })

  test('no featured products hides Pasteles de la casa and the concha falls on the vitrina', async ({ page }) => {
    await openHome(page, { featured: [ok([])] })
    await expect(showcase(page).getByRole('listitem').first()).toBeVisible()
    await expect(featured(page)).toHaveCount(0)
    expect(await floors(page)).toEqual([
      'field:fresa',
      `duya:concha:#f9c1c1:${MERMELADA}`,
      'field:mermelada',
      `duya:perlas:#5e1921:${NATA}`,
      'field:nata',
    ])
  })

  test('with nothing at all the hero closes on nata', async ({ page }) => {
    await openHome(page, { featured: [ok([])], showcase: [todayStock([])], slices: [todayStock([])] })
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
    expect(await floors(page)).toEqual(['field:fresa', `duya:concha:#f9c1c1:${NATA}`, 'field:nata'])
  })

  test('everything sold out in the vitrina shows the sold-out copy with its two exits', async ({ page }) => {
    const soldOut = showcaseItems.map((item) => ({ ...item, stock: 0, sold_out: true }))
    await openHome(page, { showcase: [todayStock(soldOut)] })
    const section = showcase(page)
    await expect(section.getByRole('heading', { level: 3, name: 'Por hoy se vendió todo lo de la vitrina' })).toBeVisible()
    await expect(section).toContainText('Puedes hacer un pedido con 2 días de anticipación, o ver si quedan rebanadas de hoy.')
    await expect(section.getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
    await expect(section.getByRole('link', { name: 'Ver rebanadas de hoy' })).toHaveAttribute('href', '/rebanadas')
    await expect(section.getByRole('radio')).toHaveCount(0)
    await expect(section.getByRole('listitem')).toHaveCount(0)
    await expect(section.getByRole('link', { name: 'Ver toda la vitrina' })).toBeVisible()
  })

  test('sold out with the lead days still pending shows the marker, never a made-up number', async ({ page }) => {
    const soldOut = showcaseItems.map((item) => ({ ...item, stock: 0, sold_out: true }))
    await openHome(page, { showcase: [todayStock(soldOut)] }, emptyStoreInfo)
    await expect(showcase(page)).toContainText('Puedes hacer un pedido con [días por confirmar] de anticipación')
  })

  test('one section failing shows its error with a retry; the others keep working', async ({ page }) => {
    // La vitrina falla hasta que la prueba lo cambie. Un interruptor y no una secuencia: en desarrollo, StrictMode
    // monta dos veces y la primera petición (cancelada) también llega a la simulación.
    let failing = true
    const requests: Request[] = []
    await mockStoreInfo(page)
    await mockCatalog(page)
    await page.route(
      (url) => url.pathname === SHOWCASE_PATH,
      async (route) => {
        requests.push(route.request())
        const { status, body } = failing ? serverError : { status: 200, body: { date: '2026-11-06', items: showcaseItems } }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      },
    )
    await page.goto('/')
    const section = showcase(page)
    const alert = section.getByRole('alert')
    await expect(alert).toContainText('No se pudo cargar la vitrina')
    await expect(alert).toContainText('Vuelve a intentarlo en un momento.')
    await expect(featured(page).getByRole('article')).toHaveCount(4)
    await expect(slices(page).getByRole('article')).toHaveCount(4)
    // El encabezado y la salida a la vitrina siguen.
    await expect(section.getByRole('heading', { level: 2, name: 'Vitrina' })).toBeVisible()
    await expect(section.getByRole('link', { name: 'Ver toda la vitrina' })).toBeVisible()
    const before = requests.length
    failing = false
    await section.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(section.getByRole('listitem')).toHaveCount(8)
    await expect(alert).toHaveCount(0)
    expect(requests.length).toBe(before + 1)
    // El botón desapareció: el foco pasa al título de la sección, no se pierde.
    await expect(section.getByRole('heading', { level: 2 })).toBeFocused()
  })

  test('a retry that comes back empty keeps the section, its message and the focus on its heading', async ({ page }) => {
    let failing = true
    await mockStoreInfo(page)
    await mockCatalog(page)
    await page.route(
      (url) => url.pathname === SHOWCASE_PATH,
      async (route) => {
        const { status, body } = failing ? serverError : { status: 200, body: { date: '2026-11-06', items: [] } }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      },
    )
    await page.goto('/')
    const section = showcase(page)
    const retry = section.getByRole('button', { name: 'Volver a intentar' })
    await expect(retry).toBeVisible()
    failing = false
    // Con el teclado, como quien no ve el botón desaparecer.
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect(section).toContainText('Hoy no hay nada cargado en la vitrina.')
    const heading = section.getByRole('heading', { level: 2 })
    await expect(heading).toBeFocused()
    await expect(heading).toHaveCSS('outline-style', 'solid')
    await expect(heading).toHaveCSS('outline-color', 'rgb(255, 251, 251)')
    await expect(section.getByRole('radio')).toHaveCount(0)
  })

  test('a vitrina where every item is malformed shows its error instead of hiding', async ({ page }) => {
    await openHome(page, { showcase: [todayStock([{ offering_id: 'x' }, { offering_id: 0 }])] })
    await expect(showcase(page).getByRole('alert')).toContainText('No se pudo cargar la vitrina')
  })

  test('a malformed response is an error, not an empty section', async ({ page }) => {
    await openHome(page, { slices: [ok({ fecha: 'hoy' })], featured: [ok({ productos: [] })] })
    await expect(slices(page).getByRole('alert')).toContainText('No se pudieron cargar las rebanadas de hoy')
    await expect(featured(page).getByRole('alert')).toContainText('No se pudieron cargar los pasteles de la casa')
    await expect(showcase(page).getByRole('listitem')).toHaveCount(8)
  })

  test('while loading: each section keeps its header, shows a busy skeleton and says what is loading', async ({ page }) => {
    await openHome(page, { featured: ['hang'], showcase: ['hang'], slices: ['hang'] })
    for (const [section, label] of [
      [featured(page), 'Cargando los pasteles de la casa…'],
      [showcase(page), 'Cargando la vitrina…'],
      [slices(page), 'Cargando las rebanadas de hoy…'],
    ] as const) {
      await expect(section.getByRole('heading', { level: 2 })).toBeVisible()
      await expect(section.locator('[aria-busy="true"]')).toHaveCount(1)
      await expect(section.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
      await expect(section.getByRole('status').filter({ hasText: label })).toHaveCount(1)
      await expect(section.getByRole('article')).toHaveCount(0)
    }
    for (const block of await page.locator('main [data-esqueleto]').all()) {
      await expect(block).toHaveAttribute('aria-hidden', 'true')
    }
    // Sobre la vitrina `mermelada` el esqueleto es liso, en `mermelada-suave`.
    await expect(showcase(page).locator('[data-esqueleto]').first()).toHaveCSS('background-color', 'rgb(102, 66, 67)')
  })

  test('a request that hangs ends in the error state when the timeout runs out', async ({ page }) => {
    await shortenCatalogTimeout(page, 300)
    await openHome(page, { slices: ['hang'] })
    await expect(slices(page).getByRole('alert')).toContainText('No se pudieron cargar las rebanadas de hoy', { timeout: 3_000 })
    await expect(slices(page).locator('[aria-busy="true"]')).toHaveCount(0)
  })

  test('with a photo the card shows a real image with its alt text', async ({ page }) => {
    // Un PNG de 1 × 1 px: las fotos reales todavía no existen.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
    await page.route('**/fotos/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }))
    const [durazno, ...rest] = featuredProducts
    const items = showcaseItems.map((item) => (item.offering_id === 3 ? { ...item, photo: 'tres-leches-durazno-mini.webp' } : item))
    await openHome(page, { featured: [ok([{ ...durazno, photo: 'tres-leches-durazno.webp' }, ...rest])], showcase: [todayStock(items)] })
    const large = featured(page).getByRole('article').first()
    await expect(large.getByRole('img', { name: 'Tres leches de durazno' })).toHaveAttribute('src', '/fotos/tres-leches-durazno.webp')
    await expect(large.locator('[data-foto-pendiente]')).toHaveCount(0)
    await expect(showcase(page).getByRole('img', { name: 'Mini de tres leches de durazno' })).toHaveAttribute(
      'src',
      '/fotos/tres-leches-durazno-mini.webp',
    )
  })

  test('a photo that does not load falls back to the placeholder', async ({ page }) => {
    await page.route('**/fotos/**', (route) => route.fulfill({ status: 404, body: '' }))
    const [durazno, ...rest] = featuredProducts
    await openHome(page, { featured: [ok([{ ...durazno, photo: 'no-existe.webp' }, ...rest])] })
    const large = featured(page).getByRole('article').first()
    await expect(large.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
    await expect(large.locator('img')).toHaveCount(0)
  })

  test('Rebanadas shows at most four, the available ones first, and links to all of them', async ({ page }) => {
    const more = [
      ...sliceItems,
      { ...sliceItems[0], offering_id: 94, product_slug: 'flan', product_name: 'Flan napolitano', stock: 2 },
      { ...sliceItems[0], offering_id: 95, product_slug: 'tarta', product_name: 'Tarta de frutas', stock: 1 },
    ]
    await openHome(page, { slices: [todayStock(more)] })
    await expect(articleNames(slices(page))).toHaveText([
      'Tres leches de durazno',
      'Tres leches con flan y cajeta',
      'Posible',
      'Flan napolitano',
    ])
    await expect(slices(page)).not.toContainText('Agotada por hoy')
    await expect(slices(page).getByRole('link', { name: 'Ver todas las rebanadas' })).toHaveAttribute('href', '/rebanadas')
  })
})

test.describe('mobile at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no horizontal overflow, the wordmark hides and the slices scroll inside their row', async ({ page }) => {
    await openHome(page)
    await expect(slices(page).getByRole('article').first()).toBeVisible()
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    // En móvil el h1 sigue para el lector, sin el logotipo grande (el mockup lo oculta).
    await expect(hero(page).locator('h1 img')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Pastelería Ilusión')
    expect((await page.getByTestId('pastel-portada').boundingBox())!.height).toBeCloseTo(380, 0)
    // La vitrina en dos columnas.
    const tops = await showcase(page).getByRole('listitem').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(tops[0]).toBe(tops[1])
    expect(tops[2]).toBeGreaterThan(tops[1])
    // Las rebanadas se desplazan de lado dentro de su fila, sin mover la página.
    const row = slices(page).getByRole('region', { name: 'Tarjetas de las rebanadas de hoy' })
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    // La fila se puede enfocar y mover con el teclado, y muestra el foco.
    await row.focus()
    await expect(row).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    // Todo lo que se toca mide al menos 44 px.
    for (const control of await page.locator('main').getByRole('button').all()) {
      if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('Tab goes through the hero actions; arrows move between the chips; focus is visible on the mermelada field', async ({ page }) => {
    await openHome(page)
    await expect(showcase(page).getByRole('listitem').first()).toBeVisible()
    await page.locator('main#contenido').focus()
    await page.keyboard.press('Tab')
    await expect(hero(page).getByRole('link', { name: 'Realizar pedido' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(hero(page).getByRole('link', { name: 'Ver la vitrina' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(addTo(featured(page), 'Tres leches de durazno')).toBeFocused()

    const todo = showcase(page).getByRole('radio', { name: 'Todo' })
    await todo.focus()
    await page.keyboard.press('ArrowRight')
    await expect(showcase(page).getByRole('radio', { name: 'Pasteles' })).toBeChecked()
    await expect(showcase(page).getByRole('listitem')).toHaveCount(5)
    const chosen = chip(showcase(page), 'Pasteles')
    await expect(chosen).toHaveCSS('outline-style', 'solid')
    await expect(chosen).toHaveCSS('outline-color', 'rgb(255, 251, 251)')
    // Elegido sobre `mermelada`: fondo `fresa-claro`, borde de 2 px `betun` y texto `mermelada`; sin elegir, el campo.
    await expect(chosen).toHaveCSS('background-color', 'rgb(255, 223, 223)')
    await expect(chosen).toHaveCSS('border-top-width', '2px')
    await expect(chosen).toHaveCSS('color', 'rgb(94, 25, 33)')
    await expect(chip(showcase(page), 'Todo')).toHaveCSS('background-color', 'rgb(94, 25, 33)')
    await expect(chip(showcase(page), 'Todo')).toHaveCSS('color', 'rgb(255, 251, 251)')

    // El siguiente Tab sale del grupo de chips y llega al primer botón de la vitrina.
    await page.keyboard.press('Tab')
    const first = addTo(showcase(page), 'Tres leches de durazno')
    await expect(first).toBeFocused()
    await expect(first).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
    await expect(notice(showcase(page))).toContainText('Agregado al pedido')
  })
})

test.describe('page metadata and files', () => {
  test('the page has a description and an SVG favicon with the symbol', async ({ page }) => {
    await openHome(page)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Pasteles artesanales para bodas, XV años y cumpleaños/)
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description).not.toMatch(/proyecto|escuela|escolar|materia/i)
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/favicon.svg')
    const svg = await page.request.get('/favicon.svg')
    expect(svg.headers()['content-type']).toContain('image/svg+xml')
    // Es el símbolo de la marca (`assets/logos/ilusion-simbolo.svg`), sin los metadatos.
    expect(await svg.text()).toContain('Símbolo de Pastelería Ilusión')
  })

  for (const [path, type] of [
    ['/robots.txt', 'text/plain'],
    ['/favicon.ico', 'image/'],
    ['/apple-touch-icon.png', 'image/png'],
  ] as const) {
    test(`${path} is a real file, not the SPA`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain(type)
      if (path === '/robots.txt') {
        const text = await response.text()
        expect(text).toContain('User-agent: *')
        expect(text).toContain('Disallow: /admin/')
        expect(text).toContain('Disallow: /api/')
        expect(text).not.toContain('<!doctype')
      }
    })
  }
})
