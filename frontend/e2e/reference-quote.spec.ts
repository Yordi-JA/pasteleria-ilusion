import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { legacyFlavor, mockReferenceImages, mockReferences, QUOTE_PATH, quoteReadyRequest, readyQuote, referenceRequest } from './support/references.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/referencia/enviada` y `/cuenta/cotizaciones/:id` (D70, frontend): la solicitud recibida, la cotización en
 * revisión y lista (con la vigencia PENDIENTE), aceptada y cancelada, "Cancelar solicitud" con su confirmación y una
 * solicitud ajena (404).
 */

const SENT = '/pedido/referencia/enviada?solicitud=7'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

const main = (page: Page) => page.getByRole('main')

test('the sent page: the number, what comes next with the account email, and what was sent', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  const images = await mockReferenceImages(page)
  await mockReferences(page)
  await page.goto(SENT)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibimos tu solicitud')
  await expect(page).toHaveTitle('Recibimos tu solicitud · Pastelería Ilusión')
  await expect(main(page)).toContainText(`Te enviaremos la cotización a ${ana.email} en máximo 1 hora. También la verás en tu cuenta.`)
  await expect(page.getByRole('heading', { name: 'Solicitud #7' })).toBeVisible()
  await expect(main(page)).toContainText('En revisión')
  const steps = page.getByRole('list', { name: 'Qué sigue' })
  await expect(steps.getByRole('listitem')).toHaveCount(4)
  await expect(steps.getByRole('listitem').nth(0)).toContainText('Solicitud enviada, hecho')
  await expect(steps.getByRole('listitem').nth(0)).toContainText('Viernes 13 de noviembre, 12:05 pm')
  await expect(steps.getByRole('listitem').nth(1)).toContainText('En revisión, en curso')
  await expect(steps.getByRole('listitem').nth(3)).toContainText('Hasta entonces no se cobra nada')
  await expect(page.getByRole('link', { name: 'Ver mi solicitud' })).toHaveAttribute('href', QUOTE_PATH)
  await expect(page.getByRole('link', { name: 'Seguir viendo el catálogo' })).toHaveAttribute('href', '/catalogo')

  const sent = page.getByRole('region', { name: 'Lo que nos enviaste' })
  await expect(sent.getByRole('img', { name: 'Foto de referencia: referencia-boda.png' })).toBeVisible()
  await expect(sent.getByRole('img', { name: 'Foto de referencia: colores-flores.png' })).toBeVisible()
  expect(images.views.length).toBeGreaterThanOrEqual(2)
  expect(images.views[0].headers().authorization).toBe('Bearer access-de-prueba')
  await expect(sent).toContainText('“La decoración de flores, pero en tonos durazno y de 2 pisos”')
  await expect(sent.getByRole('row', { name: /Ocasión/ })).toContainText('XV años')
  await expect(sent.getByRole('row', { name: /Personas/ })).toContainText('40')
  await expect(sent.getByRole('row', { name: /Fecha del evento/ })).toContainText('Sábado 21 de noviembre')
  await expect(sent.getByRole('row', { name: /Presupuesto/ })).toContainText('$1,500')
  // El sabor que eligió (segunda ronda de D70), con los nombres de la API.
  await expect(sent.getByRole('row', { name: /Tipo de pastel/ })).toContainText('Tres leches')
  await expect(sent.getByRole('row', { name: /^Pan/ })).toContainText('Chocolate')
  await expect(sent.getByRole('row', { name: /Relleno/ })).toContainText('Normal de fresa y nuez')
})

test('the sent page without a request number says so', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await page.goto('/pedido/referencia/enviada')
  await expect(main(page)).toContainText('No encontramos tu solicitud')
  await expect(page.getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
})

test('in review: the status in words, no price yet, and cancel is offered', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page)
  await page.goto(QUOTE_PATH)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solicitud #7')
  await expect(page).toHaveTitle('Solicitud #7 · Pastelería Ilusión')
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Mi cuenta')
  await expect(main(page)).toContainText('Enviada el viernes 13 de noviembre.')
  await expect(page.getByTestId('estado-solicitud')).toHaveText('En revisión')
  await expect(main(page)).toContainText('Estamos preparando tu cotización')
  await expect(page.getByRole('link', { name: 'Aceptar y pagar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tu referencia' })).toContainText('XV años')
})

