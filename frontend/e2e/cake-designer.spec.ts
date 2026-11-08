import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions, mockCakeDesignPrice, PRICE_PATH, priceResponse, sizeFor } from './support/cake-design.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * "Diseña tu pastel", pasos 1 a 5 (tanda 1). La API se simula (`support/cake-design.ts`): las opciones de la semilla y
 * un precio como el del backend (kilos por personas y fórmula de la regla 4.6). Corre en escritorio (1440 px) salvo
 * donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

async function open(page: Page, search = '') {
  await mockCakeDesignOptions(page)
  const prices = await mockCakeDesignPrice(page)
  await page.goto(`/pedido/disena${search}`)
  await expect(stepTitle(page)).toBeVisible()
  return prices
}

const stepTitle = (page: Page) => page.locator('#paso-titulo')
const total = (page: Page) => page.getByTestId('total-estimado').first()
const kilos = (page: Page) => page.getByTestId('kilos')
const people = (page: Page) => page.getByLabel('¿Para cuántas personas?')
/** "Tu pastel" vive en la tarjeta de escritorio y en el desplegable móvil: se busca solo lo que se ve. */
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true })
const proceed = (page: Page, name: string | RegExp = 'Continuar') =>
  page.getByTestId('tarjeta-paso').getByRole('button', { name, exact: typeof name === 'string' }).click()

/** Escribe las personas y espera a que la API responda los kilos de esas personas. */
async function setPeople(page: Page, count: number) {
  await people(page).fill(String(count))
  await expect(total(page)).toHaveAttribute('data-state', /ready|failed/)
  await expect(kilos(page)).not.toHaveAttribute('aria-busy', 'true')
}

/** Del paso 1 al 3 con el tipo dado, en escritorio. */
async function toBreadStep(page: Page, type = 'Tres leches') {
  await expect(kilos(page)).not.toHaveAttribute('aria-busy', 'true')
  await proceed(page)
  await page.getByRole('radio', { name: type }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('3. Pan')
}

/** Guarda un borrador en la sesión antes de abrir la página. */
async function seedDraft(page: Page, draft: object | string) {
  await page.addInitScript((value) => sessionStorage.setItem('ilusion.cakeDesign.v1', value), typeof draft === 'string' ? draft : JSON.stringify(draft))
}

test('step 1 asks the API for the kilos and the from price, and shows what it answers', async ({ page }) => {
  const prices = await open(page)
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page).toHaveURL(/\?paso=1$/)
  await expect(kilos(page)).toHaveText('Aprox. 6 kg para 40 personas')
  await expect(total(page)).toHaveText('Desde $1,080 MXN')
  await expect(page.getByText('Con pan de vainilla y relleno normal.')).toBeVisible()
  // El cliente no calcula kilos ni multiplica: manda personas, vainilla con la base Normal y pide un estimado.
  expect(prices.at(-1)).toEqual({ people: 40, cake_type: 'tres_leches', bread: 'vainilla', filling_base: 'normal', filling_flavors: [], estimate: true })

  await setPeople(page, 47)
  await expect(kilos(page)).toHaveText('Aprox. 7 kg para 47 personas')
  await expect(total(page)).toHaveText('Desde $1,260 MXN')
  await setPeople(page, 3)
  await expect(kilos(page)).toHaveText('Menos de 1 kg para 3 personas')
})

