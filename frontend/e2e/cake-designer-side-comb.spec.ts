import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El peinado lateral en el paso 5 (tanda 4): un renglón con casilla, "Peinado lateral", marcado por omisión. Quitarlo deja los
 * costados lisos en la vista previa; la elección se guarda en el borrador, se ve en "Tu pastel", en la revisión y en el carrito, y
 * llega al pedido como `side_comb`.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const DRAFT_KEY = 'ilusion.cakeDesign.v1'
const ORDERS_MODULE = '/src/models/orders.ts'

/** Un borrador de antes del peinado: no trae `sideComb`. */
const DRAFT_TO_STEP_5 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.rosa, decoration: 'ninguna', confirmed: [1, 2, 3, 4],
}

async function open(page: Page, step = 5, draft: object = DRAFT_TO_STEP_5) {
  // Solo la primera vez: tras recargar, manda el borrador que guardó la propia pantalla.
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value)
    },
    { key: DRAFT_KEY, value: JSON.stringify(draft) },
  )
  await mockCakeDesignOptions(page, { status: 200, body: cakeDesignOptions })
  await mockCakeDesignPrice(page, cakeDesignOptions)
  await page.goto(`/pedido/disena?paso=${step}`)
  await expect(page.locator('#paso-titulo')).toBeVisible()
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const comb = (page: Page) => card(page).getByRole('checkbox', { name: /Peinado lateral/ })
const preview = (page: Page) => page.getByTestId('vista-previa')
const proceed = (page: Page, name = 'Continuar') => card(page).getByRole('button', { name, exact: true }).click()
const draftOf = (page: Page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}'), DRAFT_KEY)

test('the coverage step offers side combing, checked by default, and the preview combs every tier', async ({ page }) => {
  await open(page)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await expect(comb(page)).toBeChecked()
  // La palabra va con el control: el renglón dice qué es, no solo una casilla.
  await expect(card(page).getByText('Surcos horizontales en los costados del pastel.')).toBeVisible()
  await expect(preview(page)).toHaveAttribute('data-combed', '2')
})

test('unchecking it leaves smooth sides, and the choice survives a reload', async ({ page }) => {
  await open(page)
  await comb(page).uncheck()
  await expect(preview(page)).toHaveAttribute('data-combed', '0')
  expect((await draftOf(page)).sideComb).toBe(false)
  await page.reload()
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await expect(comb(page)).not.toBeChecked()
  await expect(preview(page)).toHaveAttribute('data-combed', '0')
  // Y se vuelve a poner con el teclado.
  await comb(page).focus()
  await page.keyboard.press('Space')
  await expect(comb(page)).toBeChecked()
  await expect(preview(page)).toHaveAttribute('data-combed', '2')
  expect((await draftOf(page)).sideComb).toBe(true)
})

test('"Tu pastel" and the review say whether the sides are combed', async ({ page }) => {
  await open(page)
  await comb(page).uncheck()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  const summary = page.getByRole('region', { name: 'Lo que elegiste' }).getByRole('listitem').filter({ hasText: 'Cobertura' })
  await expect(summary).toContainText('Crema pastelera, sin peinado lateral')
  await expect(summary).not.toContainText('parecido a')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  const review = card(page).locator('li').filter({ hasText: 'Cobertura de crema pastelera' })
  await expect(review).toContainText('Sin peinado lateral')
  await expect(review).not.toContainText('parecido a')
  // Con el peinado puesto (el de siempre), la revisión lo dice también.
  await review.getByRole('link', { name: 'Cambiar la cobertura' }).click()
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await comb(page).check()
  for (const next of ['6. Decoración', '7. Mensaje y oblea', '8. Revisión']) {
    await proceed(page)
    await expect(stepTitle(page)).toHaveText(next)
  }
  await expect(card(page).locator('li').filter({ hasText: 'Cobertura de crema pastelera' })).toContainText('Con peinado lateral')
})

test('the cart line keeps the choice and the order asks for it; an older cart line without it is combed', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_5, sideComb: false, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? 'null'))
  const [line] = cart.items
  expect(line.design.sideComb).toBe(false)
  expect(line.details).toContain('Cobertura: Crema pastelera, sin peinado lateral')
  expect(JSON.stringify(line.details)).not.toContain('parecido a')
  const requests = await page.evaluate(
    async ({ url, snapshot }) => {
      const { designRequest } = await import(url)
      const { sideComb: _, ...older } = snapshot
      return { now: designRequest(snapshot, {}).side_comb, older: designRequest(older, {}).side_comb }
    },
    { url: ORDERS_MODULE, snapshot: line.design },
  )
  expect(requests).toEqual({ now: false, older: true })
})

test('"Edit order" brings the choice back to the designer', async ({ page }) => {
  await page.goto('/legal')
  const sideComb = await page.evaluate(async (url) => {
    const { draftFromDesign } = await import(url)
    return [draftFromDesign({ sideComb: false }, 'abc').sideComb, draftFromDesign({}, 'abc').sideComb]
  }, '/src/models/cakeDesignDraft.ts')
  expect(sideComb).toEqual([false, true])
})
