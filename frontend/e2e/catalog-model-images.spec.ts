import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { featuredProducts, mockCatalog, ok, sliceItems, stockItem, todayStock } from './support/catalog.ts'
import { cupCards, durazno, mockProductDetails, mockProducts, productCards, tartaCard } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Las imágenes fijas del modelo (D86): la tarjeta del catálogo, los pasteles de la casa y la vitrina de la portada muestran la
 * imagen del modelo cuando la API la da (`model_image`); si no, la foto; sin ninguna, el hueco. Su texto alternativo dice que es
 * la ilustración del pastel, no una foto. La ficha, la página de la vitrina y las rebanadas conservan la foto real. Los postres con
 * modelo (D95) siguen la misma regla con la imagen de su `slug` (al final).
 */

// Archivos que existen en `public/fotos/`: una imagen que no carga cae al hueco, y la prueba no debe depender de eso.
const MODEL = 'tres-leches-de-durazno-modelo.webp'
const PHOTO = 'tres-leches-de-durazno.webp'
const OTHER_PHOTO = 'tres-leches-de-fresa.webp'
const RELATED_MODEL = 'tres-leches-con-queso-y-chocolate-modelo.webp'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

/** Las tarjetas de la semilla con su foto y su imagen del modelo; el tipo de `productCards` fija `photo` en `null`. */
type Cards = typeof productCards
const withImages = (cards: object[]) => cards as Cards

/** La imagen real de una tarjeta, con su dirección y su texto alternativo. */
async function expectImage(image: Locator, src: string) {
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', `/fotos/${src}`)
}

function card(page: Page, name: string) {
  return page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
}