test('the kilos shown are the ones the backend returns, not a client calculation', async ({ page }) => {
  await mockCakeDesignOptions(page)
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON()
    // Una respuesta que el navegador no podría adivinar: 40 personas, 9 kg.
    const response = { ...priceResponse(body).body, size: { ...sizeFor(40), rounded_kg: 9, kg: 9 } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
  await page.goto('/pedido/disena')
  await expect(kilos(page)).toHaveText('Aprox. 9 kg para 40 personas')
  await expect(page.getByText('Para 40 personas, aprox. 9 kg, redondo')).toBeVisible()
})

test('below the minimum it offers smaller cakes and continues with the minimum', async ({ page }) => {
  const prices = await open(page)
  await setPeople(page, 15)
  const notice = page.getByRole('status').filter({ hasText: 'Para 15 personas hay opciones más chicas' })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Los pedidos son desde 4 kg, que alcanzan para unas 28 personas.')
  await expect(notice).toContainText('aprox. 2.7 kg, unas 19 personas, y puede ser para hoy mismo.')
  await expect(notice.getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
  await expect(kilos(page)).toHaveText('Aprox. 2 kg para 15 personas')
  await expect(page.getByText('Mínimo 4 kg, para unas 28 personas')).toBeVisible()
  await expect(total(page)).toHaveText('Desde $720 MXN')
  expect(prices.at(-1)?.people).toBe(15)

  await proceed(page, 'Continuar con 4 kg, unas 28 personas')
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(shown(page, '28 personas, 4 kg, redondo')).toBeVisible()
})

test('above the online maximum the backend says so and the screen points to WhatsApp', async ({ page }) => {
  const prices = await open(page)
  await setPeople(page, 400)
  expect(prices.at(-1)?.people).toBe(400)
  await expect(page.getByText('Para más de 50 kg, escríbenos por WhatsApp')).toBeVisible()
  await expect(page.getByText('En línea tomamos pedidos de hasta 50 kg, unas 350 personas.')).toBeVisible()
  await expect(total(page)).toHaveText('Por WhatsApp')
  await expect(page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar' })).toBeDisabled()
  // El enlace usa el número que da la API de la pastelería, nunca uno escrito en el código.
  await expect(page.getByTestId('tarjeta-paso').getByRole('link', { name: /Escribir por WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/520000000000')
})

test('without the store number, the WhatsApp line is a pending marker, not a link', async ({ page }) => {
  await page.unrouteAll()
  await mockStoreInfo(page, emptyStoreInfo)
  await open(page)
  await setPeople(page, 400)
  const card = page.getByTestId('tarjeta-paso')
  await expect(card.getByText('Escribir por WhatsApp [número por confirmar]')).toBeVisible()
  await expect(card.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0)
})

test('fewer kilos than a tier count recommends warns without blocking', async ({ page }) => {
  await open(page)
  await setPeople(page, 130)
  await page.getByText('4 pisos', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /4 pisos/ })).toBeChecked()
  const warning = page.getByRole('status').filter({ hasText: 'Para 4 pisos la pastelería recomienda al menos 25 kg' })
  await expect(warning).toContainText('Con 19 kg los pisos quedarían bajos. Puedes seguir así o elegir 3 pisos')
  await expect(page.getByText('Para 130 personas, aprox. 19 kg, redondo de 4 pisos')).toBeVisible()
  await expect(total(page)).toHaveText('Desde $3,420 MXN')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
})

test('a failed price never shows the old total as current, on desktop or in the mobile bar, and retry works', async ({ page }) => {
  let fail = false
  await mockCakeDesignOptions(page)
  await page.route(PRICE_PATH, async (route) => {
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(priceResponse(route.request().postDataJSON()).body) })
  })
  await page.goto('/pedido/disena')
  await expect(total(page)).toHaveText('Desde $1,080 MXN')
  fail = true
  await people(page).fill('47')
  await expect(total(page)).toHaveText('Sin calcular')
  await expect(page.getByText('No se pudo calcular el total.').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('$1,080').filter({ visible: true })).toHaveCount(0)
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos calcular los kilos.' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const bar = page.getByTestId('barra-movil')
  await expect(bar.getByTestId('total-estimado')).toHaveText('Sin calcular')
  await expect(bar.getByText('No se pudo calcular el total.')).toBeVisible()
  fail = false
  await bar.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(bar.getByTestId('total-estimado')).toHaveText('Desde $1,260')
})

test('a rejected choice still brings the kilos, so step 1 shows them and continues', async ({ page }) => {
  await mockCakeDesignOptions(page)
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON()
    // Por ejemplo, el admin retiró el pan del estimado: la API rechaza la elección pero calcula los kilos.
    const rejected = { bread: ['Ese pan no existe o no está disponible.'], size: sizeFor(body.people) }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(rejected) })
  })
  await page.goto('/pedido/disena')
  await expect(kilos(page)).toHaveText('Aprox. 6 kg para 40 personas')
  await expect(total(page)).toHaveText('Sin calcular')
  await expect(page.getByText('No se pudo calcular el total.').filter({ visible: true })).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(shown(page, '40 personas, 6 kg, redondo')).toBeVisible()
})

