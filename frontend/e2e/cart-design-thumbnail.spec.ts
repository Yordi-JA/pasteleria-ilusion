import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { accountOrder, mockOrderDetail } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { CART_KEY, designLine, durazno, mockCalendar, mockOrders, NOW, placedOrder, seedCart, storedCart } from './support/checkout.ts'
import { mockPayment, ORDER_ID, orderItems } from './support/payments.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La miniatura del pastel diseñado (tanda 4): al "Agregar al pedido" del paso 8, la vista previa se guarda como una imagen
 * chica en la línea del carrito, y el carrito, la entrega, el pago y la confirmación la muestran en lugar del hueco
 * "Foto del pastel". Si no se puede tomar (sin WebGL, con el lienzo que falla o sin espacio para guardarla), el pastel
 * entra igual con el hueco. Los pedidos ya hechos, en "Mis pedidos" y su detalle, siguen con el hueco.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const DRAFT_TO_STEP_8 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6, 7],
}

/** Una miniatura válida de 4 × 4 px, para los carritos sembrados. */
const TINY_WEBP = 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoEAAQAAUAmJaACdAFAAAD+8ohiY9Fa//G8f5Lv7d9lAAAA'
const THUMBNAIL = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/

const designButton = (page: Page) => page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Agregar al pedido' })
const notice = (page: Page) => page.getByTestId('tarjeta-paso').getByTestId('aviso-carrito')
/** La línea del pastel diseñado en el carrito: la que se puede editar. */
const designItem = (page: Page) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Editar pedido/ }) })
const thumbnailIn = (scope: Locator) => scope.locator('img[src^="data:image/"]')

async function openReview(page: Page) {
  await mockStoreInfo(page)
  await page.addInitScript((value) => sessionStorage.setItem('ilusion.cakeDesign.v1', value), JSON.stringify(DRAFT_TO_STEP_8))
  await mockCakeDesignOptions(page, { status: 200, body: cakeDesignOptions })
  await mockCakeDesignPrice(page, cakeDesignOptions)
  await page.goto('/pedido/disena?paso=8')
  await expect(page.getByTestId('desglose')).toBeVisible()
}

/** Agrega el pastel con la vista previa ya dibujada (la miniatura sale de ella). */
async function addWithPreview(page: Page) {
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  await designButton(page).click()
  await expect(notice(page)).toContainText('Agregado al pedido')
}

async function storedDesign(page: Page) {
  const cart = await storedCart(page)
  return cart.items.find((item: { kind: string }) => item.kind === 'design') as Record<string, unknown>
}

/** Las medidas de la imagen y qué parte de ella no es el fondo: una captura en blanco o del fondo no tiene pastel. */
function measure(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode()
    const canvas = document.createElement('canvas')
    canvas.width = element.naturalWidth
    canvas.height = element.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(element, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const [r, g, b] = [data[0], data[1], data[2]]
    let cake = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 40) cake++
    }
    return { width: element.naturalWidth, height: element.naturalHeight, cakeShare: cake / (data.length / 4) }
  })
}

test.describe('adding from step 8', () => {
  test('the cart line shows a small picture of the designed cake instead of the placeholder', async ({ page }) => {
    await openReview(page)
    await addWithPreview(page)
    const stored = await storedDesign(page)
    expect(stored.thumbnail).toMatch(THUMBNAIL)
    // Unos 20 KB por imagen, muy por debajo de lo que cabe en `localStorage`.
    expect((stored.thumbnail as string).length).toBeLessThan(28_000)

    await page.goto('/carrito')
    const line = designItem(page)
    const image = thumbnailIn(line)
    await expect(image).toHaveCount(1)
    await expect(image).toHaveAttribute('src', stored.thumbnail as string)
    await expect(line).not.toContainText('Foto del pastel')
    // Decorativa: el nombre de la línea ya dice qué es.
    await expect(image).toHaveAttribute('alt', '')
    const { width, height, cakeShare } = await measure(image)
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(160)
    expect(Math.max(width, height)).toBeLessThanOrEqual(200)
    expect(cakeShare).toBeGreaterThan(0.05)
  })

  test('with reduced motion the picture is still taken, with a frame drawn before reading it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openReview(page)
    await addWithPreview(page)
    const stored = await storedDesign(page)
    expect(stored.thumbnail).toMatch(THUMBNAIL)
    await page.goto('/carrito')
    const { cakeShare } = await measure(thumbnailIn(designItem(page)))
    expect(cakeShare).toBeGreaterThan(0.05)
  })

  test('the same cake gives the same picture even after turning it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openReview(page)
    await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
    const scene = page.getByRole('img', { name: 'Vista previa de tu pastel' })
    await scene.focus()
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowUp')
    await designButton(page).click()
    await expect(notice(page)).toContainText('Agregado al pedido')
    const turned = (await storedDesign(page)).thumbnail
    expect(turned).toMatch(THUMBNAIL)

    await page.evaluate((key) => localStorage.removeItem(key), CART_KEY)
    await page.reload()
    await addWithPreview(page)
    expect((await storedDesign(page)).thumbnail).toBe(turned)
  })

  test('a capture that fails keeps the placeholder and still adds the cake', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toDataURL = () => {
        throw new DOMException('El lienzo no se puede leer.', 'SecurityError')
      }
    })
    await openReview(page)
    await addWithPreview(page)
    await expect(notice(page)).toContainText('Tu pastel quedó en tu pedido.')
    const stored = await storedDesign(page)
    expect(stored).toBeTruthy()
    expect(stored.thumbnail).toBeUndefined()
    await page.goto('/carrito')
    await expect(designItem(page)).toContainText('Foto del pastel')
    await expect(thumbnailIn(designItem(page))).toHaveCount(0)
  })

  test('without WebGL there is no preview to capture and the cake still goes in with the placeholder', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest)
      } as typeof HTMLCanvasElement.prototype.getContext
    })
    await openReview(page)
    await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'fallback')
    await designButton(page).click()
    await expect(notice(page)).toContainText('Agregado al pedido')
    expect((await storedDesign(page)).thumbnail).toBeUndefined()
  })

  test('with the storage full the cake is saved without its picture', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (value.includes('data:image/')) throw new DOMException('Sin espacio.', 'QuotaExceededError')
        return original.call(this, key, value)
      }
    })
    await openReview(page)
    await addWithPreview(page)
    const stored = await storedDesign(page)
    expect(stored).toBeTruthy()
    expect(stored.thumbnail).toBeUndefined()
    await page.goto('/carrito')
    await expect(designItem(page)).toContainText('Foto del pastel')
  })
})

