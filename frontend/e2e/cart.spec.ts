import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

// No hay corredor de pruebas unitarias: los módulos se importan en el navegador desde el servidor de desarrollo.
const CART_MODULE = '/src/models/cart.ts'
const ADD_MODULE = '/src/viewmodels/useAddToCart.ts'
const KEY = 'ilusion.cart.v1'

const durazno = {
  offeringId: 101,
  name: 'Tres leches de durazno',
  presentation: 'whole',
  unitPrice: '350.00',
  slug: 'tres-leches-de-durazno',
}

const cajeta = {
  offeringId: 102,
  name: 'Rebanada de tres leches de cajeta',
  presentation: 'slice',
  unitPrice: '35.00',
  slug: 'tres-leches-de-cajeta',
}

const DURAZNO = 'Tres leches de durazno'
const CAJETA = 'Rebanada de tres leches de cajeta'

function cartLink(page: Page) {
  return page.getByRole('banner').getByRole('link', { name: /^Carrito/ })
}

function badge(page: Page) {
  return cartLink(page).getByTestId('contador-carrito')
}

function addButton(page: Page, name: string) {
  return page.getByRole('button', { name: `Agregar al pedido: ${name}` })
}

function notice(page: Page) {
  return page.getByTestId('aviso-carrito')
}

function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)
}

/** Guarda un carrito antes de que cargue la página. */
async function seedCart(page: Page, value: unknown) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw: JSON.stringify(value) })
}

/** Tres clics seguidos en la misma tarea, sin dar tiempo a que React vuelva a pintar entre uno y otro. */
async function clickThreeTimesAtOnce(button: Locator) {
  await button.evaluate((element) => {
    const view = element.ownerDocument.defaultView!
    for (let i = 0; i < 3; i++) element.dispatchEvent(new view.MouseEvent('click', { bubbles: true }))
  })
}

/** Junta los errores de la página y de la consola; una advertencia no cuenta. */
function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function openSample(page: Page) {
  await mockStoreInfo(page)
  await page.goto('/muestra')
  await expect(page.getByRole('heading', { level: 2, name: 'Carrito' })).toBeVisible()
}

