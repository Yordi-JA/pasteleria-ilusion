import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { chocoPinguino, durazno, duraznoShowcase, mockProductDetails, productDetail, PRODUCTS_PATH, redVelvet } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Personalizar este pastel" (regla 2, D59): la ficha abre "Diseña tu pastel" con `?pastel=<slug>` y el diseñador
 * arranca con el tipo, el pan y el relleno del producto, sin pisar un diseño a medias.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

let prices: Awaited<ReturnType<typeof mockCakeDesignPrice>> = []

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  prices = await mockCakeDesignPrice(page)
})

const DRAFT_KEY = 'ilusion.cakeDesign.v1'
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const question = (page: Page) => page.getByRole('region', { name: 'Ya tienes un diseño a medias' })

async function storedDraft(page: Page) {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null') as Record<string, unknown> | null, DRAFT_KEY)
}

/** Un diseño a medias: 60 personas, envinado, confirmado hasta el paso 2. */
const HALF_DONE = { people: 60, form: 'round', tiers: 1, cakeType: 'envinado', bread: null, fillingBase: null, flavorCount: 1, flavors: [], confirmed: [1, 2] }

/** Guarda el borrador una sola vez, antes de abrir la página (recargar no lo vuelve a poner). */
async function seedDraftOnce(page: Page, draft: object) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem('prueba.sembrado')) {
        sessionStorage.setItem(key, value)
        sessionStorage.setItem('prueba.sembrado', '1')
      }
    },
    { key: DRAFT_KEY, value: JSON.stringify(draft) },
  )
}

test('from the product page, an empty designer starts with the product choices and the parameter leaves the URL', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await page.getByRole('link', { name: 'Personalizar este pastel' }).click()

  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
  const notice = page.getByRole('status').filter({ hasText: 'Empezaste con Tres leches de durazno' })
  await expect(notice).toContainText('Ya elegimos el tipo y el relleno; puedes cambiarlo en cada paso.')
  // Elegido, no confirmado: la persona pasa por cada paso en orden (regla 4.1). El pan de la vitrina es PENDIENTE.
  expect(await storedDraft(page)).toMatchObject({ cakeType: 'tres_leches', bread: null, fillingBase: 'normal', flavors: ['durazno'], confirmed: [] })

  await page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(page.getByRole('radio', { name: 'Tres leches' })).toBeChecked()
  // Al seguir de paso el aviso ya no hace falta.
  await expect(notice).toHaveCount(0)

  // Atrás vuelve a la ficha: el parámetro no dejó otra entrada en el historial.
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL('/pasteles/tres-leches-de-durazno')
})

test('a half-done design is not overwritten: "Seguir con mi diseño" keeps it, and reloading does not ask again', async ({ page }) => {
  await seedDraftOnce(page, HALF_DONE)
  await mockProductDetails(page, [durazno])
  // Con el paso ya en la URL, el diseñador no la reescribe: el parámetro se quita igual.
  await page.goto('/pedido/disena?paso=1&pastel=tres-leches-de-durazno')

  await expect(question(page)).toBeFocused()
  await expect(question(page)).toContainText('¿Sigues con tu diseño o empiezas con Tres leches de durazno?')
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
  expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado' })

  await question(page).getByRole('button', { name: 'Seguir con mi diseño' }).click()
  await expect(question(page)).toHaveCount(0)
  await expect(stepTitle(page)).toBeFocused()
  expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado', confirmed: [1, 2] })

  await page.reload()
  await expect(stepTitle(page)).toBeVisible()
  await expect(question(page)).toHaveCount(0)
  expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado' })
})