test.describe('saved carts', () => {
  test('an older design line with no picture still renders with the placeholder', async ({ page }) => {
    await mockStoreInfo(page)
    await seedCart(page, [designLine])
    await page.goto('/carrito')
    await expect(designItem(page)).toContainText(designLine.name)
    await expect(designItem(page)).toContainText('Foto del pastel')
    await expect(thumbnailIn(designItem(page))).toHaveCount(0)
  })

  test('a picture that is not a small JPEG or WebP is ignored, and the line stays', async ({ page }) => {
    await mockStoreInfo(page)
    await seedCart(page, [{ ...designLine, thumbnail: 'data:image/svg+xml;base64,PHN2Zy8+' }])
    await page.goto('/carrito')
    await expect(designItem(page)).toContainText(designLine.name)
    await expect(designItem(page)).toContainText('Foto del pastel')
    await expect(page.locator('img[src^="data:image/svg"]')).toHaveCount(0)
  })
})

test.describe('checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await mockStoreInfo(page)
  })

  test('the delivery summary, the payment summary and the confirmation show the picture; the order detail does not', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await mockOrders(page, [{ status: 201, body: placedOrder({ items: orderItems }) }])
    await mockPayment(page)
    await mockOrderDetail(page, ORDER_ID, { status: 200, body: accountOrder({ id: ORDER_ID }) })
    // El orden del carrito es el de las líneas del pedido: el pastel del catálogo y luego el diseñado.
    await seedCart(page, [durazno, { ...designLine, thumbnail: TINY_WEBP }])
    await page.goto('/pedido/entrega')

    const deliverySummary = page.getByRole('region', { name: 'Resumen', exact: true })
    await expect(thumbnailIn(deliverySummary)).toHaveCount(1)
    await expect(thumbnailIn(deliverySummary)).toHaveAttribute('src', TINY_WEBP)

    await page.getByRole('button', { name: 'Lunes 16 de noviembre' }).click()
    await page.locator('label').filter({ hasText: /^Tarde/ }).click()
    await page.locator('label').filter({ hasText: /^3:30 pm$/ }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar al pago' }).click()
    await expect(page).toHaveURL(new RegExp(`/pedido/pago\\?pedido=${ORDER_ID}$`))

    const paymentSummary = page.getByRole('region', { name: 'Resumen de tu pedido' })
    await expect(paymentSummary.getByText('Pastel de Diseña tu pastel')).toBeVisible()
    await expect(thumbnailIn(paymentSummary)).toHaveCount(1)
    await expect(thumbnailIn(paymentSummary)).toHaveAttribute('src', TINY_WEBP)

    // Volver de Mercado Pago carga la confirmación de nuevo en la misma pestaña.
    await page.goto(`/pedido/confirmacion?pedido=${ORDER_ID}`)
    const confirmation = page.getByRole('region', { name: 'Resumen', exact: true })
    await expect(confirmation.getByText('Pastel de Diseña tu pastel')).toBeVisible()
    await expect(thumbnailIn(confirmation)).toHaveAttribute('src', TINY_WEBP)

    await page.goto(`/cuenta/pedidos/${ORDER_ID}`)
    const products = page.getByRole('region', { name: 'Productos' })
    await expect(products.getByText('Pastel de Diseña tu pastel')).toBeVisible()
    await expect(thumbnailIn(products)).toHaveCount(0)
  })
})
