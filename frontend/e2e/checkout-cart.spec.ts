import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { cajetaSlice, designLine, DRAFT_KEY, durazno, quoteDesignLine, seedCart, storedCart } from './support/checkout.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/carrito` (D66): cada tipo de línea, cantidades, quitar, la mezcla de vitrina y diseño y el estado vacío. */

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const products = (page: Page) => page.getByRole('region', { name: 'Productos' })
const summary = (page: Page) => page.getByRole('region', { name: 'Resumen' })
const line = (page: Page, name: string) => products(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name, level: 3 }) })

test('an empty cart says so and offers the showcase and the catalog', async ({ page }) => {
  await page.goto('/carrito')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu carrito')
  await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
  await expect(page.getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  // El estado vacío del mockup no lleva los pasos de la compra.
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' })).toHaveCount(0)
})

test('a catalog order and a designed cake, with the base deposit apart from the estimate', async ({ page }) => {
  await seedCart(page, [durazno, designLine])
  await page.goto('/carrito')
  const steps = page.getByRole('navigation', { name: 'Pasos de tu compra' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('Carrito')
  const order = line(page, 'Tres leches de durazno')
  await expect(order).toContainText('Por encargo')
  await expect(order).toContainText('$350')
  await expect(order).toContainText('$350 por pieza')
  await expect(order).toContainText('Completo')
  await expect(order.getByRole('link', { name: 'Tres leches de durazno' })).toHaveAttribute('href', '/pasteles/tres-leches-de-durazno')
  await expect(order.getByRole('button', { name: /Editar pedido/ })).toHaveCount(0)
  const cake = line(page, designLine.name)
  await expect(cake).toContainText('$3,825')
  await expect(cake).toContainText('Estimado')
  await expect(cake).toContainText('Pan: Chocolate')
  await expect(cake).toContainText('Incluye base para 15 kg')
  await expect(cake).toContainText('Depósito de $200: te lo devolvemos al regresar la base.')
  await expect(cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` })).toBeVisible()
  await expect(cake.getByRole('group', { name: /Cantidad/ })).toHaveCount(0)
  const resume = summary(page)
  await expect(resume).toContainText('Productos (2)')
  await expect(resume).toContainText('Total estimado del pedido')
  await expect(resume).toContainText('$4,175 MXN')
  await expect(resume).toContainText('Depósito de la base, se devuelve')
  await expect(resume).toContainText('$200')
  await expect(resume).toContainText('Hoy pagas un anticipo del pedido y el depósito de la base; el resto, al entregar.')
  // La entrega todavía no se elige: el resumen no dice nada de ella (tanda 1).
  await expect(resume).not.toContainText('Entrega')
  await expect(resume).not.toContainText('Se elige en el siguiente paso')
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toHaveAttribute('href', '/pedido/entrega')
})

test('only showcase or slices: the summary says it is paid in full today, with no advance', async ({ page }) => {
  await seedCart(page, [cajetaSlice])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Hoy pagas todo: lo de la vitrina de hoy se paga completo.')
  await expect(summary(page)).not.toContainText('anticipo')
})

test('only orders without a base: the advance today and the rest on delivery', async ({ page }) => {
  await seedCart(page, [durazno])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Hoy pagas un anticipo del pedido; el resto, al entregar.')
  await expect(summary(page)).not.toContainText('vitrina')
})

test('quantities change the line and the estimate, and removing a line keeps the focus', async ({ page }) => {
  await seedCart(page, [cajetaSlice, durazno])
  await page.goto('/carrito')
  const slice = line(page, 'Rebanada de tres leches de cajeta')
  await expect(slice).toContainText('En vitrina hoy')
  await expect(slice).toContainText('$70')
  await expect(slice).toContainText('$35 la rebanada')
  // Encargo y vitrina juntos: el anticipo es solo de los encargos (regla 10).
  await expect(summary(page)).toContainText('Hoy pagas el anticipo de los encargos y lo de la vitrina completo.')
  await slice.getByRole('button', { name: 'Agregar uno de Rebanada de tres leches de cajeta' }).click()
  await expect(slice).toContainText('$105')
  await expect(summary(page)).toContainText('Productos (4)')
  await expect(summary(page)).toContainText('$455 MXN')
  expect((await storedCart(page)).items[0].quantity).toBe(3)
  // El contador del encabezado sigue al carrito.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Carrito, 4 productos' })).toBeVisible()
  await slice.getByRole('button', { name: 'Quitar uno de Rebanada de tres leches de cajeta' }).click()
  await expect(slice).toContainText('$70')
  await slice.getByRole('button', { name: 'Quitar Rebanada de tres leches de cajeta' }).click()
  await expect(line(page, 'Rebanada de tres leches de cajeta')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Quitaste Rebanada de tres leches de cajeta de tu pedido.' })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2, name: 'Productos' })).toBeFocused()
  // La última línea: el foco pasa al carrito vacío.
  await line(page, 'Tres leches de durazno').getByRole('button', { name: 'Quitar Tres leches de durazno' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeFocused()
  expect((await storedCart(page)).items).toEqual([])
})

test('only the showcase: today is paid in full', async ({ page }) => {
  await seedCart(page, [cajetaSlice])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Hoy pagas todo: lo de la vitrina de hoy se paga completo.')
})

test('the showcase and a designed cake cannot continue together until one goes', async ({ page }) => {
  await seedCart(page, [cajetaSlice, designLine])
  await page.goto('/carrito')
  const resume = summary(page)
  await expect(resume).toContainText('La vitrina de hoy y tu pastel diseñado van en pedidos separados')
  const continueButton = resume.getByRole('button', { name: 'Continuar a entrega' })
  await expect(continueButton).toBeDisabled()
  await expect(continueButton).toHaveAccessibleDescription(/Quita uno de los dos para continuar/)
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toHaveCount(0)
  await line(page, 'Rebanada de tres leches de cajeta').getByRole('button', { name: /^Quitar Rebanada/ }).click()
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toBeVisible()
})

test('two decorations to quote cannot go in one order', async ({ page }) => {
  await seedCart(page, [quoteDesignLine('k1', 'otra1'), quoteDesignLine('k2', 'otra2')])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Un pedido lleva una sola decoración por cotizar')
  await expect(summary(page).getByRole('button', { name: 'Continuar a entrega' })).toBeDisabled()
  await expect(summary(page)).toContainText('La decoración por cotizar no está en el total')
  await expect(line(page, quoteDesignLine(null).name).first()).toContainText('En pausa por cotización')
})

test('"Editar pedido" opens the cake in Diseña tu pastel, and asks first over a design in progress', async ({ page }) => {
  await mockCakeDesignOptions(page)
  await seedCart(page, [designLine])
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('__draftSeeded')) {
      sessionStorage.setItem(key, JSON.stringify({ people: 60, cakeType: 'envinado', confirmed: [1] }))
      sessionStorage.setItem('__draftSeeded', '1')
    }
  }, DRAFT_KEY)
  await page.goto('/carrito')
  const cake = line(page, designLine.name)
  await cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
  await expect(cake).toContainText('Tienes otro pastel a medias en Diseña tu pastel')
  await expect(cake.getByRole('button', { name: 'Editar este pastel' })).toBeFocused()
  await cake.getByRole('button', { name: 'Seguir en el carrito' }).click()
  await expect(cake).not.toContainText('Tienes otro pastel a medias')
  await cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
  await cake.getByRole('button', { name: 'Editar este pastel' }).click()
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=/)
  const draft = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'), DRAFT_KEY)
  expect(draft).toMatchObject({ people: 100, bread: 'chocolate', flavors: ['zarzamora'], decoration: 'flores', messageEnabled: true, replaces: 'pastel15kg' })
  // El pastel sigue en el carrito hasta que se agregue el editado.
  expect((await storedCart(page)).items).toHaveLength(1)
})

test('keyboard: every control is reachable with a visible focus ring', async ({ page }) => {
  await seedCart(page, [durazno])
  await page.goto('/carrito')
  const continueLink = summary(page).getByRole('link', { name: 'Continuar a entrega' })
  for (let i = 0; i < 40 && !(await continueLink.evaluate((element) => element === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(continueLink).toBeFocused()
  const outline = await continueLink.evaluate((element) => getComputedStyle(element).outlineStyle)
  expect(outline).toBe('solid')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fits 390 px, with the summary after the products and only the current step named', async ({ page }) => {
    await seedCart(page, [durazno, designLine])
    await page.goto('/carrito')
    await expect(summary(page)).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const productsBox = await products(page).boundingBox()
    const summaryBox = await summary(page).boundingBox()
    expect(summaryBox!.y).toBeGreaterThan(productsBox!.y + productsBox!.height - 1)
    // "Entrega" queda solo para el lector de pantalla: su caja mide 1 px.
    const label = page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('li', { hasText: 'Entrega' }).locator('> span').nth(1)
    expect(await label.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  })
})

test.describe('removing a line', () => {
  type Shift = { line: string; from: string; to: string; duration: unknown; easing: unknown }

  /** Anota cada `animate()` de una línea del carrito: el recorrido dura 250 ms y puede terminar antes de que la prueba lo lea. */
  const recordShifts = (page: Page) =>
    page.addInitScript(() => {
      const shifts: Shift[] = []
      Reflect.set(window, '__shifts', shifts)
      const original = Element.prototype.animate
      Element.prototype.animate = function (this: Element, keyframes, options) {
        const line = this.getAttribute('data-linea')
        if (line && Array.isArray(keyframes)) {
          const timing = typeof options === 'object' ? options : {}
          shifts.push({ line, from: String(keyframes[0].transform), to: String(keyframes.at(-1)?.transform), duration: timing.duration, easing: timing.easing })
        }
        return original.call(this, keyframes, options)
      }
    })
  const shifts = (page: Page) => page.evaluate(() => Reflect.get(window, '__shifts') as Shift[])
  const emptyCard = (page: Page) => page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' }).locator('xpath=..')

  test('the lines below slide up into place; the removed one goes at once, and the focus and the announcement stay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await recordShifts(page)
    await seedCart(page, [durazno, cajetaSlice, designLine])
    await page.goto('/carrito')
    await expect(products(page).getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(3)
    await line(page, 'Tres leches de durazno').getByRole('button', { name: 'Quitar Tres leches de durazno' }).click()
    await expect(line(page, 'Tres leches de durazno')).toHaveCount(0)
    await expect.poll(async () => (await shifts(page)).length).toBe(2)
    for (const shift of await shifts(page)) {
      expect(Number(/translateY\((-?[\d.]+)px\)/.exec(shift.from)?.[1])).toBeGreaterThan(0)
      expect(shift).toMatchObject({ to: 'none', duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
    }
    expect((await shifts(page)).map((shift) => shift.line)).toEqual([`${cajetaSlice.fulfillment}-${cajetaSlice.offeringId}`, `design-${designLine.designId}`])
    await expect(page.getByRole('heading', { level: 2, name: 'Productos' })).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: 'Quitaste Tres leches de durazno de tu pedido.' })).toHaveCount(1)
    // Al terminar, cada línea queda en su lugar.
    await expect.poll(() => products(page).locator('[data-linea]').evaluateAll((items) => items.flatMap((item) => item.getAnimations()).length)).toBe(0)
    await expect(products(page).locator('[data-linea]').first()).toHaveCSS('transform', 'none')
  })

  test('removing the last line moves nothing above it, and changing a quantity moves nothing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await recordShifts(page)
    await seedCart(page, [durazno, { ...cajetaSlice, quantity: 2 }])
    await page.goto('/carrito')
    const slice = line(page, 'Rebanada de tres leches de cajeta')
    await slice.getByRole('button', { name: 'Quitar uno de Rebanada de tres leches de cajeta' }).click()
    await expect(slice).toContainText('$35')
    await slice.getByRole('button', { name: 'Quitar Rebanada de tres leches de cajeta' }).click()
    await expect(slice).toHaveCount(0)
    await page.waitForTimeout(100)
    expect(await shifts(page)).toEqual([])
  })

  test('the empty cart rises in after the last line goes, and not when the page opens empty', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await seedCart(page, [durazno])
    await page.goto('/carrito')
    await line(page, 'Tres leches de durazno').getByRole('button', { name: 'Quitar Tres leches de durazno' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeFocused()
    await expect(emptyCard(page)).toHaveCSS('animation-name', 'aparece')
    await expect(emptyCard(page)).toHaveCSS('animation-duration', '0.25s')
    await expect.poll(() => emptyCard(page).evaluate((element) => element.getAnimations().length)).toBe(0)
    await expect(emptyCard(page)).toHaveCSS('opacity', '1')
    await page.reload()
    await expect(emptyCard(page)).toBeVisible()
    await expect(emptyCard(page)).toHaveCSS('animation-name', 'none')
  })

  test('with reduced motion the lines jump to their place and the empty cart just appears', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await recordShifts(page)
    await seedCart(page, [durazno, cajetaSlice])
    await page.goto('/carrito')
    await line(page, 'Tres leches de durazno').getByRole('button', { name: 'Quitar Tres leches de durazno' }).click()
    await expect(line(page, 'Tres leches de durazno')).toHaveCount(0)
    await line(page, 'Rebanada de tres leches de cajeta').getByRole('button', { name: 'Quitar Rebanada de tres leches de cajeta' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeFocused()
    expect(await shifts(page)).toEqual([])
    await expect(emptyCard(page)).toHaveCSS('animation-name', 'none')
  })
})