test('a half-done design: "Empezar con <producto>" replaces it with the product choices from step 1', async ({ page }) => {
  await seedDraftOnce(page, HALF_DONE)
  await mockProductDetails(page, [durazno])
  await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')

  await question(page).getByRole('button', { name: 'Empezar con Tres leches de durazno' }).click()
  await expect(question(page)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Empezaste con Tres leches de durazno' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  expect(await storedDraft(page)).toMatchObject({ people: 40, cakeType: 'tres_leches', fillingBase: 'normal', flavors: ['durazno'], confirmed: [] })

  await page.reload()
  await expect(stepTitle(page)).toBeVisible()
  await expect(question(page)).toHaveCount(0)
})

test('a design that already has the product choices is not asked about nor changed', async ({ page }) => {
  await seedDraftOnce(page, { ...HALF_DONE, cakeType: 'tres_leches', fillingBase: 'normal', flavors: ['durazno'] })
  await mockProductDetails(page, [durazno])
  await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')
  await expect(stepTitle(page)).toBeVisible()
  await expect(question(page)).toHaveCount(0)
  expect(await storedDraft(page)).toMatchObject({ people: 60, confirmed: [1, 2] })
})

test('a choice that is no longer active is ignored without breaking the rest', async ({ page }) => {
  const retired = productDetail('tres-leches-de-fresa', { filling_flavor: 'mango' })
  await mockProductDetails(page, [retired])
  await page.goto('/pedido/disena?pastel=tres-leches-de-fresa')
  const notice = page.getByRole('status').filter({ hasText: 'Empezaste con Tres leches de fresa' })
  // La base sigue y el sabor no: el aviso dice exactamente eso (no "ya elegimos el relleno").
  await expect(notice).toContainText('Ya elegimos el tipo y la base del relleno; puedes cambiarlo en cada paso.')
  await expect(notice).toContainText('El sabor de Tres leches de fresa ya no está disponible: elígelo en su paso.')
  expect(await storedDraft(page)).toMatchObject({ cakeType: 'tres_leches', fillingBase: 'normal', flavors: [] })
})

test('a bread with its own filling (Red velvet) is chosen with its cake type and no separate filling', async ({ page }) => {
  await mockProductDetails(page, [redVelvet])
  await page.goto('/pedido/disena?pastel=red-velvet')
  await expect(page.getByRole('status').filter({ hasText: 'Empezaste con Red velvet' })).toContainText('Ya elegimos el tipo y el pan')
  expect(await storedDraft(page)).toMatchObject({ cakeType: 'seco', bread: 'red_velvet', fillingBase: null, flavors: [] })
})

test('a product that no longer exists does not block the designer', async ({ page }) => {
  await mockProductDetails(page, [])
  await page.goto('/pedido/disena?pastel=ya-no-existe')
  await expect(page.getByRole('status').filter({ hasText: 'Ese pastel ya no está en el catálogo' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page).toHaveURL(/\?paso=1$/)
  expect(await storedDraft(page)).toMatchObject({ cakeType: null, flavors: [] })
})

test('a failed product load shows the notice and the retry prefills', async ({ page }) => {
  let fail = true
  await page.route(
    (url) => url.pathname === `${PRODUCTS_PATH}tres-leches-de-durazno/`,
    async (route) => {
      if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
      // El reintento tarda: mientras tanto el aviso dice que busca y el paso sigue a la vista.
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(durazno) }).catch(() => undefined)
    },
  )
  await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')
  const failed = page.getByRole('status').filter({ hasText: 'No pudimos traer el pastel que elegiste' })
  await expect(failed).toBeVisible()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  fail = false
  // Desde aquí, el esqueleto no debe volver ni un cuadro: se vigila con un observador.
  await page.evaluate(() => {
    const flag = window as unknown as { __skeletonSeen: boolean }
    flag.__skeletonSeen = false
    new MutationObserver(() => {
      if (document.querySelector('[aria-busy="true"] [data-esqueleto]')) flag.__skeletonSeen = true
    }).observe(document.body, { childList: true, subtree: true, attributes: true })
  })
  await failed.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByText('Buscando el pastel…')).toBeVisible()
  await expect(stepTitle(page)).toBeVisible()
  // El foco no cae a <body> cuando el botón desaparece: pasa al contenedor del aviso.
  await expect(page.getByRole('group', { name: 'Aviso de tu pastel' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Empezaste con Tres leches de durazno' })).toBeVisible()
  // Ya prellenado: el foco sigue en el aviso y el esqueleto nunca volvió.
  await expect(page.getByRole('group', { name: 'Aviso de tu pastel' })).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { __skeletonSeen: boolean }).__skeletonSeen)).toBe(false)
  expect(await storedDraft(page)).toMatchObject({ cakeType: 'tres_leches', fillingBase: 'normal', flavors: ['durazno'] })
})

test('a dessert slug is ignored with its notice', async ({ page }) => {
  await mockProductDetails(page, [productDetail('imposible')])
  await page.goto('/pedido/disena?pastel=imposible')
  await expect(page.getByRole('status').filter({ hasText: 'Ese pastel ya no está en el catálogo' })).toBeVisible()
  await expect(page).toHaveURL(/\?paso=1$/)
  expect(await storedDraft(page)).toMatchObject({ cakeType: null, bread: null, fillingBase: null, flavors: [] })
})

