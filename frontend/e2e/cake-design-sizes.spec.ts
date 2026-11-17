import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice, withSize } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Los tamaños de "Diseña tu pastel" (tanda 2 de correcciones): el pastel mini y el de vitrina se piden desde el paso 1 según
 * las personas, con sus límites (el mini no lleva panes de relleno incluido, queso, flan, algunas decoraciones ni oblea), la
 * letra mínima del mensaje y su vista previa con el molde real. La API se simula (`support/cake-design.ts`) con los tamaños
 * de `GET cake-designs/options/` y el precio de vitrina y mini del backend. Escritorio (1440 px) salvo donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const DRAFT_KEY = 'ilusion.cakeDesign.v1'
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const card = (page: Page) => page.getByTestId('tarjeta-paso')
const total = (page: Page) => page.getByTestId('total-estimado').first()
const people = (page: Page) => page.getByLabel('¿Para cuántas personas?')
const sizes = (page: Page) => card(page).getByRole('group', { name: 'Tamaño' })
const proceed = (page: Page, name = 'Continuar') => card(page).getByRole('button', { name, exact: true }).click()
const draftOf = (page: Page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>, DRAFT_KEY)

async function open(page: Page, search = '', options: typeof cakeDesignOptions = cakeDesignOptions) {
  await mockCakeDesignOptions(page, { status: 200, body: options })
  const prices = await mockCakeDesignPrice(page, options)
  await page.goto(`/pedido/disena${search}`)
  await expect(stepTitle(page)).toBeVisible()
  return prices
}

async function seedDraft(page: Page, draft: object) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value)
    },
    { key: DRAFT_KEY, value: JSON.stringify(draft) },
  )
}

/** Escribe las personas y espera el precio que corresponde a lo que se ve. */
async function setPeople(page: Page, count: number) {
  await people(page).fill(String(count))
  await expect(total(page)).toHaveAttribute('data-state', /ready|failed|idle/)
}

// --- Paso 1: el tamaño que rinde ---

test('step 1 shows only the size that serves the people: mini, showcase, both, or by weight', async ({ page }) => {
  await open(page)

  await setPeople(page, 3)
  await expect(sizes(page).getByRole('radio')).toHaveCount(1)
  const mini = sizes(page).getByRole('radio', { name: /Pastel mini/ })
  await expect(mini).toBeChecked()
  await expect(sizes(page)).toContainText('~3 personas')
  await expect(sizes(page)).toContainText('Desde $130')
  // Sin forma ni pisos ni kilos: el mini es redondo, de 1 piso.
  await expect(card(page).getByRole('group', { name: 'Forma' })).toHaveCount(0)
  await expect(card(page).getByRole('group', { name: 'Pisos' })).toHaveCount(0)
  await expect(page.getByTestId('kilos')).toHaveCount(0)

  await setPeople(page, 12)
  await expect(sizes(page).getByRole('radio')).toHaveCount(1)
  await expect(sizes(page).getByRole('radio', { name: /Pastel de vitrina/ })).toBeChecked()
  await expect(sizes(page)).toContainText('~19 personas')
  await expect(sizes(page)).toContainText('Desde $350')

  await setPeople(page, 24)
  await expect(sizes(page).getByRole('radio')).toHaveCount(2)
  await expect(sizes(page).getByRole('radio', { name: /Pastel de vitrina/ })).not.toBeChecked()
  const byWeight = sizes(page).getByRole('radio', { name: /Hacerlo de 4 kg/ })
  await expect(byWeight).not.toBeChecked()
  await expect(sizes(page)).toContainText('28 personas')
  await expect(sizes(page)).toContainText('Desde $720')
  // Sin elegir, no sigue y dice qué falta.
  await proceed(page)
  await expect(card(page).getByText('Elige el tamaño.')).toBeVisible()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')

  await setPeople(page, 28)
  await expect(sizes(page)).toHaveCount(0)
  await expect(page.getByTestId('kilos')).toHaveText('Aprox. 4 kg para 28 personas')
  await expect(card(page).getByRole('group', { name: 'Forma' })).toBeVisible()
  await expect(card(page).getByRole('group', { name: 'Pisos' })).toBeVisible()
})

test('a mini or showcase cake asks the price with its size and without people', async ({ page }) => {
  const prices = await open(page)
  await setPeople(page, 12)
  await expect(total(page)).toHaveText('Desde $350 MXN')
  const last = prices.at(-1) as Record<string, unknown>
  expect(last).toMatchObject({ cake_size: 'showcase', cake_type: 'tres_leches', bread: 'vainilla', filling_base: 'normal', estimate: true })
  expect(last).not.toHaveProperty('people')
  await expect(page.getByText('Pastel de vitrina, ~19 personas').first()).toBeVisible()

  await setPeople(page, 2)
  await expect(total(page)).toHaveText('Desde $130 MXN')
  expect(prices.at(-1)).toMatchObject({ cake_size: 'mini' })
})

