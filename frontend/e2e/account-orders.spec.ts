import { expect, test } from '@playwright/test'
import { signedIn } from './support/auth.ts'
import { accountOrder, mockOrderList, orderPage } from './support/account-orders.ts'
import { NOW } from './support/checkout.ts'
import { mockReferenceList, quoteReadyRequest, referencePage, referenceRequest } from './support/references.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/cuenta`, "Mis pedidos" (D69, frontend; mockups `Cuenta`, `CuentaMenu`, `PedidosVacio` y `CuentaCargando`): los
 * pedidos de `GET orders/` en curso y anteriores, con su estado en palabras, la paginación, los estados vacío, cargando
 * y con error, y el submenú de la cuenta en escritorio y en móvil.
 */

const inPreparation = accountOrder({ id: 60 })
const reserved = accountOrder({ id: 59, status: 'awaiting_payment' })
const delivered = accountOrder({ id: 58, status: 'delivered' })
const cancelled = accountOrder({ id: 57, status: 'cancelled', stands: [] })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
  await signedIn(page)
  // Las solicitudes de cotización (D70) se piden aparte: sin ninguna, por omisión.
  await mockReferenceList(page)
})

test('lists the orders in progress and the previous ones, each state in words', async ({ page }) => {
  await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation, reserved, delivered, cancelled]) } })
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')

  const current = page.getByRole('region', { name: 'Pedidos en curso' })
  const preparing = current.getByRole('article', { name: 'Pedido #60' })
  await expect(preparing).toContainText('Paso 2 de 4: En preparación')
  await expect(preparing).toContainText('Tres leches de durazno y 1 producto más')
  await expect(preparing).toContainText('Para el lunes 16 de noviembre, a recoger en la pastelería')
  await expect(preparing).toContainText('Resta $2,087.50 al entregar')
  await expect(preparing.getByRole('link', { name: 'Ver pedido #60' })).toHaveAttribute('href', '/cuenta/pedidos/60')

  // "Apartado, falta tu pago" va como aviso con borde `cajeta` y lleva a pagar (libro de marca, "Pago y entrega").
  const waiting = current.getByRole('article', { name: 'Pedido #59' })
  await expect(waiting).toContainText('Apartado, falta tu pago')
  await expect(waiting.getByRole('link', { name: 'Pagar mi pedido' })).toHaveAttribute('href', '/pedido/pago?pedido=59')

  const previous = page.getByRole('region', { name: 'Pedidos anteriores' })
  const done = previous.getByRole('article', { name: 'Pedido #58' })
  await expect(done).toContainText('del viernes 13 de noviembre')
  await expect(done).toContainText('$4,175')
  await expect(done).toContainText('Paso 4 de 4: Entregado')
  await expect(previous.getByRole('article', { name: 'Pedido #57' })).toContainText('Cancelado')
  await expect(page.getByText('Aún no tienes pedidos')).toHaveCount(0)
})

test('one order in progress uses the singular heading of the mockup', async ({ page }) => {
  await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation]) } })
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { name: 'Pedido en curso', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Pedidos anteriores' })).toHaveCount(0)
})

test('without orders it shows the empty state with its two ways out', async ({ page }) => {
  await mockOrderList(page, { 1: { status: 200, body: orderPage([]) } })
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { name: 'Aún no tienes pedidos' })).toBeVisible()
  await expect(page.getByText('Cuando hagas tu primer pedido, aquí verás en qué va y podrás volver a pedirlo.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
})

test('while loading it shows the skeleton and says what it loads', async ({ page }) => {
  await mockOrderList(page, { 1: 'hang' })
  await page.goto('/cuenta')
  await expect(page.getByRole('status').filter({ hasText: 'Cargando tus pedidos' })).toBeAttached()
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
})

