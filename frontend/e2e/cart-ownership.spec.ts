import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, bruno, logIn, mockSwitchableAccounts, withoutGoogle } from './support/auth.ts'
import type { Accounts } from './support/auth.ts'
import { mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { designLine, DRAFT_KEY, durazno, quoteDesignLine, saveImage, seedCart, storedCart, writeCart } from './support/checkout.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El carrito es de la cuenta que lo llenó (tanda 5). Vive en `localStorage`, así que dura más que la pestaña: una sesión que
 * termina sola (vence, la rechaza el servidor) no lo vacía, porque la misma cuenta puede volver; pero si entra otra cuenta,
 * el carrito y sus imágenes se van, aquí y en las otras pestañas. Uno que se llenó sin cuenta pasa a la cuenta con que se
 * entra, para pagarlo.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const CART = '/carrito'
const BACK_TO_CART = `/entrar?volver=${encodeURIComponent(CART)}`

const counter = (page: Page) => page.getByRole('banner').getByTestId('contador-carrito')
const signedInLink = (page: Page) => page.getByRole('link', { name: 'Mi cuenta' })
const signedOutLink = (page: Page) => page.getByRole('link', { name: 'Cuenta', exact: true })
const emptyCart = (page: Page) => page.getByRole('heading', { name: 'Tu carrito está vacío' })

/** El sitio con la cuenta de `accounts`; nada sale al servidor de desarrollo: lo que no se simula responde 404. */
async function mockSite(page: Page, accounts: Accounts) {
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }))
  await mockStoreInfo(page)
  await withoutGoogle(page)
  await mockSwitchableAccounts(page, accounts)
}

/** Si la imagen sigue en `IndexedDB`. */
function hasImage(page: Page, key: string) {
  return page.evaluate(async ({ imageKey, url }) => (await (await import(url)).readDesignImage(imageKey)) !== null, {
    imageKey: key,
    url: '/src/models/designImages.ts',
  })
}

/** El carrito guarda de quién es sin guardar el correo. */
async function expectOwnedWithoutEmail(page: Page, email: string) {
  const cart = await storedCart(page)
  expect(cart?.owner).toEqual(expect.any(String))
  expect(JSON.stringify(cart)).not.toContain(email)
}

/** Con Ana adentro, un carrito con un pastel de la casa y un diseño con su imagen; devuelve la clave de la imagen. */
async function fillCartAsAna(page: Page): Promise<string> {
  await page.goto(CART)
  await expect(signedInLink(page)).toBeVisible()
  const image = await saveImage(page)
  await writeCart(page, [durazno, quoteDesignLine(image)])
  await page.reload()
  // El contador sale de `localStorage` y no espera a la sesión: el carrito es de Ana cuando ella vuelve a estar adentro.
  await expect(signedInLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('2')
  await expect.poll(() => storedCart(page).then((cart) => cart?.owner ?? null)).toEqual(expect.any(String))
  return image
}

test('a session that ends on its own keeps the cart, and another account signing in empties it with its images', async ({ page }) => {
  const accounts: Accounts = { current: ana }
  await mockSite(page, accounts)
  const image = await fillCartAsAna(page)
  // La sesión termina sola, sin "Cerrar sesión": el carrito se queda.
  accounts.current = null
  await page.reload()
  await expect(signedOutLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('2')
  // Otra cuenta entra.
  await page.goto(BACK_TO_CART)
  await logIn(page, bruno.email)
  await expect(page).toHaveURL(CART)
  await expect(emptyCart(page)).toBeVisible()
  await expect(counter(page)).toHaveCount(0)
  expect((await storedCart(page))?.items ?? []).toEqual([])
  await expect.poll(() => hasImage(page, image)).toBe(false)
})

test('the same account coming back after its session ended keeps the cart', async ({ page }) => {
  const accounts: Accounts = { current: ana }
  await mockSite(page, accounts)
  const image = await fillCartAsAna(page)
  accounts.current = null
  await page.reload()
  await expect(signedOutLink(page)).toBeVisible()
  await page.goto(BACK_TO_CART)
  await logIn(page, ana.email)
  await expect(page).toHaveURL(CART)
  await expect(counter(page)).toHaveText('2')
  expect(await hasImage(page, image)).toBe(true)
})

test('a reload while the same account is signed in keeps the cart', async ({ page }) => {
  await mockSite(page, { current: ana })
  await seedCart(page, [durazno])
  await page.goto(CART)
  await expect(signedInLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('1')
  await page.reload()
  await expect(signedInLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('1')
  await expectOwnedWithoutEmail(page, ana.email)
})

test('a cart filled without an account is kept after signing in, to pay for it', async ({ page }) => {
  const accounts: Accounts = { current: null }
  await mockSite(page, accounts)
  await seedCart(page, [durazno])
  await page.goto(CART)
  await expect(signedOutLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('1')
  await page.goto(BACK_TO_CART)
  await logIn(page, ana.email)
  await expect(page).toHaveURL(CART)
  await expect(signedInLink(page)).toBeVisible()
  await expect(counter(page)).toHaveText('1')
  await expect.poll(() => storedCart(page).then((cart) => cart?.owner ?? null)).toEqual(expect.any(String))
  await expectOwnedWithoutEmail(page, ana.email)
})

test('another account signing in from another tab empties the cart of this one', async ({ page }) => {
  const accounts: Accounts = { current: ana }
  await mockSite(page, accounts)
  const image = await fillCartAsAna(page)
  // La sesión de Ana termina; esta pestaña todavía no lo sabe. En otra pestaña entra Bruno.
  accounts.current = null
  const other = await page.context().newPage()
  await mockSite(other, accounts)
  await other.goto(`/entrar?volver=${encodeURIComponent('/pedido')}`)
  await expect(other.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
  await logIn(other, bruno.email)
  await expect(other.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
  await expect(emptyCart(page)).toBeVisible()
  await expect(counter(page)).toHaveCount(0)
  await expect.poll(() => hasImage(page, image)).toBe(false)
})

test('"Editar pedido" on a cart of an account whose session ended keeps that owner: another account starts from zero', async ({ page }) => {
  const accounts: Accounts = { current: ana }
  await mockSite(page, accounts)
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
  await page.goto(CART)
  await expect(signedInLink(page)).toBeVisible()
  await writeCart(page, [designLine])
  await page.reload()
  await expect(signedInLink(page)).toBeVisible()
  await expect.poll(() => storedCart(page).then((cart) => cart?.owner ?? null)).toEqual(expect.any(String))
  // La sesión de Ana termina sola; alguien sin cuenta abre su pastel con "Editar pedido".
  accounts.current = null
  await page.reload()
  await expect(signedOutLink(page)).toBeVisible()
  await page.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=/)
  const edited = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null') as Record<string, unknown> | null, DRAFT_KEY)
  expect(await edited()).toMatchObject({ people: 100, replaces: designLine.designId })
  // Entra Bruno: no hereda el pastel de Ana.
  await page.goto(`/entrar?volver=${encodeURIComponent('/pedido/disena')}`)
  await logIn(page, bruno.email)
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
  await expect(page.locator('#paso-titulo')).toHaveText('1. Tamaño y forma')
  await expect(page.getByLabel('¿Para cuántas personas?')).toHaveValue('40')
  expect((await edited())?.replaces ?? null).toBeNull()
})
