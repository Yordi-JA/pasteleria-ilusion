import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { featuredProducts, mockCatalog, ok, sliceItems, stockItem, todayStock } from './support/catalog.ts'
import { durazno, mockProductDetails, mockProducts, productCards } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Las imágenes fijas del modelo (D86): la tarjeta del catálogo, los pasteles de la casa y la vitrina de la portada muestran la
 * imagen del modelo cuando la API la da (`model_image`); si no, la foto; sin ninguna, el hueco. Su texto alternativo dice que es
 * la ilustración del pastel, no una foto. La ficha, la página de la vitrina y las rebanadas conservan la foto real.
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