test('quote ready: price, the bakery note, advance and rest, pending validity, and the three actions', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await page.goto(QUOTE_PATH)
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Cotización lista')
  await expect(main(page)).toContainText('Enviada el viernes 13 de noviembre. Cotizada el viernes 13 de noviembre.')
  const quote = page.getByRole('region', { name: 'Tu cotización' })
  const cake = quote.getByRole('row', { name: /Pastel según tu referencia/ })
  await expect(cake).toContainText('$1,800')
  await expect(cake).toContainText('6 kg, pan de chocolate con relleno normal de fresa y nuez')
  await expect(quote.getByRole('row', { name: /^Total del pedido/ })).toContainText('$1,800 MXN')
  await expect(quote.getByRole('row', { name: /Anticipo para apartar \(50%\)/ })).toContainText('$900')
  // La base sale de las personas (regla 7): su depósito va aparte del precio y entra completo en lo que pagas hoy.
  await expect(quote.getByRole('row', { name: /Base para 6 kg/ })).toContainText('$90')
  await expect(quote.getByRole('row', { name: /Pagas hoy/ })).toContainText('$990')
  await expect(quote.getByRole('row', { name: /El día de la entrega/ })).toContainText('$900')
  const reference = page.getByRole('region', { name: 'Tu referencia' })
  await expect(reference.getByRole('row', { name: /Tipo de pastel/ })).toContainText('Tres leches')
  await expect(reference.getByRole('row', { name: /^Pan/ })).toContainText('Chocolate')
  await expect(reference.getByRole('row', { name: /Relleno/ })).toContainText('Normal de fresa y nuez')
  await expect(quote).toContainText('Nota de la pastelería')
  await expect(quote).toContainText(readyQuote.note)
  await expect(quote).toContainText('Esta cotización es válida hasta el [vigencia por confirmar].')
  await expect(page.getByRole('link', { name: 'Aceptar y pagar' })).toHaveAttribute('href', '/pedido/entrega?cotizacion=7')
  const change = page.getByRole('link', { name: /Pedir un cambio/ })
  await expect(change).toHaveAttribute('href', /^https:\/\/wa\.me\/520000000000\?text=/)
  await expect(change).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('link', { name: /^Escribir por WhatsApp/ }).first()).toHaveAttribute('href', /^https:\/\/wa\.me\/520000000000/)
  await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible()
})

test('a request from before the flavor (no type, bread, kilos or base) still shows, without those rows', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  const quote = { ...readyQuote, stand_deposit: '0.00', pay_today: '900.00' }
  await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest({ ...legacyFlavor, quote }) } })
  await page.goto(QUOTE_PATH)
  const region = page.getByRole('region', { name: 'Tu cotización' })
  await expect(region.getByRole('row', { name: /Pastel según tu referencia/ })).toContainText('Según tus fotos y lo que nos contaste')
  await expect(region.getByRole('row', { name: /Base para/ })).toHaveCount(0)
  await expect(region.getByRole('row', { name: /Pagas hoy/ })).toContainText('$900')
  const reference = page.getByRole('region', { name: 'Tu referencia' })
  await expect(reference.getByRole('row', { name: /Personas/ })).toContainText('40')
  await expect(reference.getByRole('row', { name: /Tipo de pastel/ })).toHaveCount(0)
  await expect(reference.getByRole('row', { name: /^Pan/ })).toHaveCount(0)
})

test('quote ready with a known validity and without the WhatsApp number', async ({ page }) => {
  await mockStoreInfo(page, emptyStoreInfo)
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest({ quote: { ...readyQuote, note: '', validity_pending: false, expires_at: '2026-11-15T04:30:00Z' } }) },
  })
  await page.goto(QUOTE_PATH)
  const quote = page.getByRole('region', { name: 'Tu cotización' })
  await expect(quote).toContainText('Esta cotización es válida hasta el sábado 14 de noviembre a las 10:30 pm.')
  await expect(quote).not.toContainText('Nota de la pastelería')
  await expect(quote).toContainText('WhatsApp [número por confirmar]')
  await expect(page.getByRole('link', { name: /Pedir un cambio/ })).toHaveCount(0)
})

