import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El avance de "Diseña tu pastel" se ve (22 de noviembre): al confirmar un paso con "Continuar", su fila entra a "Tu pastel"
 * (la tarjeta entera la primera vez), la palomita del paso se asienta y la línea al siguiente se llena; en móvil se llena el
 * segmento del paso nuevo. Al regresar, al recargar o con "reducir movimiento" no se mueve nada. La API se simula.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

const stepTitle = (page: Page) => page.locator('#paso-titulo')
const stepBar = (page: Page) => page.getByRole('navigation', { name: 'Pasos de Diseña tu pastel' })
const summary = (page: Page) => page.getByRole('region', { name: 'Tu pastel', exact: true })
const summaryRows = (page: Page) => page.getByRole('region', { name: 'Lo que elegiste' }).getByRole('listitem')
const desktopStep = (page: Page, index: number) => stepBar(page).locator('ol').first().locator(':scope > li').nth(index)
const mobileSegment = (page: Page, index: number) => stepBar(page).locator('ol[aria-hidden="true"] > li').nth(index).locator('span')
const proceed = (page: Page) => page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar', exact: true }).click()

const ANIMATIONS = ['aparece', 'asienta', 'tramo-lleno']

/** El nombre, la duración, la curva y el retraso de la animación de CSS de un elemento. */
const animationOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction, delay: style.animationDelay }
  })

/** Las animaciones del avance que lleva cualquier elemento dentro de `scope`. */
const progressAnimations = (scope: Locator) =>
  scope.evaluate(
    (element, names) => [element, ...element.querySelectorAll('*')].map((node) => getComputedStyle(node).animationName).filter((name) => names.includes(name)),
    ANIMATIONS,
  )

async function open(page: Page, search = '') {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
  await page.goto(`/pedido/disena${search}`)
  await expect(stepTitle(page)).toBeVisible()
}

/** Del paso 1 al 2: espera los kilos para que "Continuar" no se quede esperando. */
async function leaveStepOne(page: Page) {
  await expect(page.getByTestId('kilos')).not.toHaveAttribute('aria-busy', 'true')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
}

const ENTRANCE = { duration: '0.25s', easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }

test('leaving step 1 brings in "Tu pastel" whole, settles the check and fills the line to step 2', async ({ page }) => {
  await open(page)
  await expect(summary(page)).toHaveCount(0)
  await leaveStepOne(page)
  expect(await animationOf(summary(page))).toEqual({ name: 'aparece', ...ENTRANCE, delay: '0s' })
  // La tarjeta entra entera: su fila no se mueve aparte.
  expect((await animationOf(summaryRows(page).first())).name).toBe('none')
  expect(await animationOf(desktopStep(page, 0).locator('svg'))).toEqual({ name: 'asienta', ...ENTRANCE, delay: '0s' })
  // La línea sale 60 ms después de la palomita, para que el avance se lea de izquierda a derecha.
  expect(await animationOf(desktopStep(page, 0).getByTestId('tramo-lleno'))).toEqual({ name: 'tramo-lleno', ...ENTRANCE, delay: '0.06s' })
  // Al terminar, todo queda como siempre.
  await expect.poll(() => summary(page).evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(summary(page)).toHaveCSS('opacity', '1')
  await expect(summary(page)).toHaveCSS('transform', 'none')
  await expect.poll(() => stepBar(page).evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(desktopStep(page, 0).getByTestId('tramo-lleno')).toHaveCSS('transform', 'none')
})

test('confirming the next step adds only its row, and only its check and line move', async ({ page }) => {
  await open(page)
  await leaveStepOne(page)
  await page.getByRole('radio', { name: 'Tres leches' }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(summaryRows(page)).toHaveCount(2)
  expect((await animationOf(summary(page))).name).toBe('none')
  expect((await animationOf(summaryRows(page).first())).name).toBe('none')
  expect(await animationOf(summaryRows(page).last())).toEqual({ name: 'aparece', ...ENTRANCE, delay: '0s' })
  expect((await animationOf(desktopStep(page, 0).locator('svg'))).name).toBe('none')
  expect((await animationOf(desktopStep(page, 1).locator('svg'))).name).toBe('asienta')
  expect((await animationOf(desktopStep(page, 1).getByTestId('tramo-lleno'))).name).toBe('tramo-lleno')
  // Al regresar no se mueve nada: el paso al que se vuelve solo cambia a "actual".
  await page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Atrás' }).click()
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  expect(await progressAnimations(stepBar(page))).toEqual([])
  expect(await progressAnimations(summary(page))).toEqual([])
})

test('a reload on a later step shows the rows, checks and lines as they are', async ({ page }) => {
  await open(page)
  await leaveStepOne(page)
  await page.getByRole('radio', { name: 'Tres leches' }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await page.reload()
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(summaryRows(page)).toHaveCount(2)
  // Los kilos llegan de la API después de montar: tampoco eso anima la palomita del paso 1.
  await expect(page.getByTestId('total-estimado').first()).toHaveAttribute('data-state', 'ready')
  expect(await progressAnimations(stepBar(page))).toEqual([])
  expect(await progressAnimations(summary(page))).toEqual([])
})

test('with reduced motion nothing in "Tu pastel" or the step bar moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await leaveStepOne(page)
  await expect(summary(page)).toBeVisible()
  expect(await progressAnimations(stepBar(page))).toEqual([])
  expect(await progressAnimations(summary(page))).toEqual([])
  expect(await page.locator('main').evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName))).not.toContain('asienta')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the segment of the new step fills from the left over its rail', async ({ page }) => {
    await open(page)
    await leaveStepOne(page)
    expect(await animationOf(mobileSegment(page, 1))).toEqual({ name: 'tramo-lleno', ...ENTRANCE, delay: '0s' })
    // El del paso que se dejó solo cambia de color.
    expect((await animationOf(mobileSegment(page, 0))).name).toBe('none')
    expect(await mobileSegment(page, 1).evaluate((element) => getComputedStyle(element).transformOrigin.split(' ')[0])).toBe('0px')
    await expect.poll(() => mobileSegment(page, 1).evaluate((element) => element.getAnimations().length)).toBe(0)
    await expect(mobileSegment(page, 1)).toHaveCSS('transform', 'none')
  })
})