test('typing the people and pressing Enter right away continues with one press', async ({ page }) => {
  const prices = await open(page)
  await expect(total(page)).toHaveText('Desde $1,080 MXN')
  await people(page).fill('47')
  await people(page).press('Enter')
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(shown(page, '47 personas, 7 kg, redondo')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(prices.some((body) => body.people === 47)).toBe(true)
})

test('clicking Continuar right after typing also waits for the kilos instead of asking twice', async ({ page }) => {
  await open(page)
  await expect(total(page)).toHaveText('Desde $1,080 MXN')
  await people(page).fill('15')
  await proceed(page, /^Continuar/)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  // Bajo el mínimo sigue con el mínimo, aunque los kilos llegaran después de la pulsación.
  await expect(shown(page, '28 personas, 4 kg, redondo')).toBeVisible()
})

test('a slow old answer never replaces the newer one', async ({ page }) => {
  await mockCakeDesignOptions(page)
  let first = true
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON()
    if (first && body.people === 40) {
      first = false
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(priceResponse(body).body) }).catch(() => {})
  })
  await page.goto('/pedido/disena')
  await expect(stepTitle(page)).toBeVisible()
  await people(page).fill('47')
  await expect(total(page)).toHaveText('Desde $1,260 MXN')
  await page.waitForTimeout(1600)
  await expect(total(page)).toHaveText('Desde $1,260 MXN')
  await expect(kilos(page)).toHaveText('Aprox. 7 kg para 47 personas')
})

