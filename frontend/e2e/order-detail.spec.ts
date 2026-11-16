import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { signedIn } from './support/auth.ts'
import { accountOrder, mockNote, mockOrderDetail, PDF_BYTES, stand } from './support/account-orders.ts'
import { NOW } from './support/checkout.ts'
import { paidCancellationPreview } from './support/order-cancel.ts'
import { acceptedOrder } from './support/references.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/cuenta/pedidos/:id` (D69, frontend; mockups `DetallePedido` y `DetallePedidoCargando`): la línea de tiempo con lo
 * que ya pasó (solo con las fechas que da la API), las partidas con los nombres del diseño, el pago, la entrega, la base
 * y la nota en PDF, que se descarga con `fetch` y el `Authorization` de la sesión.
 */

const DETAIL = '/cuenta/pedidos/57'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await signedIn(page)
  // El detalle pide la vista previa de la cancelación (D70): simulada, nunca llega al proxy.
  await page.route('**/api/v1/orders/*/cancel/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paidCancellationPreview()) }),
  )
})

test('the line of an accepted quote says "Pastel según tu referencia" with its flavor, never "Diseña tu pastel"', async ({ page }) => {
  await mockStoreInfo(page)
  const order = acceptedOrder({ status: 'received', status_label: 'Recibido', status_changed_at: '2026-11-13T18:09:00Z', note_available: true, paid_with: { method: 'stripe', method_label: 'Tarjeta (Stripe)', paid_at: '2026-11-13T18:09:00Z' }, stands: [stand({ kg: 6, deposit: '90.00' })] })
  await mockOrderDetail(page, 57, { status: 200, body: order })
  await page.goto(DETAIL)
  const products = page.getByRole('region', { name: 'Productos' })
  await expect(products).toContainText('Pastel según tu referencia')
  await expect(products).toContainText('6 kg')
  await expect(products).toContainText('Tipo: Tres leches. Pan: Chocolate. Relleno: Normal de fresa y nuez.')
  await expect(products).not.toContainText('Diseña tu pastel')
  await expect(products.getByRole('row', { name: /Depósito de la base pagado/ })).toContainText('$90')
  await expect(page.getByRole('region', { name: 'Base prestada' })).toContainText('Base para 6 kg')
})