test('between the showcase and the minimum, "Hacerlo de 4 kg" shows form and tiers and continues with 28 people', async ({ page }) => {
  await open(page)
  await setPeople(page, 24)
  await sizes(page).getByText('Hacerlo de 4 kg').click()
  await expect(card(page).getByRole('group', { name: 'Forma' })).toBeVisible()
  await expect(card(page).getByRole('group', { name: 'Pisos' })).toBeVisible()
  await expect(total(page)).toHaveText('Desde $720 MXN')
  await proceed(page, 'Continuar con 4 kg, unas 28 personas')
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  expect(await draftOf(page)).toMatchObject({ people: 28 })
})

test('a showcase cake of tres leches, chocolate bread and peach costs $363.50', async ({ page }) => {
  await open(page)
  await setPeople(page, 12)
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await card(page).getByRole('radio', { name: 'Tres leches' }).check()
  await proceed(page)
  await card(page).getByRole('radio', { name: 'Chocolate', exact: true }).check()
  // El precio por kilo no aplica en un pastel de vitrina: los panes no lo dicen.
  await expect(card(page)).not.toContainText('por kg')
  await proceed(page)
  await card(page).getByRole('radio', { name: 'Normal' }).check()
  await card(page).getByRole('radio', { name: 'Durazno' }).check()
  await expect(total(page)).toHaveText('$363.50 MXN')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
})

// --- El mini y sus límites ---

const MINI_TO_STEP_3 = { people: 3, cakeSize: 'mini', cakeType: 'tres_leches', confirmed: [1, 2] }

test('the mini disables the breads, bases and decorations it does not take, with their reason, and the wafer', async ({ page }) => {
  await seedDraft(page, MINI_TO_STEP_3)
  await open(page, '?paso=3')
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(card(page).getByRole('radio', { name: 'Choco-pingüino' })).toBeDisabled()
  await expect(card(page)).toContainText('Choco-pingüino no va en el pastel mini: ya trae su relleno.')
  await expect(card(page).getByRole('radio', { name: 'Red velvet' })).toBeDisabled()
  await card(page).getByRole('radio', { name: 'Vainilla', exact: true }).check()
  await proceed(page)

  await expect(stepTitle(page)).toHaveText('4. Relleno')
  await expect(card(page).getByRole('radio', { name: 'Con queso' })).toBeDisabled()
  await expect(card(page)).toContainText('No hay pastel mini con queso.')
  await expect(card(page).getByRole('radio', { name: 'Con flan' })).toBeDisabled()
  await card(page).getByRole('radio', { name: 'Normal' }).check()
  await card(page).getByRole('radio', { name: 'Durazno' }).check()
  await expect(total(page)).toHaveText('$130 MXN')
  await proceed(page)
  await proceed(page)

  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await expect(card(page).getByRole('radio', { name: 'Rosas' })).toBeDisabled()
  await expect(card(page).getByRole('radio', { name: 'Otra decoración' })).toBeDisabled()
  await expect(card(page)).toContainText('Otra decoración no va en el pastel mini.')
  await card(page).getByRole('radio', { name: 'Patrón con duya' }).check()
  const piping = card(page).getByRole('group', { name: 'Patrón con duya' })
  await expect(piping.getByRole('radio', { name: 'Borde de conchas' })).toBeChecked()
  await expect(piping.getByRole('radio', { name: 'Rosetones' })).toBeDisabled()
  await expect(piping.getByRole('radio', { name: 'Olanes' })).toBeDisabled()
  await proceed(page)

  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(card(page).getByLabel('Agregar una oblea con tu imagen')).toBeDisabled()
  await expect(card(page)).toContainText('El pastel mini no lleva oblea.')
  // El mensaje sí va, con todo su editor.
  await card(page).getByLabel('Agregar un mensaje').check()
  await card(page).getByLabel('Tu mensaje').fill('Ana')
  await expect(card(page).getByLabel('Tamaño', { exact: true })).toBeVisible()
})