test.describe('cart model', () => {
  test.beforeEach(async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/')
  })

  test('parseCart keeps the valid lines, trimmed, and drops anything malformed', async ({ page }) => {
    const result = await page.evaluate(
      async ({ url, item }) => {
        const { parseCart } = await import(url)
        return {
          notObject: parseCart('texto'),
          nullValue: parseCart(null),
          noItems: parseCart({}),
          itemsNotArray: parseCart({ items: 'x' }),
          mixed: parseCart({
            items: [
              item,
              { ...item, offeringId: 102, quantity: 0 },
              { ...item, offeringId: 103, quantity: 1.5 },
              { ...item, offeringId: 104, quantity: 1000 },
              { ...item, offeringId: -1 },
              { ...item, offeringId: '105' },
              { ...item, offeringId: 106, unitPrice: 350 },
              { ...item, offeringId: 107, unitPrice: '-1.00' },
              { ...item, offeringId: 108, unitPrice: '123456789.00' },
              { ...item, offeringId: 109, name: '  ' },
              { ...item, offeringId: 110, name: 'x'.repeat(81) },
              { ...item, offeringId: 111, slug: '../admin' },
              { ...item, offeringId: 112, presentation: 'Completo' },
              { ...item, offeringId: 113, kind: undefined },
              { ...item, offeringId: 114, kind: 'design' },
              { ...item, quantity: 4 },
              { ...item, offeringId: 115, name: `  ${item.name}  `, slug: ` ${item.slug} `, unitPrice: ' 350.00 ' },
              null,
              'línea',
            ],
          }),
        }
      },
      { url: CART_MODULE, item: { ...durazno, kind: 'offering', quantity: 2 } },
    )
    expect(result.notObject).toEqual([])
    expect(result.nullValue).toEqual([])
    expect(result.noItems).toEqual([])
    expect(result.itemsNotArray).toEqual([])
    // Una línea repetida se descarta: la primera manda. Lo que se conserva va recortado.
    expect(result.mixed).toEqual([
      { ...durazno, kind: 'offering', quantity: 2 },
      { ...durazno, offeringId: 115, kind: 'offering', quantity: 2 },
    ])
  })

  test(`parseCart reads at most 100 lines`, async ({ page }) => {
    const result = await page.evaluate(
      async ({ url, item }) => {
        const { parseCart, MAX_LINES } = await import(url)
        const many = Array.from({ length: 150 }, (_, i) => ({ ...item, offeringId: i + 1 }))
        const junkFirst = [...Array.from({ length: 100 }, () => 'basura'), item]
        return { max: MAX_LINES, many: parseCart({ items: many }).length, junkFirst: parseCart({ items: junkFirst }).length }
      },
      { url: CART_MODULE, item: { ...durazno, kind: 'offering', quantity: 1 } },
    )
    expect(result).toEqual({ max: 100, many: 100, junkFirst: 0 })
  })

  test('addItem merges by offering, refreshes the snapshot, trims it and never goes over maxQuantity', async ({ page }) => {
    const result = await page.evaluate(
      async ({ url, offering }) => {
        const { addItem } = await import(url)
        const one = addItem([], { ...offering, name: `  ${offering.name} ` }, 1)
        const three = addItem(one.items, { ...offering, unitPrice: '360.00' }, 2)
        const partial = addItem(three.items, offering, 5, 4)
        const none = addItem(partial.items, offering, 1, 4)
        const stale = addItem(partial.items, offering, 1, 2)
        const soldOut = addItem([], offering, 1, 0)
        return {
          one,
          three,
          partial,
          none,
          stale: { added: stale.added, quantity: stale.quantity, sameList: stale.items === partial.items },
          soldOut,
          firstUntouched: one.items[0].quantity,
        }
      },
      { url: CART_MODULE, offering: durazno },
    )
    expect(result.one).toEqual({ items: [{ ...durazno, kind: 'offering', quantity: 1 }], added: 1, quantity: 1 })
    expect(result.three).toEqual({ items: [{ ...durazno, unitPrice: '360.00', kind: 'offering', quantity: 3 }], added: 2, quantity: 3 })
    expect(result.partial.added).toBe(1)
    expect(result.partial.quantity).toBe(4)
    expect(result.none.added).toBe(0)
    expect(result.none.quantity).toBe(4)
    // Con menos existencias que las del carrito no agrega ni recorta: la línea queda igual.
    expect(result.stale).toEqual({ added: 0, quantity: 4, sameList: true })
    expect(result.soldOut).toEqual({ items: [], added: 0, quantity: 0 })
    // Las funciones no modifican la lista que reciben.
    expect(result.firstUntouched).toBe(1)
  })

  test('addItem rejects an offering with the wrong shape with a TypeError', async ({ page }) => {
    const outcomes = await page.evaluate(
      async ({ url, offering }) => {
        const { addItem } = await import(url)
        const invalid = [
          { ...offering, presentation: 'Completo' },
          { ...offering, name: ' ' },
          { ...offering, offeringId: 0 },
          { ...offering, unitPrice: 350 },
          { ...offering, slug: '../admin' },
          { ...offering, name: 'x'.repeat(81) },
        ]
        return invalid.map((candidate) => {
          try {
            addItem([], candidate, 1)
            return 'aceptado'
          } catch (error) {
            return (error as Error).name
          }
        })
      },
      { url: CART_MODULE, offering: durazno },
    )
    expect(outcomes).toEqual(Array(6).fill('TypeError'))
  })

  test('quantities outside 1 to 999, a bad maxQuantity or a 101st line are a RangeError', async ({ page }) => {
    const outcomes = await page.evaluate(
      async ({ url, offering }) => {
        const { addItem } = await import(url)
        const full = Array.from({ length: 100 }, (_, i) => ({ ...offering, offeringId: i + 1, kind: 'offering', quantity: 1 }))
        const atCap = [{ ...offering, kind: 'offering', quantity: 999 }]
        const attempts: (() => unknown)[] = [
          () => addItem([], offering, 0),
          () => addItem([], offering, 1.5),
          () => addItem([], offering, Number.NaN),
          () => addItem([], offering, 1000),
          () => addItem([], offering, 1, -1),
          () => addItem([], offering, 1, 2.5),
          () => addItem(atCap, offering, 1),
          () => addItem(full, { ...offering, offeringId: 500 }, 1),
          () => addItem(full, { ...offering, offeringId: 1 }, 1),
        ]
        return attempts.map((attempt) => {
          try {
            attempt()
            return 'aceptado'
          } catch (error) {
            return (error as Error).name
          }
        })
      },
      { url: CART_MODULE, offering: durazno },
    )
    // La última suma a una línea que ya existe: el tope de líneas no aplica.
    expect(outcomes).toEqual([...Array(8).fill('RangeError'), 'aceptado'])
  })

  test('removeItem drops the line and cartCount sums quantities', async ({ page }) => {
    const result = await page.evaluate(
      async ({ url, offering }) => {
        const { addItem, removeItem, cartCount } = await import(url)
        const items = addItem(addItem([], offering, 2).items, { ...offering, offeringId: 102 }, 3).items
        return {
          count: cartCount(items),
          removed: removeItem(items, 101).map((i: { offeringId: number }) => i.offeringId),
          empty: cartCount([]),
        }
      },
      { url: CART_MODULE, offering: durazno },
    )
    expect(result).toEqual({ count: 5, removed: [102], empty: 0 })
  })

  test('the add notice names the product, says how many there are and explains the stock limit', async ({ page }) => {
    const notices = await page.evaluate(
      async ({ url, offering }) => {
        const { describeAdd } = await import(url)
        return {
          full: describeAdd(offering, { added: 1, quantity: 2 }, 1),
          partial: describeAdd(offering, { added: 1, quantity: 3 }, 2, 3),
          none: describeAdd(offering, { added: 0, quantity: 3 }, 1, 3),
          lastOne: describeAdd(offering, { added: 0, quantity: 1 }, 1, 1),
          soldOut: describeAdd(offering, { added: 0, quantity: 0 }, 1, 0),
          stale: describeAdd(offering, { added: 0, quantity: 3 }, 1, 2),
          staleLastOne: describeAdd(offering, { added: 0, quantity: 3 }, 1, 1),
          staleSoldOut: describeAdd(offering, { added: 0, quantity: 3 }, 1, 0),
        }
      },
      { url: ADD_MODULE, offering: durazno },
    )
    expect(notices.full).toEqual({ tone: 'success', title: 'Agregado al pedido', detail: 'Tres leches de durazno. Tienes 2 en tu pedido.' })
    expect(notices.partial).toEqual({
      tone: 'success',
      title: 'Agregado al pedido',
      detail: 'Tres leches de durazno. Solo quedan 3: tienes 3 en tu pedido.',
    })
    expect(notices.none).toEqual({ tone: 'attention', title: 'Ya tienes los 3 que quedan', detail: 'Tres leches de durazno no se agregó otra vez.' })
    expect(notices.lastOne).toEqual({ tone: 'attention', title: 'Ya tienes el único que queda', detail: 'Tres leches de durazno no se agregó otra vez.' })
    expect(notices.soldOut).toEqual({ tone: 'attention', title: 'Ya no quedan', detail: 'Tres leches de durazno no se agregó al pedido.' })
    const staleDetail = 'Tres leches de durazno: tienes 3 en tu pedido; revisa tu carrito.'
    expect(notices.stale).toEqual({ tone: 'attention', title: 'Solo quedan 2', detail: staleDetail })
    expect(notices.staleLastOne).toEqual({ tone: 'attention', title: 'Solo queda 1', detail: staleDetail })
    expect(notices.staleSoldOut).toEqual({ tone: 'attention', title: 'Ya no quedan', detail: staleDetail })
  })
})

