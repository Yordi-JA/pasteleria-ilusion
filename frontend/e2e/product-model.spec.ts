/// <reference lib="dom" />
// Los callbacks de `evaluate` y `addInitScript` corren en el navegador y usan sus tipos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProductDetails, productDetail, SHOWCASE_AVAILABLE } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La ficha con el modelo 3D vivo del producto (D95): en el lugar de la foto, la escena de la portada (D48) gira sola, se arrastra,
 * gira con las flechas, se pausa fuera de pantalla y respeta "reducir movimiento". La forma es la misma de la imagen del catálogo:
 * el pastel con su muestra (D86) o el postre con su modelo. Sin WebGL 2 o si el chunk falla, la foto real o su hueco. La escena
 * expone en desarrollo `data-angle`, `data-frames`, `data-running`, `data-board`, `data-tiers` y `data-dessert`.
 */

test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

const FLAN_NAME = 'Flan napolitano, ilustración del postre'
const DURAZNO_NAME = 'Tres leches de durazno, ilustración del pastel'

/** La muestra de la semilla, sin los detalles de la foto: cobertura, rosetones, peinado y fruta. */
const SAMPLE = {
  coverage_color: '#C8742F',
  decoration: 'rosetones',
  decoration_color: '#F8F0E7',
  fruit_layout: 'mound',
  fruits: ['strawberry', 'peach'],
  side_comb: true,
  model_image: 'tres-leches-de-durazno-modelo.webp',
  show_model_in_catalog: true,
}

/** Durazno de vitrina con su pan, su sabor, su muestra y, si se pide, su foto real. */
function durazno({ sample = SAMPLE as object | null, photo = null as string | null } = {}) {
  const detail = productDetail('tres-leches-de-durazno', {
    sizes: { 1: { approx_weight_kg: '2.7', servings: 19 } },
    filling_flavor: 'durazno',
    bread: 'vainilla',
    showcase_design: SHOWCASE_AVAILABLE,
  })
  return { ...detail, photo, model_image: null, sample_design: sample }
}

const box = (page: Page) => page.getByTestId('ficha-modelo')
const fallback = (page: Page) => page.getByTestId('ficha-modelo-fijo')
const scene = (page: Page, name: string) => page.getByRole('img', { name, exact: true })
const num = async (page: Page, name: string, attr: string) => Number(await scene(page, name).getAttribute(attr))

async function open(page: Page, slug: string, details: object[]) {
  await mockProductDetails(page, details)
  await page.goto(`/pasteles/${slug}`)
}

