import { expect, test } from '@playwright/test'
import type { Locator, Page, Request } from '@playwright/test'
import {
  featuredProducts,
  mockCatalog,
  ok,
  serverError,
  SHOWCASE_PATH,
  shortenCatalogTimeout,
  showcaseItems,
  stockItem,
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
/** La portada ya no lleva las rebanadas de hoy (D105): viven en `/rebanadas`. */
const slices = (page: Page) => region(page, 'Rebanadas de hoy')
const cartLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Carrito/ })
const notice = (section: Locator) => section.getByTestId('aviso-carrito')
const addTo = (section: Locator, name: string) => section.getByRole('button', { name: `Agregar al pedido: ${name}`, exact: true })
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)

const NATA = 'rgb(255, 244, 244)'
const MERMELADA = 'rgb(94, 25, 33)'
const FRESA = 'rgb(249, 193, 193)'

/**
 * Los pisos de `<main>` en orden, de sus hijos directos: `field:<campo>` para cada campo de color y
 * `duya:<color del que cuelga>:<fondo del campo de abajo que pinta>` para cada borde. Una sola secuencia
 * revisa a la vez el orden, que no haya dos campos oscuros juntos y que cada borde sea del campo de arriba.
 */
const floors = (page: Page) =>
  page.locator('main > *').evaluateAll((els) =>
    els.map((el) => {
      const style = el.ownerDocument.defaultView!.getComputedStyle(el)
      if (el.classList.contains('duya')) {
        return `duya:${style.getPropertyValue('--c').trim()}:${style.backgroundColor}`
      }
      return `field:${el.getAttribute('data-campo')}`
    }),
  )

