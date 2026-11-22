import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { accountOrder, mockOrderDetail } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { CART_KEY, designLine, durazno, mockCalendar, mockOrders, NOW, placedOrder, seedCart, storedCart } from './support/checkout.ts'
import { mockPayment, ORDER_ID, orderItems } from './support/payments.ts'
import { mockCatalog, stockItem, todayStock } from './support/catalog.ts'
import { mockProductDetails, productDetail } from './support/products.ts'
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
    await expect(notice(page)).toHaveText('Agregado al pedido')
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

  test('a line saved with the old "parecido a" color names reads without them', async ({ page }) => {
    await mockStoreInfo(page)
    const details = [
      'Cobertura: Crema pastelera, parecido a amarillo, con peinado lateral',
      'Decoración: Rosas, color parecido a rosa mexicano',
      'Mensaje y oblea: Mensaje: Feliz día, color parecido a negro. Oblea: círculo, foto.jpg',
    ]
    await seedCart(page, [{ ...designLine, details }])
    await page.goto('/carrito')
    const list = designItem(page).getByRole('list')
    await expect(list.getByRole('listitem')).toHaveText([
      'Cobertura: Crema pastelera, con peinado lateral',
      'Decoración: Rosas, color elegido',
      'Mensaje y oblea: Mensaje: Feliz día, color elegido. Oblea: círculo, foto.jpg',
    ])
    await expect(designItem(page)).not.toContainText('parecido a')
  })

  test('the message keeps what the customer wrote: only the color the site added is renamed', async ({ page }) => {
    await mockStoreInfo(page)
    const details = [
      'Mensaje y oblea: Mensaje: Feliz día, parecido a papá, color parecido a negro. Oblea: círculo, foto.jpg',
      'Mensaje y oblea: Mensaje: Para ti, parecido a nadie',
    ]
    await seedCart(page, [{ ...designLine, details }])
    await page.goto('/carrito')
    await expect(designItem(page).getByRole('list').getByRole('listitem')).toHaveText([
      'Mensaje y oblea: Mensaje: Feliz día, parecido a papá, color elegido. Oblea: círculo, foto.jpg',
      'Mensaje y oblea: Mensaje: Para ti, parecido a nadie',
    ])
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

/**
 * Las líneas del catálogo (correcciones del 21 de noviembre): el carrito guarda la imagen de la tarjeta (la del modelo o, sin ella,
 * la foto) y la muestra en el mismo cuadro que la miniatura de un pastel diseñado; sin imagen, el hueco de siempre.
 */
test.describe('catalog lines', () => {
  const catalogItem = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) })

  test('a line with its image shows it in the cart in the same box as the designed cake', async ({ page }) => {
    await mockStoreInfo(page)
    await seedCart(page, [{ ...durazno, image: 'tres-leches-de-durazno-modelo.webp' }, { ...designLine, thumbnail: TINY_WEBP }])
    await page.goto('/carrito')
    const image = catalogItem(page, durazno.name).locator('img[src="/fotos/tres-leches-de-durazno-modelo.webp"]')
    await expect(image).toBeVisible()
    await expect(catalogItem(page, durazno.name)).not.toContainText('Foto del pastel')
    // Decorativa, como la miniatura: el nombre de la línea ya dice qué es.
    await expect(image).toHaveAttribute('alt', '')
    const [own, design] = await Promise.all([image.boundingBox(), thumbnailIn(designItem(page)).boundingBox()])
    expect(Math.round(own!.width)).toBe(Math.round(design!.width))
    expect(Math.round(own!.height)).toBe(Math.round(design!.height))
  })

  test('an older line without an image, or with one that is not a photo name, keeps the placeholder', async ({ page }) => {
    await mockStoreInfo(page)
    await seedCart(page, [durazno, { ...durazno, offeringId: 102, name: 'Tres leches de fresa', image: 'https://ejemplo.com/x.webp' }])
    await page.goto('/carrito')
    await expect(catalogItem(page, durazno.name)).toContainText('Foto del pastel')
    await expect(catalogItem(page, 'Tres leches de fresa')).toContainText('Foto del pastel')
    await expect(page.getByRole('main').locator('img[src*="ejemplo.com"]')).toHaveCount(0)
    // La línea dudosa se conserva, sin la imagen.
    expect((await storedCart(page)).items).toHaveLength(2)
  })

  test('adding from the showcase keeps the image of its card: the model or, without it, the photo', async ({ page }) => {
    await mockStoreInfo(page)
    await mockCatalog(page, {
      showcase: [
        todayStock([
          { ...stockItem(1, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'whole', '350.00', { photo: 'tres-leches-de-durazno.webp' }), model_image: 'tres-leches-de-durazno-modelo.webp' },
          stockItem(80, 'tres-leches-de-cajeta', 'Tres leches de cajeta', 'cake', 'whole', '1250.00', { photo: 'tres-leches-de-cajeta.webp' }),
        ]),
      ],
    })
    await page.goto('/vitrina')
    const main = page.getByRole('main')
    for (const name of ['Tres leches de durazno', 'Tres leches de cajeta']) {
      await main.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: /Agregar/ }).click()
    }
    const items = (await storedCart(page)).items as { slug: string; image?: string }[]
    expect(items.map((item) => [item.slug, item.image])).toEqual([
      ['tres-leches-de-durazno', 'tres-leches-de-durazno-modelo.webp'],
      ['tres-leches-de-cajeta', 'tres-leches-de-cajeta.webp'],
    ])
    await page.goto('/carrito')
    await expect(catalogItem(page, 'Tres leches de cajeta').locator('img[src="/fotos/tres-leches-de-cajeta.webp"]')).toBeVisible()
  })

  test('from the product page, the whole cake keeps the model image and a slice keeps the photo', async ({ page }) => {
    await mockStoreInfo(page)
    await mockCakeDesignOptions(page)
    // El rebanado de hoy (D60): encargar el completo y llevarse una rebanada de la vitrina, en la ficha de un pastel con modelo.
    const sliced = productDetail('tres-leches-de-durazno', { stock: { 2: 6 }, sliced_today: true, in_showcase_today: false })
    await mockProductDetails(page, [{ ...sliced, photo: 'tres-leches-de-durazno.webp', model_image: 'tres-leches-de-durazno-modelo.webp' }])
    await page.goto('/pasteles/tres-leches-de-durazno')
    const presentation = page.getByRole('group', { name: 'Presentación' })
    await page.getByRole('button', { name: 'Agregar al pedido' }).click()
    await presentation.locator('label').filter({ hasText: 'Rebanada' }).click()
    await page.getByRole('button', { name: 'Agregar al pedido' }).click()
    const items = (await storedCart(page)).items as { presentation: string; image?: string }[]
    // La imagen del modelo es la del pastel completo: la rebanada lleva la foto, como en `/rebanadas`.
    expect(items.map((item) => [item.presentation, item.image])).toEqual([
      ['whole', 'tres-leches-de-durazno-modelo.webp'],
      ['slice', 'tres-leches-de-durazno.webp'],
    ])
  })

  test('the delivery summary, the payment summary and the confirmation show the image of a catalog line', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await mockStoreInfo(page)
    await signedIn(page)
    await mockCalendar(page)
    await mockOrders(page, [{ status: 201, body: placedOrder({ items: orderItems }) }])
    await mockPayment(page)
    await mockOrderDetail(page, ORDER_ID, { status: 200, body: accountOrder({ id: ORDER_ID }) })
    const photo = '/fotos/tres-leches-de-durazno-modelo.webp'
    await seedCart(page, [{ ...durazno, image: 'tres-leches-de-durazno-modelo.webp' }, designLine])
    await page.goto('/pedido/entrega')
    await expect(page.getByRole('region', { name: 'Resumen', exact: true }).locator(`img[src="${photo}"]`)).toHaveCount(1)

    await page.getByRole('button', { name: 'Lunes 16 de noviembre' }).click()
    await page.locator('label').filter({ hasText: /^Tarde/ }).click()
    await page.locator('label').filter({ hasText: /^3:30 pm$/ }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar al pago' }).click()
    await expect(page).toHaveURL(`/pedido/pago?pedido=${ORDER_ID}`)
    await expect(page.getByRole('region', { name: 'Resumen de tu pedido' }).locator(`img[src="${photo}"]`)).toHaveCount(1)

    await page.goto(`/pedido/confirmacion?pedido=${ORDER_ID}`)
    await expect(page.getByRole('region', { name: 'Resumen', exact: true }).locator(`img[src="${photo}"]`)).toHaveCount(1)
  })
})
