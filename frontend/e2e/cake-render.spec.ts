import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProductDetails, productDetail, SHOWCASE_AVAILABLE } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La ruta que genera las imágenes fijas del catálogo (D86, solo en desarrollo): `/muestra/modelo/:slug` arma el pastel de vitrina
 * del producto con su muestra del modelo usando los view-models de "Diseña tu pastel", lo dibuja con la cámara de las fotos y
 * deja la captura en `window.__captureModel()`. La API se simula: la ficha con su `sample_design` y las opciones del diseñador.
 */

const FRAMING = '/src/three/stillFraming.ts'

/** La muestra de la semilla de Tres leches de cajeta (`0050`): cobertura de cajeta, rosetones blancos, peinado y fruta. */
const CAJETA_SAMPLE = {
  coverage_color: '#C8742F',
  decoration: 'rosetones',
  decoration_color: '#F8F0E7',
  fruit_layout: 'mound',
  fruits: ['strawberry', 'apple', 'grape', 'peach', 'physalis'],
  side_comb: true,
  model_image: 'tres-leches-de-durazno-modelo.webp',
  show_model_in_catalog: true,
  // Los detalles de la imagen del catálogo (`0052`): tapa blanca, costado brillante con crestas, franja de crema, hilos y copos grandes.
  top_color: '#F7EFE6',
  top_glossy: false,
  side_glossy: true,
  side_texture: 'ridges',
  top_ring_color: null,
  top_ring_width: null,
  side_band_color: '#F7EFE6',
  side_band_height: 0.08,
  drizzle: 'threads',
  drizzle_color: '#C8742F',
  edge_size: 1.9,
  shells: null,
  shell_color: null,
  shell_second_color: null,
  dusting_color: null,
  side_bits: null,
  side_bits_color: null,
  // La fruta tupida de la foto (`0054`).
  fruit_density: 2,
  sprinkle_density: 1,
}

/** Sin ningún detalle de la imagen: lo que mandaba la API antes de la tanda 4b. */
const NO_DETAILS = Object.fromEntries(
  Object.entries(CAJETA_SAMPLE).filter(([key]) => ['coverage_color', 'decoration', 'decoration_color', 'fruit_layout', 'fruits', 'side_comb', 'model_image', 'show_model_in_catalog'].includes(key)),
)

/** Durazno de vitrina, con su pan, su sabor y la muestra que se pida. */
function durazno(sample: object | null) {
  const detail = productDetail('tres-leches-de-durazno', {
    sizes: { 1: { approx_weight_kg: '2.7', servings: 19 } },
    filling_flavor: 'durazno',
    bread: 'vainilla',
    showcase_design: SHOWCASE_AVAILABLE,
  })
  return { ...detail, model_image: null, sample_design: sample }
}

async function openRender(page: Page, sample: object | null) {
  await mockCakeDesignOptions(page)
  await mockProductDetails(page, [durazno(sample)])
  await page.setViewportSize({ width: 1200, height: 1200 })
  await page.goto('/muestra/modelo/tres-leches-de-durazno')
  return page.getByTestId('render-modelo')
}

test('arma el pastel de vitrina con la cobertura, el peinado, la decoración y la fruta de su muestra', async ({ page }) => {
  const render = await openRender(page, CAJETA_SAMPLE)
  await expect(render).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(render).toHaveAttribute('data-coverage', '#c8742f')
  await expect(render).toHaveAttribute('data-combed', '1')
  await expect(render).toHaveAttribute('data-fruit', 'mound')
  await expect(render).toHaveAttribute('data-decoration', 'rosettes')
  // La charola negra de las fotos en lugar de la base del diseñador, con los detalles de la foto y los copos más grandes.
  await expect(render).toHaveAttribute('data-board', 'board')
  await expect(render).toHaveAttribute('data-details', 'band drizzle sideGlossy sideTexture top')
  await expect(render).toHaveAttribute('data-edge-size', '1.9')
  await expect(render).toHaveAttribute('data-fruit-density', '2')
  await expect(page).toHaveTitle('Imagen del modelo · Pastelería Ilusión')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  // Fuera del marco del sitio: sin barra, sin pie y sin enlaces.
  await expect(page.locator('header, footer, a')).toHaveCount(0)
})