test('choco-pingüino skips the filling step and envinado asks to choose another bread', async ({ page }) => {
  await open(page)
  await toBreadStep(page)
  await page.getByRole('radio', { name: 'Choco-pingüino' }).check()
  await expect(total(page)).toHaveText('$1,500 MXN')
  await proceed(page)
  // El relleno queda "Incluido" y se salta a la cobertura.
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await expect(page).toHaveURL(/\?paso=5$/)
  await expect(page.getByText('ya trae su relleno de crema de chocolate sabor helado')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pasos de Diseña tu pastel' }).getByText('Relleno: incluido')).toBeAttached()
  await page.getByRole('button', { name: 'Atrás' }).click()
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await proceed(page)
  await page.getByText('Lila', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Lila' })).toBeChecked()
  await proceed(page)

  await page.getByRole('link', { name: 'Cambiar tipo de pastel' }).click()
  await page.getByRole('radio', { name: 'Envinado' }).check()
  await expect(page.getByText('Tu pan Choco-pingüino no se combina con pastel envinado.')).toBeVisible()
  await expect(page.getByText('Si continúas, te pediremos elegir otro pan y un relleno. Lo demás se conserva.')).toBeVisible()
  await expect(page.getByText('Cambiaste el tipo de pastel. Revisa cómo afecta a lo que ya elegiste.')).toBeVisible()
  await expect(shown(page, 'Hay que cambiarlo')).toBeVisible()

  await proceed(page, 'Continuar y elegir otro pan')
  await expect(stepTitle(page)).toHaveText('3. Pan')
  const pinguino = page.getByRole('radio', { name: 'Choco-pingüino' })
  await expect(pinguino).toBeDisabled()
  await expect(pinguino).not.toBeChecked()
  await expect(page.getByText('No se combina con pastel envinado').first()).toBeVisible()
  await expect(page.getByText('Para usar Choco-pingüino, cambia el tipo de pastel a Tres leches o Seco.')).toBeVisible()
  // Lo demás se conserva: la cobertura lila sigue en "Tu pastel".
  await expect(shown(page, 'Crema pastelera, lila')).toBeVisible()
})

test('after switching to envinado, "Cambiar" on the bread leads to choosing another one', async ({ page }) => {
  await open(page)
  await toBreadStep(page)
  await page.getByRole('radio', { name: 'Choco-pingüino' }).check()
  await proceed(page)
  await page.getByRole('link', { name: 'Cambiar tipo de pastel' }).click()
  await page.getByRole('radio', { name: 'Envinado' }).check()
  await page.getByRole('link', { name: 'Cambiar pan' }).click()
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(page.getByRole('radio', { name: 'Choco-pingüino' })).toBeDisabled()
  await page.getByRole('radio', { name: /^Chocolate/ }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('4. Relleno')
})

test('the red velvet conflict sentence comes from the reason code', async ({ page }) => {
  await open(page)
  await toBreadStep(page, 'Seco')
  await page.getByRole('radio', { name: /^Red velvet/ }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await page.getByRole('link', { name: 'Cambiar tipo de pastel' }).click()
  await page.getByRole('radio', { name: 'Tres leches' }).check()
  await expect(page.getByText('Tu pan Red velvet solo va en pastel seco.')).toBeVisible()
})

test('envinado also asks to change a fresa con yogurt filling and keeps the bread', async ({ page }) => {
  await open(page)
  await toBreadStep(page)
  await page.getByRole('radio', { name: /^Vainilla/ }).check()
  await proceed(page)
  await page.getByRole('radio', { name: /^Normal/ }).check()
  await page.getByRole('radio', { name: /^Fresa con yogurt/ }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
  await page.getByRole('link', { name: 'Cambiar tipo de pastel' }).click()
  await page.getByRole('radio', { name: 'Envinado' }).check()
  await expect(page.getByText('Tu relleno Fresa con yogurt no está disponible en pastel envinado.')).toBeVisible()
  await proceed(page, 'Continuar y elegir otro relleno')
  await expect(stepTitle(page)).toHaveText('4. Relleno')
  await expect(page.getByRole('radio', { name: /^Normal/ })).not.toBeChecked()
  await page.getByRole('radio', { name: /^Normal/ }).check()
  await expect(page.getByRole('radio', { name: /^Fresa con yogurt/ })).toBeDisabled()
  await expect(page.getByText('No disponible en pastel envinado').first()).toBeVisible()
  await expect(shown(page, 'Vainilla')).toBeVisible()
})

test('a combined filling takes two flavors at most and fresa con yogurt does not combine', async ({ page }) => {
  const prices = await open(page)
  await toBreadStep(page)
  await page.getByRole('radio', { name: /^Vainilla/ }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('4. Relleno')

  await page.getByRole('radio', { name: /^Normal/ }).check()
  await page.getByRole('radio', { name: /Dos sabores/ }).check()
  await page.getByRole('checkbox', { name: 'Durazno' }).check()
  await page.getByRole('checkbox', { name: /Nuez/ }).check()
  await expect(page.getByText('2 de 2 sabores elegidos')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Fresa', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Fresa con yogurt' })).toBeDisabled()
  await expect(page.getByText('No se combina', { exact: true })).toBeVisible()
  // 6 kg × ($190 de nuez + $5 por combinado).
  await expect(total(page)).toHaveText('$1,170 MXN')
  expect(prices.at(-1)).toEqual({ people: 40, cake_type: 'tres_leches', bread: 'vainilla', filling_base: 'normal', filling_flavors: ['durazno', 'nuez'] })

  // Quitar uno vuelve a dejar elegir otro.
  await page.getByRole('checkbox', { name: 'Durazno' }).uncheck()
  await expect(page.getByRole('checkbox', { name: 'Fresa', exact: true })).toBeEnabled()

  // Con queso lleva un solo sabor.
  await page.getByRole('radio', { name: /^Con queso/ }).check()
  await expect(page.getByText('Ahora, el sabor con queso')).toBeVisible()
  await expect(page.getByText('Dos sabores solo con la base Normal.')).toBeVisible()
})

test('with fresa con yogurt chosen, "Dos sabores" is blocked with its reason and the flavor stays', async ({ page }) => {
  await open(page)
  await toBreadStep(page)
  await page.getByRole('radio', { name: /^Vainilla/ }).check()
  await proceed(page)
  await page.getByRole('radio', { name: /^Normal/ }).check()
  await page.getByRole('radio', { name: /^Fresa con yogurt/ }).check()
  await expect(page.getByRole('radio', { name: /Dos sabores/ })).toBeDisabled()
  await expect(page.getByText('Fresa con yogurt no se combina', { exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Fresa con yogurt/ })).toBeChecked()
})

test('a stored draft with an unknown flavor does not lock the picker', async ({ page }) => {
  await seedDraft(page, {
    people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal',
    flavorCount: 2, flavors: ['mango', 'durazno'], coverageColor: null, confirmed: [1, 2, 3],
  })
  await open(page, '?paso=4')
  await expect(stepTitle(page)).toHaveText('4. Relleno')
  await proceed(page)
  await expect(page.getByRole('alert')).toHaveText('Elige otro sabor del relleno.')
  // Elegir otro sabor descarta el que ya no existe.
  await page.getByRole('checkbox', { name: /Nuez/ }).check()
  await expect(page.getByText('2 de 2 sabores elegidos')).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('5. Cobertura')
})

test('junk in the session starts over without breaking the screen', async ({ page }) => {
  await seedDraft(page, '{no es json')
  await open(page, '?paso=3')
  await expect(page).toHaveURL(/\?paso=1$/)
  await expect(kilos(page)).toHaveText('Aprox. 6 kg para 40 personas')
})

test('reloading keeps the draft and the step', async ({ page }) => {
  await open(page)
  await setPeople(page, 105)
  await page.getByText('2 pisos', { exact: true }).click()
  await toBreadStep(page, 'Seco')
  await page.reload()
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(shown(page, '105 personas, 15 kg, redondo de 2 pisos')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Red velvet/ })).toBeEnabled()
  // Atrás del navegador recorre los pasos.
  await page.goBack()
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(page.getByRole('radio', { name: 'Seco' })).toBeChecked()
})

test('a step that is not reached yet sends a fresh visit to step 1', async ({ page }) => {
  await open(page, '?paso=5')
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(page).toHaveURL(/\?paso=1$/)
})

test('the step 6 placeholder cannot be confirmed', async ({ page }) => {
  await seedDraft(page, {
    people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'choco_pinguino', fillingBase: null,
    flavorCount: 1, flavors: [], coverageColor: 'lila', confirmed: [1, 2, 3, 5],
  })
  await open(page, '?paso=6')
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await expect(page.getByText('Este paso está en construcción.')).toBeVisible()
  await expect(page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar' })).toBeDisabled()
})

test('the keyboard reaches a choice and continuing moves the focus to the new step title', async ({ page }) => {
  await open(page)
  await expect(kilos(page)).not.toHaveAttribute('aria-busy', 'true')
  await proceed(page)
  await expect(stepTitle(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: 'Tres leches' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: 'Seco' })).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await expect(stepTitle(page)).toBeFocused()
})

test('continuing without a choice says what is missing', async ({ page }) => {
  await open(page)
  await expect(kilos(page)).not.toHaveAttribute('aria-busy', 'true')
  await proceed(page)
  await proceed(page)
  await expect(page.getByRole('alert')).toHaveText('Elige el tipo de pastel.')
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
})

test('the options error offers a retry', async ({ page }) => {
  let fail = true
  await mockCakeDesignPrice(page)
  await page.route('**/api/v1/cake-designs/options/', async (route) => {
    if (fail) await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    else await route.fallback()
  })
  await page.goto('/pedido/disena')
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar las opciones de tu pastel')
  fail = false
  await mockCakeDesignOptions(page)
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
})

test('while the options load it shows the skeleton and says so', async ({ page }) => {
  await mockCakeDesignOptions(page, 'hang')
  await page.goto('/pedido/disena')
  await expect(page.getByRole('status').filter({ hasText: 'Cargando las opciones de tu pastel…' })).toBeAttached()
  await expect(page.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('it shows the short step bar, the summary as a disclosure and the bottom bar', async ({ page }) => {
    await open(page)
    await expect(page.getByText('Paso 1 de 8: Tamaño y forma')).toBeVisible()
    const bar = page.getByTestId('barra-movil')
    await expect(bar.getByTestId('total-estimado')).toHaveText('Desde $1,080')
    await bar.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Paso 2 de 8: Tipo de pastel')).toBeVisible()
    await page.getByText('Ver tu pastel (1 elegido)').click()
    await expect(shown(page, '40 personas, 6 kg, redondo')).toBeVisible()
  })
})
