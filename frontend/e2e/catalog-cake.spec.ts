/// <reference lib="dom" />
// Los callbacks de `evaluate` y `addInitScript` corren en el navegador y usan sus tipos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El pastel 3D del catálogo (D59, libro de marca "Presencia de marca"): el de la portada (D48) en el encabezado y en
 * "¿No encuentras el pastel que imaginas?", en la escena chica y sin separar los pisos con el scroll. La escena
 * expone en desarrollo `data-angle`, `data-separation`, `data-frames` y `data-running`.
 */

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const NAME = 'Pastel de tres pisos'
const KEYS_HINT = 'Usa las flechas izquierda y derecha para girarlo.'
const BOXES = ['pastel-catalogo', 'pastel-imaginas'] as const
type Box = (typeof BOXES)[number]

const box = (page: Page, id: Box) => page.getByTestId(id)
const scene = (page: Page, id: Box) => box(page, id).getByRole('img', { name: NAME, exact: true })
const num = async (page: Page, id: Box, attr: string) => Number(await scene(page, id).getAttribute(attr))
const band = (page: Page) => page.getByRole('region', { name: '¿No encuentras el pastel que imaginas?' })

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

async function scrollToBand(page: Page) {
  await band(page).scrollIntoViewIfNeeded()
}

test('both cakes are the 3D scene in the small box, focusable, with their name and the arrows hint', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await scrollToBand(page)
  await waitReady(page, 'pastel-imaginas')
  for (const id of BOXES) {
    expect((await box(page, id).boundingBox())!.height).toBe(420)
    await expect(scene(page, id)).toHaveAttribute('tabindex', '0')
    await expect(scene(page, id)).toHaveAccessibleDescription(new RegExp(KEYS_HINT))
    await expect(page.getByTestId(`${id}-fijo`)).toBeHidden()
  }
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
  await scrollToBand(page)
  await waitReady(page, 'pastel-imaginas')
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(400)
  expect(await num(page, 'pastel-imaginas', 'data-separation')).toBe(0)
})

test('each scene pauses when it leaves the screen', async ({ page }) => {
  await openCatalog(page)
  await waitReady(page, 'pastel-catalogo')
  await expect(scene(page, 'pastel-catalogo')).toHaveAttribute('data-running', 'true')
  await scrollToBand(page)
  await waitReady(page, 'pastel-imaginas')
  await expect(scene(page, 'pastel-imaginas')).toHaveAttribute('data-running', 'true')
  await expect(scene(page, 'pastel-catalogo')).toHaveAttribute('data-running', 'false')
  await page.waitForTimeout(150)
  const frames = await num(page, 'pastel-catalogo', 'data-frames')
  await page.waitForTimeout(600)
  expect(await num(page, 'pastel-catalogo', 'data-frames')).toBe(frames)
})

test('the arrows turn it, and on mermelada the focus ring is betun', async ({ page }) => {
  await openCatalog(page)
  await scrollToBand(page)
  await waitReady(page, 'pastel-imaginas')
  await band(page).getByRole('link', { name: 'Realizar pedido' }).focus()
  await page.keyboard.press('Tab')
  await expect(scene(page, 'pastel-imaginas')).toBeFocused()
  await expect(scene(page, 'pastel-imaginas')).toHaveCSS('outline-style', 'solid')
  // `betun` (#fffbfb), no `mermelada`, que no se vería sobre el campo.
  await expect(scene(page, 'pastel-imaginas')).toHaveCSS('outline-color', 'rgb(255, 251, 251)')
  const before = await num(page, 'pastel-imaginas', 'data-angle')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => num(page, 'pastel-imaginas', 'data-angle')).toBeGreaterThanOrEqual(before + 29)
})

test('if a scene with focus loses its context, focus moves to "Realizar pedido" of its section', async ({ page }) => {
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

test('without WebGL both static cakes stay and the scene is never requested', async ({ page }) => {
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
  for (const id of BOXES) {
    await expect(box(page, id)).toHaveAttribute('data-state', 'fallback')
    await expect(scene(page, id)).toHaveCount(0)
  }
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