test('an expired quote cannot be accepted and says so', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest({ quote: { ...readyQuote, expired: true, validity_pending: false, expires_at: '2026-11-13T17:00:00Z' } }) } })
  await page.goto(QUOTE_PATH)
  await expect(main(page)).toContainText('Esta cotización venció')
  await expect(page.getByRole('link', { name: 'Aceptar y pagar' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Pedir un cambio/ })).toBeVisible()
})

test('accepted links to its order; cancelled says nothing was charged', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest({ status: 'accepted', status_label: 'Aceptada', order_id: 57 }) },
  })
  await page.goto(QUOTE_PATH)
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Aceptada')
  await expect(main(page)).toContainText('Ya es tu pedido #57')
  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toHaveAttribute('href', '/cuenta/pedidos/57')
  await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toHaveCount(0)

  references.setDetail({ status: 200, body: referenceRequest({ status: 'cancelled', status_label: 'Cancelada' }) })
  await page.reload()
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Cancelada')
  await expect(main(page)).toContainText('Cancelaste esta solicitud. No se te cobró nada.')
  await expect(page.getByRole('link', { name: 'Enviar otra referencia' })).toHaveAttribute('href', '/pedido/referencia')
})

test('cancel asks first, "No" keeps it and returns the focus, "Yes" cancels it', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await page.goto(QUOTE_PATH)
  const cancel = page.getByRole('button', { name: 'Cancelar solicitud' })
  await cancel.click()
  const confirm = page.getByRole('heading', { name: '¿Cancelas tu solicitud?' })
  await expect(confirm).toBeFocused()
  await expect(main(page)).toContainText('No se cobra nada y borramos tus fotos.')
  await page.getByRole('button', { name: 'No, conservarla' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(cancel).toBeFocused()
  expect(references.cancels).toHaveLength(0)

  await cancel.click()
  await page.getByRole('button', { name: 'Sí, cancelar solicitud' }).click()
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Cancelada')
  await expect(page.getByRole('status').filter({ hasText: 'Cancelamos tu solicitud.' })).toBeVisible()
  expect(references.cancels).toHaveLength(1)
  expect(references.cancels[0].method()).toBe('POST')
  await expect(page.getByRole('link', { name: 'Aceptar y pagar' })).toHaveCount(0)
})

test('cancel after it was accepted (409) says so and shows the order', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest() },
    cancel: [{ status: 409, body: { detail: 'Esta solicitud ya es un pedido.', code: 'already_accepted' } }],
  })
  await page.goto(QUOTE_PATH)
  await page.getByRole('button', { name: 'Cancelar solicitud' }).click()
  references.setDetail({ status: 200, body: quoteReadyRequest({ status: 'accepted', status_label: 'Aceptada', order_id: 57 }) })
  await page.getByRole('button', { name: 'Sí, cancelar solicitud' }).click()
  await expect(page.getByRole('alert')).toContainText('Esta solicitud ya es un pedido.')
  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toBeVisible()
})

test('a request of another account (404) shows nothing of it', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferences(page, { detail: { status: 404, body: { detail: 'No encontrado.' } } })
  await page.goto('/cuenta/cotizaciones/99')
  await expect(main(page)).toContainText('No encontramos esta solicitud')
  await expect(page.getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
  await expect(main(page)).not.toContainText('Tu cotización')
})

test('a load failure offers to try again', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, { detail: { status: 500, body: {} } })
  await page.goto(QUOTE_PATH)
  await expect(main(page)).toContainText('No pudimos cargar tu solicitud')
  references.setDetail({ status: 200, body: quoteReadyRequest() })
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Cotización lista')
})

test('mobile at 390 px: the quote before the reference, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockStoreInfo(page)
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await page.goto(QUOTE_PATH)
  await expect(page.getByRole('link', { name: 'Aceptar y pagar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const quote = await page.getByRole('heading', { name: 'Tu cotización' }).boundingBox()
  const reference = await page.getByRole('heading', { name: 'Tu referencia' }).boundingBox()
  expect(quote && reference && quote.y < reference.y).toBe(true)
})