test('sin peinado ni fruta, la forma no los lleva', async ({ page }) => {
  const render = await openRender(page, { ...CAJETA_SAMPLE, side_comb: false, fruit_layout: null, fruits: [], decoration: 'ninguna', decoration_color: null })
  await expect(render).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(render).toHaveAttribute('data-combed', '0')
  await expect(render).toHaveAttribute('data-fruit', 'none')
  await expect(render).toHaveAttribute('data-decoration', 'none')
})

test('fresa lleva su anillo de mermelada y durazno su glaseado; sin detalles, solo la charola', async ({ page }) => {
  const fresa = await openRender(page, { ...NO_DETAILS, top_ring_color: '#B3312F', top_ring_width: 0.5, side_texture: 'lace' })
  await expect(fresa).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(fresa).toHaveAttribute('data-details', 'ring sideTexture')
  const durazno = await openRender(page, { ...NO_DETAILS, top_color: '#E2B21C', top_glossy: true, side_band_color: '#D9B52E', side_band_height: 0.5 })
  await expect(durazno).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(durazno).toHaveAttribute('data-details', 'band top')
  const plain = await openRender(page, NO_DETAILS)
  await expect(plain).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(plain).toHaveAttribute('data-details', '')
  await expect(plain).toHaveAttribute('data-board', 'board')
  await expect(plain).toHaveAttribute('data-edge-size', '1')
  await expect(plain).toHaveAttribute('data-fruit-density', '1')
})

test('la captura es un WebP de 1200 px, transparente, con el pastel encuadrado como las fotos', async ({ page }) => {
  const render = await openRender(page, CAJETA_SAMPLE)
  await expect(render).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  const measured = await page.evaluate(async (framing) => {
    const { opaqueBounds } = await import(framing)
    const url = (window as unknown as { __captureModel?: () => string }).__captureModel?.() ?? ''
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    return { type: url.slice(0, url.indexOf(';')), width: bitmap.width, height: bitmap.height, corner: data[3], box: opaqueBounds(data, bitmap.width, bitmap.height) }
  }, FRAMING)
  expect(measured.type).toBe('data:image/webp')
  expect([measured.width, measured.height]).toEqual([1200, 1200])
  expect(measured.corner).toBe(0)
  // 958 px de ancho, centrado, con el borde de abajo en y = 1101 (la compresión puede mover un par de píxeles el borde).
  expect(Math.abs(measured.box.width - 958)).toBeLessThanOrEqual(4)
  expect(Math.abs(measured.box.x - 121)).toBeLessThanOrEqual(4)
  expect(Math.abs(measured.box.y + measured.box.height - 1101)).toBeLessThanOrEqual(4)
})

test('sin muestra del modelo no hay imagen y lo dice', async ({ page }) => {
  const render = await openRender(page, null)
  await expect(render).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('alert')).toHaveText('Este pastel no tiene muestra del modelo.')
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('una decoración que ya no está en "Diseña tu pastel" no se dibuja a medias', async ({ page }) => {
  const render = await openRender(page, { ...CAJETA_SAMPLE, decoration: null })
  await expect(render).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('alert')).toHaveText('La decoración de la muestra ya no está en "Diseña tu pastel".')
})

test('el encuadre acomoda cualquier caja a 958 px de ancho con el borde de abajo en 1101', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(async (framing) => {
    const { opaqueBounds, placeInFrame } = await import(framing)
    // Una imagen de 6 × 4 con dos píxeles opacos: la caja va de (1, 1) a (4, 2).
    const data = new Uint8ClampedArray(6 * 4 * 4)
    data[(1 * 6 + 1) * 4 + 3] = 255
    data[(2 * 6 + 4) * 4 + 3] = 200
    data[(3 * 6 + 5) * 4 + 3] = 4
    return {
      box: opaqueBounds(data, 6, 4),
      empty: opaqueBounds(new Uint8ClampedArray(16), 2, 2),
      wide: placeInFrame({ width: 500, height: 250 }),
      tall: placeInFrame({ width: 100, height: 400 }),
    }
  }, FRAMING)
  expect(result.box).toEqual({ x: 1, y: 1, width: 4, height: 2 })
  expect(result.empty).toBeNull()
  expect(result.wide).toEqual({ x: 121, y: 1101 - 479, width: 958, height: 479 })
  // Uno muy alto no se sale por arriba: se achica hasta dejar 40 px y sigue centrado y apoyado en 1101.
  expect(result.tall.y).toBeCloseTo(40)
  expect(result.tall.y + result.tall.height).toBeCloseTo(1101)
  expect(result.tall.x + result.tall.width / 2).toBeCloseTo(600)
})