test.describe('cart in the site', () => {
  test('the header counter goes up and its accessible name follows', async ({ page }) => {
    await openSample(page)
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
    await expect(badge(page)).toHaveCount(0)

    await addButton(page, DURAZNO).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
    await expect(badge(page)).toHaveText('1')
    await expect(badge(page)).toHaveAttribute('aria-hidden', 'true')

    await addButton(page, DURAZNO).click()
    await addButton(page, CAJETA).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos')
    await expect(badge(page)).toHaveText('3')
    await expect(cartLink(page)).toHaveAttribute('href', '/carrito')
  })

  test('the card shows the presentation label, never the API code', async ({ page }) => {
    await openSample(page)
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: DURAZNO }) })
    await expect(card).toContainText('Completo, $350')
    await expect(card).not.toContainText('whole')
  })

  test('the badge uses palette tokens: mermelada with betun text', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await expect(badge(page)).toHaveCSS('background-color', 'rgb(94, 25, 33)')
    await expect(badge(page)).toHaveCSS('color', 'rgb(255, 251, 251)')
  })

  test('more than 99 shows 99+ but the accessible name keeps the real number', async ({ page }) => {
    await seedCart(page, { items: [{ ...durazno, kind: 'offering', quantity: 120 }] })
    await openSample(page)
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 120 productos')
    await expect(badge(page)).toHaveText('99+')
  })

  test('maxQuantity is respected and the third click explains why nothing was added', async ({ page }) => {
    await openSample(page)
    const slice = addButton(page, CAJETA)
    await slice.click()
    await slice.click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await slice.click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await expect(notice(page)).toContainText('Ya tienes los 2 que quedan')
  })

  test('three clicks in the same task stop at the cap, and without a cap all three count', async ({ page }) => {
    await openSample(page)
    await clickThreeTimesAtOnce(addButton(page, CAJETA))
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await clickThreeTimesAtOnce(addButton(page, DURAZNO))
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 5 productos')
    expect(await stored(page)).toEqual({
      items: [
        { ...cajeta, kind: 'offering', quantity: 2 },
        { ...durazno, kind: 'offering', quantity: 3 },
      ],
    })
  })

  test('the add notice lives in a status region that is there before the first click', async ({ page }) => {
    await openSample(page)
    const region = notice(page)
    await expect(region).toHaveAttribute('role', 'status')
    await expect(region).toBeEmpty()
    await addButton(page, DURAZNO).click()
    await expect(region).toContainText('Agregado al pedido')
    await expect(region).toContainText('Tres leches de durazno. Tienes 1 en tu pedido.')
    // El aviso de adentro no lleva su propio role: dos regiones anidadas pueden leerse dos veces.
    await expect(region.locator('[role]')).toHaveCount(0)
    await addButton(page, DURAZNO).click()
    await expect(region).toContainText('Tienes 2 en tu pedido.')
  })

  test('at the cap the same text is mounted again, so it is read again', async ({ page }) => {
    await openSample(page)
    const slice = addButton(page, CAJETA)
    await slice.click()
    await slice.click()
    await slice.click()
    await expect(notice(page)).toContainText('Ya tienes los 2 que quedan')
    const first = await notice(page).locator(':scope > div').elementHandle()
    await slice.click()
    await expect.poll(() => first!.evaluate((element) => element.isConnected)).toBe(false)
    await expect(notice(page)).toContainText('Ya tienes los 2 que quedan')
  })

  test('when the cart already has more than what is left, nothing is trimmed and the notice says so', async ({ page }) => {
    await seedCart(page, { items: [{ ...cajeta, kind: 'offering', quantity: 3 }] })
    await openSample(page)
    await addButton(page, CAJETA).click()
    await expect(notice(page)).toContainText('Solo quedan 2')
    await expect(notice(page)).toContainText('Rebanada de tres leches de cajeta: tienes 3 en tu pedido; revisa tu carrito.')
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos')
  })

  test('the notice goes away when the quantity it talks about changes', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await addButton(page, CAJETA).click()
    await expect(notice(page)).toContainText(CAJETA)
    // Quitar otra presentación no cambia lo que dice el aviso.
    await page.getByRole('button', { name: `Quitar: ${DURAZNO}` }).click()
    await expect(notice(page)).toContainText(CAJETA)
    await page.getByRole('button', { name: `Quitar: ${CAJETA}` }).click()
    await expect(notice(page)).toBeEmpty()
    await expect(notice(page)).toHaveAttribute('role', 'status')
  })

  test('the cart survives a reload and is stored under the versioned key', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await addButton(page, DURAZNO).click()
    expect(await stored(page)).toEqual({ items: [{ ...durazno, kind: 'offering', quantity: 2 }] })
    await page.reload()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
  })

  test('"Quitar" and "Vaciar el carrito" also survive a reload', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await addButton(page, CAJETA).click()
    await page.getByRole('button', { name: `Quitar: ${DURAZNO}` }).click()
    await page.reload()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
    await expect(page.getByRole('button', { name: `Quitar: ${CAJETA}` })).toBeVisible()
    await page.getByRole('button', { name: 'Vaciar el carrito' }).click()
    await page.reload()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
    expect(await stored(page)).toEqual({ items: [] })
  })

  test('the counter stays when navigating inside the site', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await page.getByRole('banner').getByRole('link', { name: 'Catálogo' }).click()
    await expect(page).toHaveURL(/\/catalogo$/)
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
  })

  for (const [label, raw] of [
    ['broken JSON', '{"items": [{'],
    ['the wrong shape', '[1, 2, 3]'],
    ['invalid lines', JSON.stringify({ items: [{ offeringId: 'x', quantity: -3 }] })],
  ] as const) {
    test(`stored data with ${label} gives an empty cart without errors`, async ({ page }) => {
      const errors = collectErrors(page)
      await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: raw })
      await openSample(page)
      await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
      await addButton(page, DURAZNO).click()
      await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
      expect(errors).toEqual([])
    })
  }

  test('when the browser blocks storage the cart still works for the visit, without errors', async ({ page }) => {
    const errors = collectErrors(page)
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('El almacenamiento está bloqueado.', 'SecurityError')
        },
      })
    })
    await openSample(page)
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
    await addButton(page, DURAZNO).click()
    await addButton(page, DURAZNO).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await expect(notice(page)).toContainText('Agregado al pedido')
    expect(errors).toEqual([])
  })

  test('when storage is full the cart still works for the visit, without errors', async ({ page }) => {
    const errors = collectErrors(page)
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('Sin espacio.', 'QuotaExceededError')
      }
    })
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await addButton(page, DURAZNO).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    expect(errors).toEqual([])
  })

  test('two tabs stay in sync: adding in one and emptying in the other', async ({ page, context }) => {
    await openSample(page)
    const other = await context.newPage()
    await openSample(other)
    await addButton(page, DURAZNO).click()
    await expect(cartLink(other)).toHaveAccessibleName('Carrito, 1 producto')
    await addButton(other, CAJETA).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 2 productos')
    await other.getByRole('button', { name: 'Vaciar el carrito' }).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
    await expect(cartLink(other)).toHaveAccessibleName('Carrito, vacío')
  })

  test('adding starts from what is stored, so a change whose event has not arrived is not lost', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    // Escribir desde la misma pestaña no dispara `storage` en ella: es una pestaña a la que el aviso aún no llegó.
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: KEY, value: { items: [{ ...durazno, kind: 'offering', quantity: 1 }, { ...cajeta, kind: 'offering', quantity: 1 }] } },
    )
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
    await addButton(page, DURAZNO).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 3 productos')
    expect(await stored(page)).toEqual({
      items: [
        { ...durazno, kind: 'offering', quantity: 2 },
        { ...cajeta, kind: 'offering', quantity: 1 },
      ],
    })
  })

  test('localStorage.clear() in another tab empties the cart', async ({ page, context }) => {
    await openSample(page)
    const other = await context.newPage()
    await openSample(other)
    await addButton(page, DURAZNO).click()
    await expect(cartLink(other)).toHaveAccessibleName('Carrito, 1 producto')
    await other.evaluate(() => localStorage.clear())
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, vacío')
  })

  test('the stock limit also holds across tabs', async ({ page, context }) => {
    await openSample(page)
    const other = await context.newPage()
    await openSample(other)
    await addButton(page, CAJETA).click()
    await addButton(page, CAJETA).click()
    await expect(cartLink(other)).toHaveAccessibleName('Carrito, 2 productos')
    await addButton(other, CAJETA).click()
    await expect(cartLink(other)).toHaveAccessibleName('Carrito, 2 productos')
    await expect(notice(other)).toContainText('Ya tienes los 2 que quedan')
  })

  test('remove takes one line out of the cart', async ({ page }) => {
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await addButton(page, CAJETA).click()
    await page.getByRole('button', { name: `Quitar: ${DURAZNO}` }).click()
    await expect(cartLink(page)).toHaveAccessibleName('Carrito, 1 producto')
    await expect(page.getByRole('button', { name: `Quitar: ${DURAZNO}` })).toHaveCount(0)
  })

  test('at 390px the counter shows next to the menu button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSample(page)
    await addButton(page, DURAZNO).click()
    await expect(badge(page)).toBeVisible()
    await expect(badge(page)).toHaveText('1')
    const link = (await cartLink(page).boundingBox())!
    const count = (await badge(page).boundingBox())!
    // El contador queda dentro del área táctil del enlace, sin salirse de la barra.
    expect(count.x + count.width).toBeLessThanOrEqual(link.x + link.width + 0.5)
    expect(count.y).toBeGreaterThanOrEqual(link.y - 0.5)
  })
})