test('switching to the mini marks what it does not take as "Hay que cambiarlo" and continues to change it', async ({ page }) => {
  await seedDraft(page, {
    people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'queso', flavorCount: 1, flavors: ['zarzamora'],
    coverageColor: COVERAGE_HEX.lila, decoration: 'rosetones', confirmed: [1, 2, 3, 4, 5, 6],
  })
  await open(page, '?paso=1')
  await setPeople(page, 3)
  const notice = card(page).getByRole('status').filter({ hasText: 'El pastel mini no lleva todo lo que elegiste' })
  await expect(notice).toContainText('No hay pastel mini con queso.')
  await expect(notice).toContainText('Rosetones no va en el pastel mini.')
  await expect(page.getByText('Hay que cambiarlo', { exact: true }).filter({ visible: true })).toHaveCount(2)
  // Nada se borró todavía.
  expect(await draftOf(page)).toMatchObject({ fillingBase: 'queso', decoration: 'rosetones' })

  await proceed(page, 'Continuar y cambiarlo')
  await expect(stepTitle(page)).toHaveText('4. Relleno')
  expect(await draftOf(page)).toMatchObject({ cakeSize: 'mini', fillingBase: null, decoration: null })
})

// --- La letra mínima del mensaje ---

const MINI_TO_STEP_7 = {
  people: 3, cakeSize: 'mini', form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal', flavorCount: 1,
  flavors: ['durazno'], coverageColor: COVERAGE_HEX.rosa, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6],
}

test('the message letter never goes below 1.5 cm, and a message that does not fit at that size says so', async ({ page }) => {
  await seedDraft(page, MINI_TO_STEP_7)
  await open(page, '?paso=7')
  await card(page).getByLabel('Agregar un mensaje').check()
  await card(page).getByLabel('Tu mensaje').fill('Ana')
  await card(page).locator('label').filter({ hasText: /^Mensaje$/ }).click()
  const size = card(page).getByLabel('Tamaño', { exact: true })
  // En el mini, la parte plana de la tapa mide 6.12 cm de radio: 1.5 cm de letra son 0.245 del radio.
  expect(Number(await size.getAttribute('min'))).toBeCloseTo(1.5 / 6.12, 3)
  await size.press('Home')
  expect(Number(await size.inputValue())).toBeGreaterThanOrEqual(1.5 / 6.12 - 1e-6)

  await card(page).getByLabel('Tu mensaje').fill('Feliz cumpleaños querida abuelita Ana')
  await expect(card(page).getByText('Tu mensaje no cabe en este pastel')).toBeVisible()
  await proceed(page)
  await expect(card(page).getByText('Acorta tu mensaje: con letra de al menos 1.5 cm no cabe en el pastel.')).toBeVisible()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
})

// --- La vista previa con el molde real ---

test('the preview draws the mini and the showcase cake with their real mold, round and of one tier', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(
    async ({ options, urls }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const { lidFor } = await import(urls.lid)
      const { estimatedMetrics } = await import(urls.geometry)
      const parsed = parseCakeDesignOptions(options)
      const shapeFor = (people: number, form: string, tiers: number) => {
        const draft = { ...emptyDraft(), people, form, tiers, cakeType: 'tres_leches', bread: 'vainilla' }
        const design = deriveDesign(draft, parsed, null)
        const shape = designPreview({ draft, design, options: parsed, current: 1, defaultBread: null, metrics: estimatedMetrics(''), waferImage: null })
        return { tiers: shape.tiers.map((tier: { radius: number; height: number }) => ({ radius: tier.radius, height: tier.height })), form: shape.form, lid: lidFor(draft, design, parsed).radius }
      }
      // Un borrador rectangular de 3 pisos que baja a 3 personas: el mini sigue siendo redondo y de 1 piso.
      return { mini: shapeFor(3, 'rectangular', 3), showcase: shapeFor(12, 'round', 1) }
    },
    {
      options: cakeDesignOptions,
      urls: {
        models: '/src/models/cakeDesign.ts',
        draft: '/src/models/cakeDesignDraft.ts',
        steps: '/src/viewmodels/cakeDesignSteps.ts',
        preview: '/src/viewmodels/cakeDesignPreview.ts',
        lid: '/src/viewmodels/cakeLid.ts',
        geometry: '/src/viewmodels/messageGeometry.ts',
      },
    },
  )
  const UNITS_PER_CM = 0.068
  expect(result.mini.form).toBe('round')
  expect(result.mini.tiers).toHaveLength(1)
  expect(result.mini.tiers[0].radius).toBeCloseTo(7 * UNITS_PER_CM, 4)
  expect(result.mini.tiers[0].height).toBeCloseTo(4.5 * UNITS_PER_CM, 4)
  expect(result.mini.lid).toBeCloseTo(6.12, 2)
  expect(result.showcase.tiers[0].radius).toBeCloseTo(14 * UNITS_PER_CM, 4)
  expect(result.showcase.tiers[0].height).toBeCloseTo(6.7 * UNITS_PER_CM, 4)
  expect(result.showcase.lid).toBeCloseTo(13.12, 2)
})

// --- Móvil ---

