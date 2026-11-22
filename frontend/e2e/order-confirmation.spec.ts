import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockAuth, signedIn } from './support/auth.ts'
import { accountOrder, mockNote, mockOrderDetail } from './support/account-orders.ts'
import { NOW } from './support/checkout.ts'
import { mockPayment } from './support/payments.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/confirmacion?pedido=<id>` (D69, frontend; mockup `Confirmacion`): la confirmación se verifica contra el
 * servidor. Pagado: el número, la línea de tiempo, el resumen, la base y la nota. Sin pagar: regresa al pago.
 */

const CONFIRMATION = '/pedido/confirmacion?pedido=57'
const received = () => accountOrder({ status: 'received', status_changed_at: '2026-11-13T18:09:00Z' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

test('without a session it asks to sign in and comes back', async ({ page }) => {
  await mockAuth(page)
  await page.goto(CONFIRMATION)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fconfirmacion%3Fpedido%3D57$/)
})

test('a paid order shows its number, timeline, summary, stand and the note', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: received() })
  await mockNote(page, 57)
  await page.goto(CONFIRMATION)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibimos tu pedido')
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('[aria-current="step"]')).toContainText('Confirmación')
  await expect(page.getByText('Te enviamos la confirmación a ana@correo.test. Te avisaremos cada vez que cambie de estado.')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
  await expect(page.getByText('Hecho el viernes 13 de noviembre a las 12:00')).toBeVisible()
  await expect(page.getByRole('main').getByText('Paso 1 de 4:')).toBeAttached()

  const steps = page.getByRole('list', { name: 'Cómo va tu pedido' }).getByRole('listitem')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(0)).toHaveText(/Recibido, hecho.*viernes 13 de noviembre, 12:09/)
  await expect(steps.nth(1)).toHaveText(/En preparación, pendiente.*Te avisamos por correo cuando empecemos/)
  await expect(steps.nth(2)).toHaveText(/Listo para recoger, pendiente.*lunes 16 de noviembre a las 3:30 pm, en la pastelería/)
  await expect(steps.nth(3)).toHaveText(/Entregado, pendiente.*Y regresas la base antes del martes 1 de diciembre, con tu nota, para recuperar tu depósito/)

  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toHaveAttribute('href', '/cuenta/pedidos/57')
  await expect(page.getByRole('main').getByRole('link', { name: 'Seguir comprando' })).toHaveAttribute('href', '/catalogo')

  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary).toContainText('Tres leches de durazno')
  await expect(summary.getByRole('row', { name: /Anticipo pagado \(50%\)/ })).toContainText('$2,087.50')
  await expect(summary.getByRole('row', { name: /Total del pedido/ })).toContainText('$4,175 MXN')
  await expect(summary).toContainText('Depósito por base retenido')
  await expect(summary).toContainText('Te lo devolvemos si regresas la base antes del martes 1 de diciembre con tu nota.')

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar nota (PDF)' }).click()
  expect((await downloading).suggestedFilename()).toBe('nota-pedido-57.pdf')
})

test('an order that is not paid goes back to the payment', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'awaiting_payment' }) })
  await mockPayment(page)
  await page.goto(CONFIRMATION)
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
})

test('an order of someone else or that does not exist shows the error of the payment pattern', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 404, body: { detail: 'No encontrado.' } })
  await page.goto(CONFIRMATION)
  await expect(page.getByRole('heading', { name: 'No encontramos tu pedido' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
  await expect(page.getByRole('region', { name: 'Resumen' })).toHaveCount(0)
})

test('without ?pedido= it does not ask the API', async ({ page }) => {
  await signedIn(page)
  const requests = await mockOrderDetail(page, 57)
  await page.goto('/pedido/confirmacion')
  await expect(page.getByRole('heading', { name: 'No encontramos tu pedido' })).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('a load error says so and retries', async ({ page }) => {
  await signedIn(page)
  let fail = true
  await page.route('**/api/v1/orders/57/', async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(received()) })
  })
  await page.goto(CONFIRMATION)
  await expect(page.getByText('No pudimos cargar tu pedido')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the order goes before the summary and nothing scrolls sideways', async ({ page }) => {
    await signedIn(page)
    await mockOrderDetail(page, 57, { status: 200, body: received() })
    await page.goto(CONFIRMATION)
    const headings = page.getByRole('main').getByRole('heading', { level: 2 })
    await expect(headings).toHaveText(['Pedido #57', 'Resumen'])
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
  })
})

test.describe('the timeline settles once, step by step', () => {
  const markers = (page: Page) =>
    page.getByRole('list', { name: 'Cómo va tu pedido' }).getByTestId('marcador-hito')

  async function openReady(page: Page) {
    await signedIn(page)
    await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'ready_for_delivery', status_changed_at: '2026-11-13T18:09:00Z' }) })
    await mockNote(page, 57)
    await page.goto(CONFIRMATION)
    await expect(markers(page)).toHaveCount(4)
  }

  const motion = (locator: Locator) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element)
      return { name: style.animationName, duration: style.animationDuration, delay: style.animationDelay, easing: style.animationTimingFunction }
    })

  test('done and current markers arrive one after the other and the done lines run down; pending ones stay still', async ({ page }) => {
    await openReady(page)
    // Recibido y En preparación, hechos; Listo para recoger, en curso; Entregado, pendiente.
    const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'
    expect(await motion(markers(page).nth(0))).toEqual({ name: 'hito', duration: '0.45s', delay: '0s', easing })
    expect(await motion(markers(page).nth(1))).toEqual({ name: 'hito', duration: '0.45s', delay: '0.06s', easing })
    expect(await motion(markers(page).nth(2))).toEqual({ name: 'hito', duration: '0.45s', delay: '0.12s', easing })
    expect((await motion(markers(page).nth(3))).name).toBe('none')
    const lines = page.getByRole('list', { name: 'Cómo va tu pedido' }).getByTestId('linea-hito')
    expect(await motion(lines.nth(0))).toEqual({ name: 'hito-tramo', duration: '0.45s', delay: '0.06s', easing })
    expect((await motion(lines.nth(1))).name).toBe('hito-tramo')
    // La línea del paso en curso al pendiente no baja: todavía no se llega ahí.
    expect((await motion(lines.nth(2))).name).toBe('none')
    // Los títulos no se mueven: son lo que se lee.
    expect(await page.getByRole('list', { name: 'Cómo va tu pedido' }).getByRole('listitem').first().evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    await expect.poll(() => page.getByRole('list', { name: 'Cómo va tu pedido' }).evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
    await expect(markers(page).nth(2)).toHaveCSS('opacity', '1')
    await expect(markers(page).nth(2)).toHaveCSS('transform', 'none')
  })

  test('with reduced motion the timeline is there at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openReady(page)
    for (const marker of await markers(page).all()) expect((await motion(marker)).name).toBe('none')
    expect(await page.getByRole('list', { name: 'Cómo va tu pedido' }).evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  })
})