test('an error says so in text and retries', async ({ page }) => {
  let fail = true
  await page.route(/\/api\/v1\/orders\/(\?.*)?$/, async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderPage([inPreparation])) })
  })
  await page.goto('/cuenta')
  await expect(page.getByText('No pudimos cargar tus pedidos')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('article', { name: 'Pedido #60' })).toBeVisible()
})

test('"Ver más pedidos" loads the next page and moves the focus to the first new order', async ({ page }) => {
  const older = accountOrder({ id: 40, status: 'delivered' })
  const requests = await mockOrderList(page, {
    1: { status: 200, body: orderPage([inPreparation, delivered], { count: 3, next: 2 }) },
    2: { status: 200, body: orderPage([older], { count: 3 }) },
  })
  await page.goto('/cuenta')
  const more = page.getByRole('button', { name: 'Ver más pedidos' })
  await expect(more).toBeVisible()
  await more.focus()
  await page.keyboard.press('Enter')
  const previous = page.getByRole('region', { name: 'Pedidos anteriores' })
  await expect(previous.getByRole('article')).toHaveCount(2)
  await expect(previous.getByRole('link', { name: 'Ver pedido #40' })).toBeFocused()
  await expect(more).toHaveCount(0)
  expect(requests.some((request) => new URL(request.url()).searchParams.get('page') === '2')).toBe(true)
})

test('a failed next page keeps what was loaded and offers to retry', async ({ page }) => {
  await mockOrderList(page, {
    1: { status: 200, body: orderPage([delivered], { count: 2, next: 2 }) },
    2: { status: 500 },
  })
  await page.goto('/cuenta')
  await page.getByRole('button', { name: 'Ver más pedidos' }).click()
  await expect(page.getByText('No pudimos cargar más pedidos. Vuelve a intentarlo.')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Pedido #58' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver más pedidos' })).toBeEnabled()
})

test.describe('quote requests (D70)', () => {
  const inReview = referenceRequest({ id: 7 })
  const ready = quoteReadyRequest({ id: 8 })
  const accepted = quoteReadyRequest({ id: 9, status: 'accepted', status_label: 'Aceptada', order_id: 60 })
  const dropped = referenceRequest({ id: 6, status: 'cancelled', status_label: 'Cancelada' })

  test('lists the requests in review and with a quote, each with its state in words; an accepted one is only its order', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation, delivered]) } })
    const requests = await mockReferenceList(page, { status: 200, body: referencePage([accepted, ready, inReview, dropped]) })
    await page.goto('/cuenta')
    const section = page.getByRole('region', { name: 'Solicitudes de cotización' })
    await expect(section).toBeVisible()
    const review = section.getByRole('article', { name: 'Solicitud #7' })
    await expect(review).toContainText('En revisión')
    await expect(review).toContainText('Enviada el viernes 13 de noviembre. Te respondemos en máximo 1 hora.')
    await expect(review.getByRole('link', { name: 'Ver solicitud #7' })).toHaveAttribute('href', '/cuenta/cotizaciones/7')
    const quoted = section.getByRole('article', { name: 'Solicitud #8' })
    await expect(quoted).toContainText('Cotización lista')
    await expect(quoted).toContainText('Válida hasta el [vigencia por confirmar]')
    await expect(quoted.getByRole('link', { name: 'Ver cotización #8' })).toHaveAttribute('href', '/cuenta/cotizaciones/8')
    // La aceptada ya es el pedido #60: no se repite como solicitud. La cancelada va en el historial, no en curso.
    await expect(section.getByRole('article', { name: 'Solicitud #9' })).toHaveCount(0)
    await expect(section.getByRole('article', { name: 'Solicitud #6' })).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'Pedido #60' })).toHaveCount(1)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0].headers().authorization).toBe('Bearer access-de-prueba')
  })

  test('cancelled requests show as history under "Solicitudes anteriores" with their state, date and link; an accepted one still does not', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation]) } })
    await mockReferenceList(page, { status: 200, body: referencePage([accepted, inReview, dropped]) })
    await page.goto('/cuenta')
    const history = page.getByRole('region', { name: 'Solicitudes anteriores' })
    await expect(history).toBeVisible()
    const row = history.getByRole('article', { name: 'Solicitud #6' })
    await expect(row).toContainText('Cancelada')
    await expect(row).toContainText('Enviada el viernes 13 de noviembre.')
    await expect(row).not.toContainText('Te respondemos')
    await expect(row.getByRole('link', { name: 'Ver solicitud #6' })).toHaveAttribute('href', '/cuenta/cotizaciones/6')
    await expect(history.getByRole('article', { name: 'Solicitud #9' })).toHaveCount(0)
    await expect(history.getByRole('article', { name: 'Solicitud #7' })).toHaveCount(0)
    const open = page.getByRole('region', { name: 'Solicitudes de cotización' })
    await expect(open.getByRole('article', { name: 'Solicitud #6' })).toHaveCount(0)
  })

  test('with only a cancelled request there is no empty state and no "en curso" section', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([]) } })
    await mockReferenceList(page, { status: 200, body: referencePage([dropped]) })
    await page.goto('/cuenta')
    await expect(page.getByRole('region', { name: 'Solicitudes anteriores' }).getByRole('article', { name: 'Solicitud #6' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Solicitudes de cotización' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Aún no tienes pedidos' })).toHaveCount(0)
  })

  test('without orders but with a request in review it is not the empty state', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([]) } })
    await mockReferenceList(page, { status: 200, body: referencePage([inReview]) })
    await page.goto('/cuenta')
    await expect(page.getByRole('region', { name: 'Solicitudes de cotización' }).getByRole('article', { name: 'Solicitud #7' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Aún no tienes pedidos' })).toHaveCount(0)
  })

  test('without requests there is no section; if they fail, the orders still show and it says so', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation]) } })
    await mockReferenceList(page, { status: 500, body: {} })
    await page.goto('/cuenta')
    await expect(page.getByRole('article', { name: 'Pedido #60' })).toBeVisible()
    await expect(page.getByText('No pudimos cargar tus solicitudes de cotización.')).toBeVisible()
  })
})