test('without an active cake type, bread and filling are left for their steps (rule 4.1)', async ({ page }) => {
  const retiredType = { ...productDetail('choco-pinguino'), cake_type: 'mil_hojas' }
  await mockProductDetails(page, [retiredType])
  await page.goto('/pedido/disena?pastel=choco-pinguino')
  const notice = page.getByRole('status').filter({ hasText: 'No pudimos empezar con Choco-pingüino' })
  await expect(notice).toContainText('El tipo de pastel de Choco-pingüino ya no está disponible: empieza por elegirlo en su paso.')
  expect(await storedDraft(page)).toMatchObject({ cakeType: null, bread: null, fillingBase: null, flavors: [] })
})

test('the half-done question takes focus only the first time it shows', async ({ page }) => {
  await seedDraftOnce(page, { ...HALF_DONE, confirmed: [1] })
  await mockProductDetails(page, [durazno])
  await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')
  await expect(question(page)).toBeFocused()
  // Sigue sin responder: va al paso 2 y regresa al 1.
  await page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await page.goBack()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(question(page)).toBeVisible()
  await expect(question(page)).not.toBeFocused()
})

// --- Pastel de vitrina desde su ficha (tanda 2) ---

const stepBar = (page: Page) => page.getByRole('navigation', { name: 'Pasos de Diseña tu pastel' })

test('a showcase cake from its product page starts at the coverage with its type, bread and filling locked', async ({ page }) => {
  await mockProductDetails(page, [duraznoShowcase])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await page.getByRole('link', { name: 'Personalizar este pastel' }).click()

  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=5$/)
  expect(await storedDraft(page)).toMatchObject({
    cakeSize: 'showcase', source: { slug: 'tres-leches-de-durazno', name: 'Tres leches de durazno', servings: 19 },
    cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'normal', flavors: ['durazno'],
  })
  // El precio es el del producto: con su tamaño y su `slug`, sin personas.
  await expect(page.getByTestId('total-estimado').first()).toHaveText('$350 MXN')
  expect(prices.at(-1)).toMatchObject({ cake_size: 'showcase', source_product: 'tres-leches-de-durazno', cake_type: 'tres_leches', bread: 'chocolate', filling_base: 'normal', filling_flavors: ['durazno'] })
  expect(prices.at(-1)).not.toHaveProperty('people')

  // Tipo, pan y relleno se ven hechos con candado; su mensaje flotante dice de dónde vienen y cómo cambiarlos.
  for (const short of ['Tipo', 'Pan', 'Relleno']) {
    await expect(stepBar(page).getByRole('link', { name: new RegExp(`^${short}`) })).toHaveCount(0)
  }
  const lock = stepBar(page).getByRole('button', { name: 'Pan del pastel elegido' })
  await lock.focus()
  const tip = page.getByRole('tooltip').filter({ visible: true })
  await expect(tip).toHaveText('El pan viene de Tres leches de durazno. Para cambiarlo, arma tu pastel desde el principio en Diseña tu pastel.')
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  // "Tu pastel" los lista sin "Cambiar".
  const summary = page.getByRole('region', { name: 'Tu pastel' })
  await expect(summary).toContainText('Pastel de vitrina, ~19 personas')
  await expect(summary.getByRole('link', { name: 'Cambiar pan' })).toHaveCount(0)
  await expect(summary.getByRole('link', { name: 'Cambiar cobertura' })).toHaveCount(0)

  // El paso 1 muestra el pastel de vitrina fijo, sin personas, y la salida para armarlo desde el principio.
  await stepBar(page).getByRole('link', { name: /^Tamaño/ }).click()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page.getByTestId('tarjeta-paso').getByRole('radio', { name: /Pastel de vitrina/ })).toBeChecked()
  await expect(page.getByLabel('¿Para cuántas personas?')).toHaveCount(0)
  await page.getByRole('button', { name: 'Arma tu pastel desde el principio' }).click()
  expect(await storedDraft(page)).toMatchObject({ cakeSize: null, source: null, cakeType: null, confirmed: [] })
})

test('Choco-pingüino as a showcase cake keeps its included filling locked too', async ({ page }) => {
  await mockProductDetails(page, [chocoPinguino])
  await page.goto('/pedido/disena?pastel=choco-pinguino&tamano=vitrina')
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  expect(await storedDraft(page)).toMatchObject({ cakeSize: 'showcase', cakeType: 'seco', bread: 'choco_pinguino', fillingBase: null })
  await expect(page.getByTestId('total-estimado').first()).toHaveText('$350 MXN')
})

test('a product that cannot be a showcase cake keeps the D59 behavior even with "tamano=vitrina"', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pedido/disena?pastel=tres-leches-de-durazno&tamano=vitrina')
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
  expect(await storedDraft(page)).toMatchObject({ cakeSize: null, source: null, cakeType: 'tres_leches', fillingBase: 'normal', flavors: ['durazno'], confirmed: [] })
})