test('on a phone the size cards fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await setPeople(page, 24)
  await expect(sizes(page).getByRole('radio')).toHaveCount(2)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

// --- Revisión y carrito ---

test('the review and the cart name a mini by its size, without kilos, base or deposit', async ({ page }) => {
  await seedDraft(page, { ...MINI_TO_STEP_7, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await open(page, '?paso=8')
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  const review = card(page)
  await expect(review).toContainText('Pastel mini, ~3 personas')
  await expect(review).not.toContainText('kg')
  await expect(review).not.toContainText('Base para')
  await expect(review).not.toContainText('Depósito')
  await expect(review).toContainText('$130')
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByRole('status').filter({ hasText: 'Agregado al pedido' }).first()).toBeVisible()

  await page.goto('/carrito')
  const line = page.getByRole('region', { name: 'Productos' }).getByRole('listitem').first()
  await expect(line).toContainText('Pastel mini, ~3 personas')
  await expect(line).not.toContainText('base')
  await expect(page.getByRole('region', { name: 'Resumen' })).not.toContainText('Depósito')
})

// --- Ronda de arreglos: tamaños no disponibles, precio de las decoraciones en el mini y vitrina de origen ---

test('with the showcase size unavailable, 10 people still get "Hacerlo de 4 kg" and the showcase card says why', async ({ page }) => {
  const options = withSize('showcase', { available: false, unavailable_reason: 'Precio por confirmar', price_from: null })
  await open(page, '', options)
  await setPeople(page, 10)
  const showcase = sizes(page).getByRole('radio', { name: /Pastel de vitrina/ })
  await expect(showcase).toBeDisabled()
  await expect(sizes(page)).toContainText('Precio por confirmar')
  // El único tamaño que se puede elegir queda elegido: el paso tiene salida.
  await expect(sizes(page).getByRole('radio', { name: /Hacerlo de 4 kg/ })).toBeChecked()
  await expect(card(page).getByRole('group', { name: 'Forma' })).toBeVisible()
  await proceed(page, 'Continuar con 4 kg, unas 28 personas')
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
})

test('"Diseña tu pastel mini" with the mini unavailable says so instead of opening another size', async ({ page }) => {
  await open(page, '?tamano=mini', withSize('mini', { available: false, unavailable_reason: 'Precio por confirmar', price_from: null }))
  await expect(page.getByRole('status').filter({ hasText: 'No pudimos empezar con el pastel mini' })).toBeVisible()
  // El borrador no cambió: sigue el de siempre, por kilos.
  await expect(people(page)).toHaveValue('40')
  expect(await draftOf(page)).toMatchObject({ cakeSize: null })
})

test('roses on a mini show and charge the mini price the API sends', async ({ page }) => {
  const mini = cakeDesignOptions.sizes.find((size) => size.code === 'mini')!
  const { flores: _pending, ...refused } = mini.unavailable_decorations
  const options = withSize('mini', { unavailable_decorations: refused, decoration_prices: { ...mini.decoration_prices, flores: '60.00' } })
  await seedDraft(page, {
    people: 3, cakeSize: 'mini', form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal', flavorCount: 1,
    flavors: ['durazno'], coverageColor: COVERAGE_HEX.rosa, confirmed: [1, 2, 3, 4, 5],
  })
  await open(page, '?paso=6', options)
  const roses = card(page).locator('label').filter({ has: page.getByRole('radio', { name: 'Rosas' }) })
  await expect(roses).toContainText('+$60')
  await expect(roses).not.toContainText('$120')
  await card(page).getByRole('radio', { name: 'Rosas' }).check()
  await expect(total(page)).toHaveText('$190 MXN')
})

test('a showcase cake from its product keeps its bread and filling even if the size would not take them', async ({ page }) => {
  // Si a la vitrina le faltara el precio de un grupo, el pan del producto no se puede cambiar: no se marca para cambiarlo.
  const options = withSize('showcase', { unavailable_breads: { chocolate: 'Chocolate: no se ofrece en el pastel de vitrina.' }, unavailable_filling_bases: { normal: 'Normal: no se ofrece en el pastel de vitrina.' } })
  await seedDraft(page, {
    people: 19, cakeSize: 'showcase', source: { slug: 'tres-leches-de-durazno', name: 'Tres leches de durazno', servings: 19 },
    cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'normal', flavorCount: 1, flavors: ['durazno'], confirmed: [1, 2, 3, 4],
  })
  await open(page, '?paso=5', options)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await expect(page.getByText('Hay que cambiarlo', { exact: true }).filter({ visible: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Pasos de Diseña tu pastel' }).getByRole('button', { name: 'Pan del pastel elegido' })).toBeVisible()
})