test('the account submenu links the three sections and marks the current one', async ({ page }) => {
  await mockOrderList(page, { 1: { status: 200, body: orderPage([]) } })
  await page.goto('/cuenta')
  const nav = page.getByRole('navigation', { name: 'Tu cuenta' })
  await expect(nav.getByRole('link', { name: 'Mis pedidos' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Bases en préstamo' })).toHaveAttribute('href', '/cuenta/bases')
  await expect(nav.getByRole('link', { name: 'Datos y avisos' })).toHaveAttribute('href', '/cuenta/datos')
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the account menu opens as a dialog, moves with the keyboard and gives the focus back', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation, delivered]) } })
    await page.goto('/cuenta')
    await expect(page.getByRole('navigation', { name: 'Tu cuenta' })).toBeHidden()
    const opener = page.getByRole('button', { name: 'Mis pedidos' })
    await expect(opener).toHaveAttribute('aria-expanded', 'false')
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Tu cuenta' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Ana López García')
    await expect(dialog).toContainText('ana@correo.test')
    await expect(dialog.getByRole('link', { name: 'Mis pedidos' })).toHaveAttribute('aria-current', 'page')
    await expect(dialog.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()

    await opener.click()
    await page.getByRole('dialog', { name: 'Tu cuenta' }).getByRole('link', { name: 'Bases en préstamo' }).click()
    await expect(page).toHaveURL(/\/cuenta\/bases$/)
    await expect(page.getByRole('dialog', { name: 'Tu cuenta' })).toBeHidden()
  })

  test('the cards stack in one column without horizontal scroll', async ({ page }) => {
    await mockOrderList(page, { 1: { status: 200, body: orderPage([inPreparation, delivered]) } })
    await page.goto('/cuenta')
    await expect(page.getByRole('article', { name: 'Pedido #58' })).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
  })
})
