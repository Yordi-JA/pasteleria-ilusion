/// <reference lib="dom" />
// Los callbacks de `evaluate` y `addInitScript` corren en el navegador y usan sus tipos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El pastel 3D del catálogo (D59, libro de marca "Presencia de marca"): el de la portada (D48) en el encabezado, en la
 * escena chica y sin separar los pisos con el scroll. La banda "¿No encuentras el pastel que imaginas?" y su segundo
 * pastel se quitaron en la tanda 1 (D77). La escena expone en desarrollo `data-angle`, `data-separation`, `data-frames`
 * y `data-running`.
 */

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const NAME = 'Pastel de tres pisos'
const KEYS_HINT = 'Usa las flechas izquierda y derecha para girarlo.'
type Box = 'pastel-catalogo'

const box = (page: Page, id: Box) => page.getByTestId(id)
const scene = (page: Page, id: Box) => box(page, id).getByRole('img', { name: NAME, exact: true })
const num = async (page: Page, id: Box, attr: string) => Number(await scene(page, id).getAttribute(attr))
const desserts = (page: Page) => page.getByRole('region', { name: 'Postres y gelatinas', exact: true })

async function openCatalog(page: Page) {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockProducts(page)
  await page.goto('/catalogo')
}

async function waitReady(page: Page, id: Box) {
  await expect(box(page, id)).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => num(page, id, 'data-frames')).toBeGreaterThan(0)
}


test('the cake is the 3D scene in the small box, focusable, with its name and the arrows hint; there is only one', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  expect((await box(page, 'pastel-catalogo').boundingBox())!.height).toBe(420)
  await expect(scene(page, 'pastel-catalogo')).toHaveAttribute('tabindex', '0')
  await expect(scene(page, 'pastel-catalogo')).toHaveAccessibleDescription(new RegExp(KEYS_HINT))
  await expect(page.getByTestId('pastel-catalogo-fijo')).toBeHidden()
  await expect(page.getByRole('img', { name: NAME, exact: true })).toHaveCount(1)
})

test('without separating tiers, the canvas does not stick out of its box (the portada lifts it 72 px)', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  const outer = (await box(page, 'pastel-catalogo').boundingBox())!
  const canvas = (await box(page, 'pastel-catalogo').locator('canvas').boundingBox())!
  expect(canvas.y).toBeGreaterThanOrEqual(outer.y - 0.5)
})

test('the tiers never separate with the scroll (that is only on the portada)', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(400)
  expect(await num(page, 'pastel-catalogo', 'data-separation')).toBe(0)
})

test('the scene pauses when it leaves the screen', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await expect(scene(page, 'pastel-catalogo')).toHaveAttribute('data-running', 'true')
  await desserts(page).scrollIntoViewIfNeeded()
  await expect(scene(page, 'pastel-catalogo')).toHaveAttribute('data-running', 'false')
  await page.waitForTimeout(150)
  const frames = await num(page, 'pastel-catalogo', 'data-frames')
  await page.waitForTimeout(600)
  expect(await num(page, 'pastel-catalogo', 'data-frames')).toBe(frames)
})

test('Tab reaches it after "Realizar pedido", with a visible ring, and the arrows turn it', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await page.getByRole('region', { name: 'Catálogo' }).getByRole('link', { name: 'Realizar pedido' }).focus()
  await page.keyboard.press('Tab')
  await expect(scene(page, 'pastel-catalogo')).toBeFocused()
  await expect(scene(page, 'pastel-catalogo')).toHaveCSS('outline-style', 'solid')
  const before = await num(page, 'pastel-catalogo', 'data-angle')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => num(page, 'pastel-catalogo', 'data-angle')).toBeGreaterThanOrEqual(before + 29)
})

test('if the scene with focus loses its context, focus moves to "Realizar pedido"', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await scene(page, 'pastel-catalogo').focus()
  await page.locator('[data-testid="pastel-catalogo"] canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
    gl!.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await expect(box(page, 'pastel-catalogo')).toHaveAttribute('data-state', 'fallback')
  await expect(page.getByTestId('pastel-catalogo-fijo')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Catálogo' }).getByRole('link', { name: 'Realizar pedido' })).toBeFocused()
})

test('without WebGL the static cake stays and the scene is never requested', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...args: unknown[]) => unknown
    const withoutWebGL = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null
      return original.call(this, type, ...rest)
    }
    HTMLCanvasElement.prototype.getContext = withoutWebGL as typeof HTMLCanvasElement.prototype.getContext
  })
  const sceneRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/src/three/')) sceneRequests.push(request.url())
  })
  await openCatalog(page)
  await expect(box(page, 'pastel-catalogo')).toHaveAttribute('data-state', 'fallback')
  await expect(scene(page, 'pastel-catalogo')).toHaveCount(0)
  await expect(page.getByTestId('pastel-catalogo-fijo')).toBeVisible()
  expect(sceneRequests).toEqual([])
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('does not turn on its own', async ({ page }) => {
    await openCatalog(page)
    await waitReady(page, 'pastel-catalogo')
    const angle = await num(page, 'pastel-catalogo', 'data-angle')
    await page.waitForTimeout(1000)
    expect(await num(page, 'pastel-catalogo', 'data-angle')).toBe(angle)
  })
})

test.describe('on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the small box is 320 px and nothing overflows', async ({ page }) => {
    await openCatalog(page)
    await waitReady(page, 'pastel-catalogo')
    expect((await box(page, 'pastel-catalogo').boundingBox())!.height).toBe(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