test('shows the whole order: timeline, products, payment, delivery and the stand', async ({ page }) => {
  await mockStoreInfo(page)
  await mockOrderDetail(page, 57)
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedido #57')
  await expect(page).toHaveTitle('Pedido #57 · Pastelería Ilusión')
  const crumbs = page.getByRole('navigation', { name: 'Ruta' })
  await expect(crumbs.getByRole('link', { name: 'Mis pedidos' })).toHaveAttribute('href', '/cuenta')
  await expect(page.getByText('Hecho el viernes 13 de noviembre. Para el lunes 16 de noviembre.')).toBeVisible()

  // Solo hay fecha del pago y del estado actual: los demás pasos dicen si ya pasaron, sin inventar fechas.
  const timeline = page.getByRole('list', { name: 'Estado' })
  const steps = timeline.getByRole('listitem')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(0)).toHaveText(/Recibido, hecho.*viernes 13 de noviembre, 12:09/)
  await expect(steps.nth(1)).toHaveText(/En preparación, en curso.*Desde el sábado 14 de noviembre, 10:00/)
  await expect(steps.nth(2)).toHaveText(/Listo para entregar, pendiente.*Te avisamos por correo/)
  await expect(steps.nth(3)).toHaveText(/Entregado, pendiente.*lunes 16 de noviembre/)

  const products = page.getByRole('region', { name: 'Productos' })
  await expect(products).toContainText('Tres leches de durazno')
  await expect(products).toContainText('Completo, 1 pieza')
  await expect(products).toContainText('15 kg, 2 pisos')
  await expect(products).toContainText('Pan: Chocolate. Relleno: Con queso y Zarzamora. Decoración: Sin decoración.')
  await expect(products.getByRole('row', { name: /Total del pedido/ })).toContainText('$4,175 MXN')
  await expect(products.getByRole('row', { name: /Anticipo pagado \(50%\)/ })).toContainText('$2,087.50')
  await expect(products.getByRole('row', { name: /Depósito de la base pagado/ })).toContainText('$200')
  await expect(products.getByRole('row', { name: /Resto, el día de la entrega/ })).toContainText('$2,087.50')
  await expect(products.getByRole('row', { name: /Envío/ })).toHaveCount(0)

  const delivery = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(delivery).toContainText('Recoger en la pastelería el lunes 16 de noviembre a las 3:30 pm')
  await expect(delivery).toContainText('Calle de Prueba 123, Col. Centro')
  await expect(delivery).toContainText('Anticipo del 50% con Tarjeta (Stripe), el viernes 13 de noviembre. Resta $2,087.50 para el día de la entrega.')

  const base = page.getByRole('region', { name: 'Base prestada' })
  await expect(base).toContainText('Base para 15 kg')
  await expect(base).toContainText('Depósito retenido')
  await expect(base).toContainText('Depósito de $200. Regresa la base antes del martes 1 de diciembre (15 días) con tu nota y te devolvemos el importe.')
  await expect(base.getByRole('button', { name: 'Descargar nota (PDF)' })).toBeVisible()
  await expect(base.getByRole('link', { name: 'Cómo devolver una base' })).toHaveAttribute('href', '/bases')

  await expect(page.getByRole('main').getByRole('link', { name: /Escribir por WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/520000000000')
})

test('a returned stand says so with its date', async ({ page }) => {
  await mockStoreInfo(page)
  await mockOrderDetail(page, 57, {
    status: 200,
    body: accountOrder({
      status: 'delivered',
      stands: [stand({ status: 'returned', status_label: 'Devuelta', returned_at: '2026-11-20T17:00:00Z', return_by: '2026-12-01' })],
    }),
  })
  await page.goto(DETAIL)
  const base = page.getByRole('region', { name: 'Base prestada' })
  await expect(base).toContainText('Devuelta')
  await expect(base).toContainText('La regresaste el viernes 20 de noviembre. Te devolvimos el depósito de $200.')
  await expect(page.getByRole('list', { name: 'Estado' }).getByRole('listitem').nth(3)).toHaveText(/Entregado, hecho/)
})

test('without a stand there is no stand section and the note goes with the payment', async ({ page }) => {
  await mockStoreInfo(page, emptyStoreInfo)
  const payment = { advance_percent: 50, advance: '175.00', paid_in_full: '0.00', base_deposit: '0.00', delivery_fee: '0.00', pay_today: '175.00', pay_on_delivery: '175.00' }
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ stands: [], stand_deposit: '0.00', subtotal: '350.00', payment, items: [accountOrder().items[0]] }) })
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Base prestada' })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Depósito/ })).toHaveCount(0)
  const delivery = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(delivery.getByRole('button', { name: 'Descargar nota (PDF)' })).toBeVisible()
  // Sin la dirección del negocio, su marcador (regla 1).
  await expect(delivery).toContainText('[Dirección por confirmar]')
})