/** La guirnalda del marco, la que va justo antes del pie, cuelga justo debajo de la galería "Hechos en la casa". */
const expectClosingGarlandBelowGallery = async (page: Page) => {
  const galleryBottom = await region(page, 'Hechos en la casa').evaluate((el) => el.getBoundingClientRect().bottom)
  const garlandTop = await page.locator('.duya:has(+ footer)').evaluate((el) => el.getBoundingClientRect().top)
  expect(garlandTop).toBeCloseTo(galleryBottom, 0)
}

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
    // El lugar del pastel conserva su tamaño; el pastel 3D, su pista y su respaldo se prueban en `hero-cake.spec.ts`.
    const cake = page.getByTestId('pastel-portada')
    expect((await cake.boundingBox())!.height).toBeCloseTo(600, 0)
    await expect(page.locator('main')).not.toContainText(/3D|proyecto|escolar|escuela/i)
  })

  test('the sections follow the order of the page with their copy, and there is no Rebanadas de hoy section', async ({ page }) => {
    await openHome(page)
    await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText(['Pasteles de la casa', 'Vitrina', 'Hechos en la casa'])
    await expect(slices(page)).toHaveCount(0)
    await expect(featured(page)).toContainText('Combinaciones de la casa. Pídelas así o cambia lo que quieras al realizar tu pedido.')
    await expect(showcase(page)).toContainText('Pasteles y postres listos para llevar.')
  })

  test('color floors: fresa, nata, fresa, nata, with a guirnalda of the field above on each change', async ({ page }) => {
    await openHome(page)
    await expect(showcase(page)).toBeVisible()
    expect(await floors(page)).toEqual([
      'field:fresa',
      `duya:#f9c1c1:${NATA}`,
      'field:nata',
      `duya:#fff4f4:${FRESA}`,
      'field:fresa',
      `duya:#f9c1c1:${NATA}`,
      'field:nata',
    ])
    // La vitrina va sobre `fresa` y "Hechos en la casa" cierra sobre `nata`: la guirnalda del marco cuelga de nata, sin franja en medio.
    await expect(showcase(page)).toHaveAttribute('data-campo', 'fresa')
    await expect(showcase(page)).toHaveCSS('background-color', FRESA)
    await expect(region(page, 'Hechos en la casa')).toHaveCSS('background-color', NATA)
    await expectClosingGarlandBelowGallery(page)
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
    // El Imposible tiene modelo (D95): su tarjeta muestra la ilustración; la gelatina de mosaico, sin modelo, su hueco.
    await expect(cards.nth(2).getByRole('img', { name: 'Imposible, ilustración del postre', exact: true })).toBeVisible()
    await expect(cards.nth(3).getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
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
    // El flan napolitano (D95) y la gelatina de molde (D98) tienen modelo; la gelatina de mosaico de la prueba, no.
    await expect(desserts.first().getByRole('img', { name: 'Flan napolitano, ilustración del postre', exact: true })).toBeVisible()
    await expect(desserts.nth(2).getByRole('img', { name: 'Gelatina de molde, ilustración del postre', exact: true })).toBeVisible()
    await expect(desserts.nth(3).getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expectRequestCountStays(requests.showcase, before)
  })

  test('the sliced cake keeps its place in the vitrina with "Rebanado" and its two links instead of the cart button', async ({ page }) => {
    const rebanado = stockItem(5, 'tres-leches-de-fresa', 'Tres leches de fresa', 'cake', 'slice', '35.00', { stock: 6, sliced: true })
    await openHome(page, { showcase: [todayStock([showcaseItems[0], rebanado, ...showcaseItems.slice(1, 4)])] })
    const list = showcase(page).getByRole('list')
    // En su lugar del catálogo; el Imposible agotado, al final.
    await expect(articleNames(list)).toHaveText(['Tres leches de durazno', 'Tres leches de fresa', 'Tres leches con queso y zarzamora', 'Choco-pingüino', 'Imposible'])
    const fresa = list.getByRole('article').nth(1)
    await expect(fresa).toContainText('Rebanado')
    await expect(fresa).toContainText('$35 la rebanada')
    await expect(fresa.getByRole('button')).toHaveCount(0)
    await expect(fresa.getByRole('link', { name: 'Ver las rebanadas: Tres leches de fresa' })).toHaveAttribute('href', '/rebanadas')
    await expect(fresa.getByRole('link', { name: 'Encargarlo completo: Tres leches de fresa' })).toHaveAttribute('href', '/pasteles/tres-leches-de-fresa')
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

})

test.describe('adding to the order', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('each button adds the right offering, with the presentation in the name', async ({ page }) => {
    await openHome(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await addTo(featured(page), 'Imposible').click()
    await addTo(featured(page), 'Vaso de gelatina de mosaico').click()
    await addTo(showcase(page), 'Mini de tres leches de durazno').click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 4 productos')
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
        // Pasteles de la casa da encargos; la vitrina, líneas de la vitrina de hoy.
        line(1, 'Tres leches de durazno', 'whole', '350.00', 'tres-leches-de-durazno', 'order'),
        // El Imposible tiene modelo (D95): el carrito guarda la imagen de su tarjeta (correcciones del 21 de noviembre).
        { ...line(21, 'Imposible', 'whole', '350.00', 'imposible', 'order'), image: 'imposible-modelo.webp' },
        line(30, 'Vaso de gelatina de mosaico', 'cup', '45.50', 'gelatina-de-mosaico', 'order'),
        line(3, 'Mini de tres leches de durazno', 'mini', '130.00', 'tres-leches-de-durazno', 'showcase'),
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

  test('what is left today caps the vitrina', async ({ page }) => {
    await openHome(page)
    const cake = addTo(showcase(page), 'Tres leches de durazno')
    await cake.click()
    await cake.click()
    await cake.click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await expect(notice(showcase(page))).toContainText('Ya tienes los 2 que quedan')
  })

  test('each section has its own notice, between its heading and its cards', async ({ page }) => {
    await openHome(page)
    await expect(page.locator('main').getByTestId('aviso-carrito')).toHaveCount(2)
    await addTo(showcase(page), 'Choco-pingüino').click()
    const vitrina = notice(showcase(page))
    await expect(vitrina).toHaveAttribute('role', 'status')
    await expect(vitrina).toContainText('Agregado al pedido')
    await expect(vitrina).toContainText('Choco-pingüino. Tienes 1 en tu pedido.')
    await expect(notice(featured(page))).toBeEmpty()
    const heading = (await showcase(page).getByRole('heading', { level: 2 }).boundingBox())!
    const box = (await vitrina.boundingBox())!
    const firstCard = (await showcase(page).getByRole('listitem').first().boundingBox())!
    expect(box.y).toBeGreaterThan(heading.y)
    expect(box.y + box.height).toBeLessThan(firstCard.y)
  })
})

test.describe('hidden sections and states', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('nothing loaded in the vitrina today hides it with its guirnaldas; the house cakes and the photos, both nata, have none between them', async ({ page }) => {
    await openHome(page, { showcase: [todayStock([])] })
    await expect(featured(page).getByRole('article').first()).toBeVisible()
    await expect(showcase(page)).toHaveCount(0)
    expect(await floors(page)).toEqual(['field:fresa', `duya:#f9c1c1:${NATA}`, 'field:nata', 'field:nata'])
    await expectClosingGarlandBelowGallery(page)
  })

  test('no featured products hides Pasteles de la casa: the hero and the vitrina, both fresa, have no guirnalda between them', async ({ page }) => {
    await openHome(page, { featured: [ok([])] })
    await expect(showcase(page).getByRole('listitem').first()).toBeVisible()
    await expect(featured(page)).toHaveCount(0)
    expect(await floors(page)).toEqual(['field:fresa', 'field:fresa', `duya:#f9c1c1:${NATA}`, 'field:nata'])
  })

  test('with nothing at all the hero meets the photos with a guirnalda and they close the page on nata', async ({ page }) => {
    await openHome(page, { featured: [ok([])], showcase: [todayStock([])] })
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
    expect(await floors(page)).toEqual(['field:fresa', `duya:#f9c1c1:${NATA}`, 'field:nata'])
    await expectClosingGarlandBelowGallery(page)
  })

  test('a vitrina with an error keeps its field: the floors are the same as with data', async ({ page }) => {
    await openHome(page, { showcase: [serverError] })
    await expect(featured(page).getByRole('article').first()).toBeVisible()
    await expect(showcase(page).getByRole('alert')).toContainText('No se pudo cargar la vitrina')
    expect(await floors(page)).toEqual([
      'field:fresa',
      `duya:#f9c1c1:${NATA}`,
      'field:nata',
      `duya:#fff4f4:${FRESA}`,
      'field:fresa',
      `duya:#f9c1c1:${NATA}`,
      'field:nata',
    ])
    await expectClosingGarlandBelowGallery(page)
  })

  test('a request that hangs ends in the error state when the timeout runs out', async ({ page }) => {
    await shortenCatalogTimeout(page, 300)
    await openHome(page, { showcase: ['hang'] })
    await expect(showcase(page).getByRole('alert')).toContainText('No se pudo cargar la vitrina', { timeout: 3_000 })
    await expect(showcase(page).locator('[aria-busy="true"]')).toHaveCount(0)
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
    await expect(heading).toHaveCSS('outline-color', MERMELADA)
    await expect(section.getByRole('radio')).toHaveCount(0)
  })

  test('a vitrina where every item is malformed shows its error instead of hiding', async ({ page }) => {
    await openHome(page, { showcase: [todayStock([{ offering_id: 'x' }, { offering_id: 0 }])] })
    await expect(showcase(page).getByRole('alert')).toContainText('No se pudo cargar la vitrina')
  })

  test('a malformed response is an error, not an empty section', async ({ page }) => {
    await openHome(page, { featured: [ok({ productos: [] })] })
    await expect(featured(page).getByRole('alert')).toContainText('No se pudieron cargar los pasteles de la casa')
    await expect(showcase(page).getByRole('listitem')).toHaveCount(8)
  })

  test('while loading: each section keeps its header, shows a busy skeleton and says what is loading', async ({ page }) => {
    await openHome(page, { featured: ['hang'], showcase: ['hang'] })
    for (const [section, label] of [
      [featured(page), 'Cargando los pasteles de la casa…'],
      [showcase(page), 'Cargando la vitrina…'],
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
    // Sobre la vitrina `fresa` el esqueleto es de `fresa-claro`, como en los demás campos `fresa`.
    await expect(showcase(page).locator('[data-esqueleto]').first()).toHaveCSS('background-color', 'rgb(255, 223, 223)')
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

})

// Correcciones del 21 de noviembre: en una laptop (1366-1536 × 720-800) el hero quedaba bajo y se cortaba abajo. En una pantalla
// de escritorio baja, el hero completo, con sus dos botones y la pista del pastel, cabe bajo la barra.
test.describe('hero on a short desktop screen', () => {
  // `gap`: lo más que puede quedar entre la barra y el logotipo. Antes eran unos 60 px a cualquier alto; ahora, entre más baja la
  // pantalla, más sube el contenido (con 800 px de alto el hero ya cabía y casi no cambia).
  for (const [width, height, gap] of [
    [1510, 745, 36],
    [1440, 720, 36],
    [1366, 768, 48],
    [1536, 800, 60],
  ]) {
    test(`at ${width} × ${height} the whole hero is visible under the bar`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openHome(page)
      const bar = (await page.getByTestId('barra').boundingBox())!
      const logo = (await hero(page).locator('h1 img').boundingBox())!
      const hint = (await page.locator('#pastel-pista').boundingBox())!
      const cake = (await page.getByTestId('pastel-portada').boundingBox())!
      for (const name of ['Realizar pedido', 'Ver la vitrina']) {
        const action = (await hero(page).getByRole('link', { name }).boundingBox())!
        expect(action.y + action.height).toBeLessThanOrEqual(height - 24)
      }
      expect(hint.y + hint.height).toBeLessThanOrEqual(height)
      expect(cake.y + cake.height).toBeLessThanOrEqual(height)
      expect(logo.y - (bar.y + bar.height)).toBeLessThanOrEqual(gap)
      expect(await page.evaluate(() => scrollY)).toBe(0)
    })
  }

  test('a taller screen keeps the hero as it was: the 600 px cake and 32 px above', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    expect((await page.getByTestId('pastel-portada').boundingBox())!.height).toBeCloseTo(600, 0)
    // 32 px arriba, el pastel de 600 px y 24 px abajo.
    expect((await hero(page).boundingBox())!.height).toBeCloseTo(656, 0)
  })
})

test.describe('mobile at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no horizontal overflow, the wordmark hides and the vitrina filters fill the width', async ({ page }) => {
    await openHome(page)
    await expect(showcase(page).getByRole('article').first()).toBeVisible()
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
    // Los filtros de la vitrina son la barra segmentada, de todo el ancho de la columna en móvil.
    const group = showcase(page).getByRole('group', { name: 'Filtrar la vitrina' })
    const bar = (await group.boundingBox())!
    expect(bar.width).toBeGreaterThan(390 - 2 * 16 - 1)
    // Todo lo que se toca mide al menos 44 px.
    for (const control of await page.locator('main').getByRole('button').all()) {
      if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('Tab goes through the hero actions; arrows move between the chips; focus is visible on the segmented bar', async ({ page }) => {
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
    // Barra segmentada sobre `fresa`: el elegido se llena de `mermelada` con texto `betun`; el foco va por fuera, en `mermelada`.
    const chosen = chip(showcase(page), 'Pasteles')
    await expect(chosen).toHaveCSS('background-color', MERMELADA)
    await expect(chosen).toHaveCSS('color', 'rgb(255, 251, 251)')
    await expect(chosen).toHaveCSS('outline-style', 'solid')
    await expect(chosen).toHaveCSS('outline-color', MERMELADA)
    await expect(chip(showcase(page), 'Todo')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(chip(showcase(page), 'Todo')).toHaveCSS('color', MERMELADA)

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