async function waitReady(page: Page, name: string) {
  await expect(box(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
  await expect.poll(() => num(page, name, 'data-frames')).toBeGreaterThan(0)
}

test.describe('product model: scene', () => {
  test('a dessert with a model turns in the place of its photo, in the same box, and the empty photo slot steps aside', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    // Mientras llega la escena, el hueco de la foto en la misma caja.
    await waitReady(page, FLAN_NAME)
    const flan = scene(page, FLAN_NAME)
    await expect(flan).toBeVisible()
    await expect(flan).toHaveAttribute('data-dessert', 'flan')
    await expect(fallback(page)).toBeHidden()
    await expect(page.getByRole('img', { name: 'Foto del postre pendiente' })).toBeHidden()
    // Del ancho de la caja de la foto y más baja: 460 × 340 px, para que el modelo la llene.
    const rect = (await box(page).boundingBox())!
    expect(rect.width).toBeCloseTo(460, 0)
    expect(rect.height).toBeCloseTo(340, 0)
    // Gira sola, despacio.
    const before = await num(page, FLAN_NAME, 'data-angle')
    await expect.poll(() => num(page, FLAN_NAME, 'data-angle'), { timeout: 4000 }).toBeGreaterThan(before + 2)
    // Sin foto real no hay nada que abrir, y el 3D no se anuncia.
    await expect(page.getByRole('link', { name: /Ver la foto/ })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(/3D/)
  })

  test('the three desserts with a model each show theirs', async ({ page }) => {
    for (const [slug, name, kind] of [
      ['mosaico-con-crema', 'Mosaico con crema, ilustración del postre', 'mosaicCup'],
      ['tarta-de-frutas', 'Tarta de frutas, ilustración del postre', 'miniTart'],
    ] as const) {
      await open(page, slug, [productDetail(slug)])
      await waitReady(page, name)
      await expect(scene(page, name)).toHaveAttribute('data-dessert', kind)
    }
  })

  test('each of the five cups shows its model and sells from today\'s showcase only', async ({ page }) => {
    const cups = [
      ['gelatina-mosaico', 'Mosaico normal', 92, 'mosaicCup'],
      ['mosaico-con-crema', 'Mosaico con crema', 60, 'mosaicCup'],
      ['mosaico-con-yogurt-de-durazno', 'Mosaico con yogurt de durazno', 93, 'mosaicCup'],
      ['mosaico-con-yogurt-de-fresa', 'Mosaico con yogurt de fresa', 90, 'mosaicCup'],
      ['gelatina-de-duvalin', 'Gelatina de Duvalín', 91, 'layeredCup'],
    ] as const
    const when = page.getByRole('group', { name: '¿Cuándo lo quieres?' })
    for (const [slug, title, offeringId, kind] of cups) {
      await open(page, slug, [productDetail(slug, { stock: { [offeringId]: 4 } })])
      const name = `${title}, ilustración del postre`
      await waitReady(page, name)
      await expect(scene(page, name)).toHaveAttribute('data-dessert', kind)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(when.getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeChecked()
      await expect(when).toContainText('Solo en vitrina')
      await expect(page.getByRole('button', { name: 'Agregar al pedido' })).toBeVisible()
    }
  })

  test('the Imposible shows its model and "Ver la foto" opens its real photo', async ({ page }) => {
    const name = 'Imposible, ilustración del postre'
    await open(page, 'imposible', [{ ...productDetail('imposible'), photo: 'imposible.webp' }])
    await waitReady(page, name)
    await expect(scene(page, name)).toHaveAttribute('data-dessert', 'flan')
    await expect(page.getByRole('heading', { level: 1, name: 'Imposible' })).toBeVisible()
    const link = page.getByRole('link', { name: 'Ver la foto (se abre en otra pestaña)' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/fotos/imposible.webp')
    // La foto existe y abre.
    const photo = await page.request.get('/fotos/imposible.webp')
    expect(photo.status()).toBe(200)
    expect(photo.headers()['content-type']).toContain('image/webp')
  })

  test('the Posible and the mold gelatin show their model (D98); without a real photo there is no "Ver la foto"', async ({ page }) => {
    for (const [slug, title, kind] of [
      ['posible', 'Posible', 'flan'],
      ['gelatina-de-molde', 'Gelatina de molde', 'moldRing'],
    ] as const) {
      const name = `${title}, ilustración del postre`
      await open(page, slug, [productDetail(slug)])
      await waitReady(page, name)
      await expect(scene(page, name)).toHaveAttribute('data-dessert', kind)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      // Gira sola.
      const before = await num(page, name, 'data-angle')
      await expect.poll(() => num(page, name, 'data-angle'), { timeout: 4000 }).toBeGreaterThan(before + 2)
      // Su hueco de foto se queda como respaldo, oculto tras la escena; no hay foto que abrir.
      await expect(fallback(page)).toBeHidden()
      await expect(page.getByRole('link', { name: /Ver la foto/ })).toHaveCount(0)
    }
  })

  test('a cake with its sample is built like its catalog image: on its board, with one tier', async ({ page }) => {
    await open(page, 'tres-leches-de-durazno', [durazno()])
    await waitReady(page, DURAZNO_NAME)
    const cake = scene(page, DURAZNO_NAME)
    await expect(cake).toHaveAttribute('data-board', 'true')
    await expect(cake).toHaveAttribute('data-tiers', '1')
    await expect(cake).toHaveAttribute('data-dessert', 'none')
  })

  test('with a real photo, "Ver la foto" opens it apart once the scene is drawn', async ({ page }) => {
    await open(page, 'tres-leches-de-durazno', [durazno({ photo: 'tres-leches-de-durazno.webp' })])
    await waitReady(page, DURAZNO_NAME)
    const link = page.getByRole('link', { name: 'Ver la foto (se abre en otra pestaña)' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/fotos/tres-leches-de-durazno.webp')
    await expect(link).toHaveAttribute('target', '_blank')
    // La foto queda detrás de la escena, fuera de la vista y del árbol de accesibilidad.
    await expect(page.getByRole('img', { name: 'Tres leches de durazno', exact: true })).toHaveCount(0)
  })

  test('a cake without a sample keeps its photo slot, with no scene', async ({ page }) => {
    await open(page, 'tres-leches-de-durazno', [durazno({ sample: null })])
    await expect(page.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
    await expect(box(page)).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('the scene takes focus with a visible ring and its hint; the arrows turn it', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    await waitReady(page, FLAN_NAME)
    const flan = scene(page, FLAN_NAME)
    await flan.focus()
    await expect(flan).toBeFocused()
    await expect(flan).toHaveAccessibleDescription('Arrástralo para girarlo. Usa las flechas izquierda y derecha para girarlo.')
    expect(await flan.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    const before = await num(page, FLAN_NAME, 'data-angle')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => num(page, FLAN_NAME, 'data-angle')).toBeGreaterThanOrEqual(before + 29)
  })

  test('pauses when it leaves the screen', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano', { related: ['imposible', 'choco-pinguino', 'red-velvet'] })])
    await waitReady(page, FLAN_NAME)
    await expect(scene(page, FLAN_NAME)).toHaveAttribute('data-running', 'true')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(scene(page, FLAN_NAME)).toHaveAttribute('data-running', 'false')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(scene(page, FLAN_NAME)).toHaveAttribute('data-running', 'true')
  })
})

test.describe('product model: fallback', () => {
  test('without WebGL the real photo stays and the scene is never requested', async ({ page }) => {
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
    await open(page, 'tres-leches-de-durazno', [durazno({ photo: 'tres-leches-de-durazno.webp' })])
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(page.getByRole('img', { name: 'Tres leches de durazno', exact: true })).toBeVisible()
    await expect(scene(page, DURAZNO_NAME)).toHaveCount(0)
    // La foto ya está a la vista: el enlace no se ofrece.
    await expect(page.getByRole('link', { name: /Ver la foto/ })).toBeHidden()
    expect(sceneRequests).toEqual([])
  })

  test('if the scene chunk fails, the photo slot stays', async ({ page }) => {
    await page.route('**/src/three/CakeScene.tsx*', (route) => route.abort())
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(page.getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('if the scene had focus when the context is lost, focus moves to the product name', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    await waitReady(page, FLAN_NAME)
    await scene(page, FLAN_NAME).focus()
    await page.locator('[data-testid="ficha-modelo"] canvas').evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
      gl!.getExtension('WEBGL_lose_context')!.loseContext()
    })
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(page.getByRole('heading', { level: 1, name: 'Flan napolitano' })).toBeFocused()
  })
})

test.describe('product model: reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('does not turn on its own; the arrows still turn it', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    await waitReady(page, FLAN_NAME)
    const angle = await num(page, FLAN_NAME, 'data-angle')
    await page.waitForTimeout(600)
    expect(await num(page, FLAN_NAME, 'data-angle')).toBe(angle)
    await scene(page, FLAN_NAME).focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => num(page, FLAN_NAME, 'data-angle')).toBe(angle + 15)
  })
})

test.describe('product model: on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the text goes before the scene and nothing overflows', async ({ page }) => {
    await open(page, 'flan-napolitano', [productDetail('flan-napolitano')])
    await waitReady(page, FLAN_NAME)
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    const rect = (await box(page).boundingBox())!
    expect(rect.y).toBeGreaterThan(title.y)
    expect(rect.width).toBeLessThanOrEqual(358)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