test('an order that is not paid yet has no note and asks to pay', async ({ page }) => {
  await mockStoreInfo(page)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'awaiting_payment' }) })
  await page.goto(DETAIL)
  await expect(page.getByText('Apartado, falta tu pago').first()).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Pagar mi pedido' })).toHaveAttribute('href', '/pedido/pago?pedido=57')
  await expect(page.getByRole('button', { name: 'Descargar nota (PDF)' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Entrega y pago' })).toContainText('Falta tu pago.')
})

test('an order of someone else (404) shows that it was not found, nothing of the order', async ({ page }) => {
  await mockStoreInfo(page)
  await mockOrderDetail(page, 57, { status: 404, body: { detail: 'No encontrado.' } })
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { name: 'No encontramos este pedido' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
  await expect(page.getByRole('region', { name: 'Productos' })).toHaveCount(0)
})

test('an id that is not a number does not ask the API', async ({ page }) => {
  await mockStoreInfo(page)
  const requests = await mockOrderDetail(page, 57)
  await page.goto('/cuenta/pedidos/abc')
  await expect(page.getByRole('heading', { name: 'No encontramos este pedido' })).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('while loading it keeps the structure, aria-busy and says what it loads', async ({ page }) => {
  await mockStoreInfo(page)
  await mockOrderDetail(page, 57, 'hang')
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedido #57')
  await expect(page.getByRole('status').filter({ hasText: 'Cargando tu pedido' })).toBeAttached()
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible()
})

test('a load error says so and retries', async ({ page }) => {
  await mockStoreInfo(page)
  let fail = true
  await page.route('**/api/v1/orders/57/', async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accountOrder()) })
  })
  await page.goto(DETAIL)
  await expect(page.getByText('No pudimos cargar tu pedido')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('region', { name: 'Productos' })).toBeVisible()
})

test.describe('the note in PDF', () => {
  test('downloads with the session header and saves the file', async ({ page }) => {
    await mockStoreInfo(page)
    await mockOrderDetail(page, 57)
    const notes = await mockNote(page, 57)
    await page.goto(DETAIL)
    const button = page.getByRole('button', { name: 'Descargar nota (PDF)' })
    await button.focus()
    const downloading = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    const download = await downloading
    expect(download.suggestedFilename()).toBe('nota-pedido-57.pdf')
    expect(await readFile(await download.path(), 'utf8')).toBe(PDF_BYTES)
    expect(notes).toHaveLength(1)
    expect(notes[0].headers()['authorization']).toBe('Bearer access-de-prueba')
    expect(new URL(notes[0].url()).pathname).toBe('/api/v1/orders/57/note.pdf')
    await expect(button).toBeFocused()
  })

  test('says it is downloading while the file arrives', async ({ page }) => {
    await mockStoreInfo(page)
    await mockOrderDetail(page, 57)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/orders/57/note.pdf', async (route) => {
      await held
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF_BYTES })
    })
    await page.goto(DETAIL)
    await page.getByRole('button', { name: 'Descargar nota (PDF)' }).click()
    await expect(page.getByRole('button', { name: 'Descargando nota…' })).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: 'Descargando tu nota' })).toBeAttached()
    const downloading = page.waitForEvent('download')
    release()
    await downloading
    await expect(page.getByRole('button', { name: 'Descargar nota (PDF)' })).toBeEnabled()
  })

  test('an error says so in text and lets you try again', async ({ page }) => {
    await mockStoreInfo(page)
    await mockOrderDetail(page, 57)
    await mockNote(page, 57, { status: 404 })
    await page.goto(DETAIL)
    await page.getByRole('button', { name: 'Descargar nota (PDF)' }).click()
    await expect(page.getByRole('alert')).toHaveText('No pudimos descargar tu nota. Vuelve a intentarlo en un momento.')
    await expect(page.getByRole('button', { name: 'Descargar nota (PDF)' })).toBeEnabled()
  })

  test('without network it also says so', async ({ page }) => {
    await mockStoreInfo(page)
    await mockOrderDetail(page, 57)
    await mockNote(page, 57, 'abort')
    await page.goto(DETAIL)
    await page.getByRole('button', { name: 'Descargar nota (PDF)' }).click()
    await expect(page.getByRole('alert')).toContainText('No pudimos descargar tu nota.')
  })
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('stacks the sections in the order of the mockup without horizontal scroll', async ({ page }) => {
    await mockStoreInfo(page)
    await mockOrderDetail(page, 57)
    await page.goto(DETAIL)
    const headings = page.getByRole('main').getByRole('heading', { level: 2 })
    await expect(headings).toHaveText(['Estado', 'Productos', 'Entrega y pago', 'Base prestada', '¿Algún detalle con tu pedido?'])
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
  })
})