test('la tarjeta del catálogo elige la imagen del modelo, luego la foto y, sin ninguna, el hueco', async ({ page }) => {
  const [first, second, third, ...rest] = productCards
  await mockProducts(page, {
    cards: withImages([
      { ...first, photo: PHOTO, model_image: MODEL },
      { ...second, photo: 'tres-leches-de-fresa.webp', model_image: null },
      { ...third, photo: null, model_image: null },
      ...rest,
    ]),
  })
  await page.goto('/catalogo')

  const withModel = card(page, 'Tres leches de durazno')
  await expectImage(withModel.getByRole('img', { name: 'Tres leches de durazno, ilustración del pastel', exact: true }), MODEL)

  const withPhoto = card(page, 'Tres leches de fresa')
  await expectImage(withPhoto.getByRole('img', { name: 'Tres leches de fresa', exact: true }), 'tres-leches-de-fresa.webp')

  const pending = card(page, 'Tres leches con queso y zarzamora')
  await expect(pending.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
  await expect(pending.locator('img')).toHaveCount(0)
})

test('una imagen del modelo que no carga cae al hueco, nunca a un ícono roto', async ({ page }) => {
  const [first, ...rest] = productCards
  await mockProducts(page, { cards: withImages([{ ...first, photo: PHOTO, model_image: 'no-existe-modelo.webp' }, ...rest]) })
  await page.goto('/catalogo')
  await expect(card(page, 'Tres leches de durazno').getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
})

test('la portada usa la imagen del modelo en los pasteles de la casa y en la vitrina, y la foto en las rebanadas', async ({ page }) => {
  const [first, ...featured] = featuredProducts
  const slice = { ...sliceItems[0], photo: OTHER_PHOTO }
  await mockCatalog(page, {
    featured: [ok([{ ...first, photo: PHOTO, model_image: MODEL }, ...featured.map((entry) => ({ ...entry, model_image: null }))])],
    showcase: [
      todayStock([
        { ...stockItem(1, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'whole', '350.00', { photo: PHOTO, sliced: false }), model_image: MODEL },
        { ...stockItem(3, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'mini', '130.00', { photo: OTHER_PHOTO, sliced: false }), model_image: null },
      ]),
    ],
    slices: [todayStock([slice])],
  })
  await page.goto('/')

  const featuredSection = page.getByRole('region', { name: 'Pasteles de la casa', exact: true })
  await expectImage(featuredSection.getByRole('img', { name: 'Tres leches de durazno, ilustración del pastel', exact: true }), MODEL)

  const showcase = page.getByRole('region', { name: 'Vitrina', exact: true })
  await expectImage(showcase.getByRole('img', { name: 'Tres leches de durazno, ilustración del pastel', exact: true }), MODEL)
  await expectImage(showcase.getByRole('img', { name: 'Mini de tres leches de durazno', exact: true }), OTHER_PHOTO)

  const slices = page.getByRole('region', { name: 'Rebanadas de hoy', exact: true })
  await expectImage(slices.getByRole('img', { name: 'Rebanada de tres leches de durazno', exact: true }), OTHER_PHOTO)
  await expect(page.getByRole('img', { name: /ilustración del pastel/ })).toHaveCount(2)
})

test('la página de la vitrina conserva la foto aunque la API dé la imagen del modelo', async ({ page }) => {
  await mockCatalog(page, {
    showcase: [
      todayStock([
        { ...stockItem(1, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'whole', '350.00', { photo: PHOTO, sliced: false }), model_image: MODEL },
      ]),
    ],
  })
  await page.goto('/vitrina')
  await expectImage(page.getByRole('img', { name: 'Tres leches de durazno', exact: true }), PHOTO)
  await expect(page.getByRole('img', { name: /ilustración del pastel/ })).toHaveCount(0)
})

test('la ficha conserva la foto real; sus relacionados usan la imagen del modelo', async ({ page }) => {
  const related = durazno.related.map((entry, i) => (i === 0 ? { ...entry, photo: OTHER_PHOTO, model_image: RELATED_MODEL } : { ...entry, model_image: null }))
  await mockProductDetails(page, [
    {
      ...durazno,
      photo: PHOTO,
      model_image: MODEL,
      offerings: durazno.offerings.map((entry) => ({ ...entry, photo: PHOTO })),
      related,
      sample_design: {
        coverage_color: '#E2B21C',
        decoration: 'ninguna',
        decoration_color: null,
        fruit_layout: 'mound',
        fruits: ['strawberry', 'kiwi'],
        side_comb: false,
        model_image: MODEL,
        show_model_in_catalog: true,
      },
    },
  ])
  await page.goto('/pasteles/tres-leches-de-durazno')

  await expectImage(page.getByRole('img', { name: 'Tres leches de durazno', exact: true }), PHOTO)
  await expect(page.locator(`img[src="/fotos/${MODEL}"]`)).toHaveCount(0)
  const relatedCard = card(page, 'Tres leches con queso y zarzamora')
  await expectImage(relatedCard.getByRole('img', { name: 'Tres leches con queso y zarzamora, ilustración del pastel', exact: true }), RELATED_MODEL)
})

/** La caja de la foto de una tarjeta grande: la imagen del modelo, el contenedor de la foto agrandada o el hueco. */
async function photoBoxes(page: Page) {
  const model = card(page, 'Tres leches de durazno').getByRole('img', { name: 'Tres leches de durazno, ilustración del pastel', exact: true })
  const photo = card(page, 'Tres leches de fresa').getByRole('img', { name: 'Tres leches de fresa', exact: true })
  const pending = card(page, 'Tres leches con queso y zarzamora').getByRole('img', { name: 'Foto del pastel pendiente' })
  await expect(model).toBeVisible()
  await expect(photo).toBeVisible()
  await expect(pending).toBeVisible()
  await expect.poll(() => model.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  return {
    model: (await model.boundingBox())!,
    photoBox: (await photo.locator('..').boundingBox())!,
    photo: (await photo.boundingBox())!,
    pending: (await pending.boundingBox())!,
    article: (await card(page, 'Tres leches de durazno').boundingBox())!,
  }
}

async function openMixedRow(page: Page) {
  const [first, second, third, ...rest] = productCards
  await mockProducts(page, {
    cards: withImages([
      { ...first, photo: PHOTO, model_image: MODEL },
      { ...second, photo: OTHER_PHOTO, model_image: null },
      { ...third, photo: null, model_image: null },
      ...rest,
    ]),
  })
  await page.goto('/catalogo')
}

test.describe('la fila de pasteles (tanda 6)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('la imagen del modelo, la foto y el hueco van en la misma caja, que sobresale 96 px de la tarjeta', async ({ page }) => {
    await openMixedRow(page)
    const { model, photoBox, photo, pending, article } = await photoBoxes(page)
    for (const box of [model, photoBox, pending]) {
      expect(Math.abs(box.y - (article.y - 96))).toBeLessThanOrEqual(1)
      expect(Math.abs(box.width - model.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(box.height - model.height)).toBeLessThanOrEqual(1)
    }
    // La caja tiene la proporción de la imagen del modelo (1200 × 1000) y ocupa el ancho de la tarjeta (menos su borde y sus 24 px
    // de relleno), hasta 320 px.
    expect(Math.abs(model.width - Math.min(320, article.width - 2 - 48))).toBeLessThanOrEqual(1)
    expect(Math.abs(model.width / model.height - 1.2)).toBeLessThan(0.01)
    // La foto se agranda hasta que su pastel (958 de 1200 px) mide como el del modelo (1140 de 1200) y su base (y = 1101) cae en
    // el borde de abajo de la caja, donde está la charola del modelo.
    expect(Math.abs(photo.width * (958 / 1200) - model.width * (1140 / 1200))).toBeLessThanOrEqual(1)
    expect(Math.abs(photo.y + photo.height * (1101 / 1200) - (photoBox.y + photoBox.height))).toBeLessThanOrEqual(1)
  })

  test('en móvil la caja baja a 288 px y nada se sale de la pantalla', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openMixedRow(page)
    const { model, photoBox, pending } = await photoBoxes(page)
    for (const box of [model, photoBox, pending]) expect(Math.abs(box.width - 288)).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

/**
 * Los postres con modelo (D95): la API no da su imagen (`model_image` es solo de los pasteles), así que la tarjeta la toma por su
 * `slug` de `dessertSamples.ts`, con el archivo que guarda `npm run render:modelos`. Un postre sin modelo conserva su foto o su hueco.
 */
test.describe('los postres con modelo (D95)', () => {
  const DESSERT_MODELS = [
    ['imposible', 'Imposible'],
    ['flan-napolitano', 'Flan napolitano'],
    ['mosaico-con-crema', 'Mosaico con crema'],
    ['tarta-de-frutas', 'Tarta de frutas'],
    ['gelatina-mosaico', 'Mosaico normal'],
    ['mosaico-con-yogurt-de-durazno', 'Mosaico con yogurt de durazno'],
    ['mosaico-con-yogurt-de-fresa', 'Mosaico con yogurt de fresa'],
    ['gelatina-de-duvalin', 'Gelatina de Duvalín'],
  ] as const
  const IMPOSIBLE_PHOTO = 'imposible.webp'

  /** La imagen ya cargó, con las medidas de la imagen del modelo (`MODEL_FRAME`, 1200 × 1000): el archivo existe. */
  async function expectModelFile(image: Locator) {
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(() => image.evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight]))
      .toEqual([1200, 1000])
  }

  test('the catalog shows each dessert model as an illustration, before its photo; a dessert without a model keeps its slot', async ({ page }) => {
    const posible = { ...productCards.find((entry) => entry.slug === 'imposible')!, slug: 'posible', name: 'Posible', summary: 'Flan con pan de vainilla.' }
    await mockProducts(page, {
      cards: withImages([
        ...productCards.map((entry) => (entry.slug === 'imposible' ? { ...entry, photo: IMPOSIBLE_PHOTO } : entry)),
        tartaCard,
        ...cupCards,
        posible,
      ]),
    })
    await page.goto('/catalogo')

    for (const [slug, name] of DESSERT_MODELS) {
      const image = card(page, name).getByRole('img', { name: `${name}, ilustración del postre`, exact: true })
      await expectImage(image, `${slug}-modelo.webp`)
      await expectModelFile(image)
    }
    // La imagen del modelo va antes que la foto real, como en los pasteles: la foto del Imposible no sale en su tarjeta.
    await expect(page.locator(`img[src="/fotos/${IMPOSIBLE_PHOTO}"]`)).toHaveCount(0)
    await expect(page.getByRole('img', { name: /ilustración del postre/ })).toHaveCount(DESSERT_MODELS.length)

    const withoutModel = card(page, 'Posible')
    await expect(withoutModel.getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expect(withoutModel.locator('img')).toHaveCount(0)
  })

  test('the home page uses the dessert model in the featured cards and in its showcase', async ({ page }) => {
    const [first, second, imposible, ...rest] = featuredProducts
    await mockCatalog(page, {
      featured: [ok([{ ...imposible, photo: IMPOSIBLE_PHOTO }, first, second, ...rest])],
      showcase: [
        todayStock([
          stockItem(50, 'flan-napolitano', 'Flan napolitano', 'dessert', 'whole', '360.00', { stock: 2 }),
          stockItem(70, 'gelatina-de-molde', 'Gelatina de molde', 'dessert', 'whole', '290.00', { stock: 5 }),
        ]),
      ],
    })
    await page.goto('/')

    // El primero va en la tarjeta grande, con la caja de la imagen del modelo.
    const featuredSection = page.getByRole('region', { name: 'Pasteles de la casa', exact: true })
    const large = featuredSection.getByRole('img', { name: 'Imposible, ilustración del postre', exact: true })
    await expectImage(large, 'imposible-modelo.webp')
    await expectModelFile(large)
    const box = (await large.boundingBox())!
    expect(Math.abs(box.width / box.height - 1.2)).toBeLessThan(0.01)

    const showcase = page.getByRole('region', { name: 'Vitrina', exact: true })
    await expectImage(showcase.getByRole('img', { name: 'Flan napolitano, ilustración del postre', exact: true }), 'flan-napolitano-modelo.webp')
    await expect(showcase.getByRole('img', { name: 'Foto del postre pendiente' })).toHaveCount(1)
  })

  test('the showcase page keeps the dessert photo or its slot', async ({ page }) => {
    await mockCatalog(page, {
      showcase: [todayStock([stockItem(50, 'flan-napolitano', 'Flan napolitano', 'dessert', 'whole', '360.00', { stock: 2 })])],
    })
    await page.goto('/vitrina')
    await expect(page.getByRole('img', { name: 'Foto del postre pendiente' })).toBeVisible()
    await expect(page.getByRole('img', { name: /ilustración/ })).toHaveCount(0)
  })
})

test.describe('la foto agrandada no desborda la página (WCAG 1.4.10)', () => {
  for (const width of [320, 720]) {
    test(`a ${width} px no hay desplazamiento horizontal y la foto sigue sobresaliendo de la tarjeta`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const [first, ...rest] = productCards
      await mockProducts(page, { cards: withImages([{ ...first, photo: OTHER_PHOTO, model_image: null }, ...rest]) })
      await page.goto('/catalogo')
      const article = card(page, 'Tres leches de durazno')
      const photo = article.getByRole('img', { name: 'Tres leches de durazno', exact: true })
      await expect(photo).toBeVisible()
      await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      // Solo se recorta a los lados: la caja de la foto sigue subiendo por encima de la tarjeta.
      const box = (await photo.locator('..').boundingBox())!
      const outer = (await article.boundingBox())!
      expect(box.y).toBeLessThan(outer.y)
    })
  }
})
