import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, mockCakeDesignOptions, mockCakeDesignPrice, PRICE_PATH, priceResponse, sizeFor, withPendingDecorations } from './support/cake-design.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * "Diseña tu pastel", pasos 1 a 6 (el 7 y el 8 están en cake-designer-lid.spec.ts). La API se simula (`support/cake-design.ts`): las opciones de la semilla y
 * un precio como el del backend (kilos por personas y fórmula de la regla 4.6). Corre en escritorio (1440 px) salvo
 * donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

async function open(page: Page, search = '', options: typeof cakeDesignOptions = cakeDesignOptions) {
  await mockCakeDesignOptions(page, { status: 200, body: options })
  const prices = await mockCakeDesignPrice(page, options)
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

/** Un borrador que llega al paso 6: lo del 1 al 5 confirmado, con cobertura lila. */
const DRAFT_TO_STEP_6 = {
  people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal',
  flavorCount: 1, flavors: ['durazno'], coverageColor: 'lila', confirmed: [1, 2, 3, 4, 5],
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

test('tiers whose minimum is above the kilos are disabled with their minimum and never disappear', async ({ page }) => {
  await open(page)
  // 40 personas son 6 kg: solo 1 piso (regla 3.3, D50).
  await expect(page.getByRole('radio', { name: /1 piso/ })).toBeEnabled()
  for (const [tiers, minimum] of [[2, 15], [3, 18], [4, 25], [5, 30]]) {
    const chip = page.getByRole('radio', { name: new RegExp(`${tiers} pisos`) })
    await expect(chip).toBeDisabled()
    await expect(page.getByText(`Desde ${minimum} kg`, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('Cualquier peso', { exact: true })).toBeVisible()
  await expect(page.getByText(/Recomendado/)).toHaveCount(0)

  // 130 personas son 19 kg: de 1 a 3 pisos.
  await setPeople(page, 130)
  await expect(page.getByRole('radio', { name: /3 pisos/ })).toBeEnabled()
  await expect(page.getByRole('radio', { name: /4 pisos/ })).toBeDisabled()
  await page.getByText('3 pisos', { exact: true }).click()
  await expect(page.getByText('Para 130 personas, aprox. 19 kg, redondo de 3 pisos')).toBeVisible()
})

test('lowering the people below the tiers minimum drops the tiers and says so', async ({ page }) => {
  await open(page)
  await setPeople(page, 105)
  await page.getByText('2 pisos', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /2 pisos/ })).toBeChecked()
  // 60 personas son 9 kg: el pastel va de 1 piso.
  await setPeople(page, 60)
  await expect(page.getByRole('radio', { name: /1 piso/ })).toBeChecked()
  await expect(page.getByRole('status').filter({ hasText: 'Con 9 kg el pastel va de 1 piso.' })).toBeVisible()
  await expect(page.getByText('Para 60 personas, aprox. 9 kg, redondo', { exact: true })).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(shown(page, '60 personas, 9 kg, redondo')).toBeVisible()
})

test('the tiers notice goes away when the people change again', async ({ page }) => {
  await open(page)
  await setPeople(page, 105)
  await page.getByText('2 pisos', { exact: true }).click()
  await setPeople(page, 60)
  const notice = page.getByRole('status').filter({ hasText: 'Con 9 kg el pastel va de 1 piso.' })
  await expect(notice).toBeVisible()
  // Con más personas el aviso ya no vale, al cambiar las personas.
  await setPeople(page, 105)
  await expect(notice).toHaveCount(0)
  await expect(page.getByRole('radio', { name: /1 piso/ })).toBeChecked()
  await setPeople(page, 60)
  await expect(page.getByRole('status').filter({ hasText: /Con \d+ kg el pastel va de/ })).toHaveCount(0)
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
  // Un rechazo dice su motivo y no ofrece reintentar: daría lo mismo.
  await expect(page.getByText('Ese pan no existe o no está disponible.').filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver a intentar' }).filter({ visible: true })).toHaveCount(0)
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

test('a rejected choice on step 4 shows its reason instead of a retry', async ({ page }) => {
  await mockCakeDesignOptions(page)
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON()
    if (body.filling_flavors?.includes('durazno')) {
      // Por ejemplo, el admin retiró el sabor mientras la persona lo elegía.
      const rejected = { filling_flavors: ['Durazno no se ofrece en la base Normal.'], size: sizeFor(body.people) }
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(rejected) })
      return
    }
    const response = priceResponse(body)
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  await page.goto('/pedido/disena')
  await toBreadStep(page)
  await page.getByRole('radio', { name: /^Vainilla/ }).check()
  await proceed(page)
  await page.getByRole('radio', { name: /^Normal/ }).check()
  await page.getByRole('radio', { name: /^Durazno/ }).check()
  await expect(total(page)).toHaveText('Sin calcular')
  await expect(page.getByText('Durazno no se ofrece en la base Normal.').filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver a intentar' }).filter({ visible: true })).toHaveCount(0)
})

test('a double Continuar while the kilos are pending moves only one step', async ({ page }) => {
  await open(page)
  await expect(total(page)).toHaveText('Desde $1,080 MXN')
  await people(page).fill('47')
  await page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar' }).dblclick()
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
  await expect(page).toHaveURL(/\?paso=2$/)
  await expect(page.getByRole('alert')).toHaveCount(0)
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

// --- Paso 6: la decoración (D53) ---

const PIPING = ['Borde de conchas', 'Rosetones', 'Festones colgantes', 'Olanes']
const SPRINKLES = ['Chispas de capuchino', 'Chispas de chocolate', 'Chispas choco-vainilla']
const ALL_PENDING = ['duya', 'rosetones', 'festones', 'olanes', 'flores', 'chispas', 'chispas-chocolate', 'chispas-choco-vainilla']
/** El total como número, de "$3,975 MXN". */
const amount = async (page: Page) => Number(((await total(page).textContent()) ?? '').replace(/[^\d.]/g, ''))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

/** Solo la cabecera de un PNG (firma e IHDR) con el tamaño que se diga: sirve para revisar el ancho y el alto sin pesar. */
function pngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  bytes[24] = 8
  bytes[25] = 2
  return bytes
}

async function openDecoration(page: Page, options: typeof cakeDesignOptions = cakeDesignOptions, draft: object = DRAFT_TO_STEP_6) {
  // El borrador se siembra solo la primera vez: recargar tiene que conservar lo que la persona eligió.
  await page.addInitScript(
    (value) => {
      if (!sessionStorage.getItem('ilusion.cakeDesign.v1')) sessionStorage.setItem('ilusion.cakeDesign.v1', value)
    },
    JSON.stringify(draft),
  )
  const prices = await open(page, '?paso=6', options)
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await expect(total(page)).toHaveAttribute('data-state', 'ready')
  return prices
}

test('step 6 lists the options with their prices: included, Rosas at $120 and "Otra decoración" by quote', async ({ page }) => {
  await openDecoration(page)
  const card = page.getByTestId('tarjeta-paso')
  for (const name of ['Sin decoración', 'Patrón con duya', 'Rosas', 'Chispas', 'Otra decoración']) await expect(card.getByRole('radio', { name })).toBeEnabled()
  // Una opción incluida dice "Incluido", como "Sin decoración"; Rosas, "+$120".
  await expect(card.getByRole('radio', { name: 'Rosas' })).toBeEnabled()
  await expect(card.getByText('+$120')).toBeVisible()
  await expect(card.getByText('Incluido')).toHaveCount(3)
  await expect(card.getByText('Por cotizar')).toBeVisible()
  await expect(card.getByText('Precio por confirmar')).toHaveCount(0)
  // Sin elegir, no hay color que escoger ni imagen que pedir, y los diseños no se ven.
  await expect(card.getByText('Color de la decoración')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Elegir imagen' })).toHaveCount(0)
  for (const name of [...PIPING, ...SPRINKLES]) await expect(card.getByRole('radio', { name })).toHaveCount(0)
})

test('"Patrón con duya" opens its four designs with the first chosen, and they hide when another option is chosen', async ({ page }) => {
  const prices = await openDecoration(page)
  const card = page.getByTestId('tarjeta-paso')
  const group = card.getByRole('radio', { name: 'Patrón con duya' })
  await group.check()
  const panel = card.getByRole('group', { name: 'Patrón con duya' })
  await expect(panel).toBeVisible()
  for (const name of PIPING) await expect(panel.getByRole('radio', { name })).toBeEnabled()
  await expect(panel.getByRole('radio', { name: 'Borde de conchas' })).toBeChecked()
  await expect(group).toHaveAttribute('aria-controls', (await panel.getAttribute('id')) ?? '')
  // El foco sigue en el grupo y el teclado entra a los diseños.
  await expect(group).toBeFocused()
  // WCAG 4.1.3: se anuncia lo que apareció, sin mover el foco.
  await expect(card.getByRole('status').filter({ hasText: 'Se muestran 4 diseños de Patrón con duya' })).toBeAttached()
  await panel.getByRole('radio', { name: 'Olanes' }).check()
  await expect(group).toBeChecked()
  await expect.poll(() => prices.at(-1)).toMatchObject({ decoration: 'olanes' })
  await card.getByRole('radio', { name: 'Rosas' }).check()
  await expect(panel).toHaveCount(0)
  await expect(group).not.toBeChecked()
  // Volver a elegir el grupo deja el primer diseño, no el último.
  await group.check()
  await expect(card.getByRole('radio', { name: 'Borde de conchas' })).toBeChecked()
})

test('a draft that already has a piping design opens its group with that design chosen', async ({ page }) => {
  await openDecoration(page, cakeDesignOptions, { ...DRAFT_TO_STEP_6, decoration: 'rosetones' })
  const card = page.getByTestId('tarjeta-paso')
  await expect(card.getByRole('radio', { name: 'Patrón con duya' })).toBeChecked()
  await expect(card.getByRole('group', { name: 'Patrón con duya' }).getByRole('radio', { name: 'Rosetones' })).toBeChecked()
  await expect(card.getByRole('radio', { name: 'Elegir un color' })).not.toBeChecked()
})

test('"Chispas" opens its three types, with the first chosen and each one included', async ({ page }) => {
  const prices = await openDecoration(page)
  const card = page.getByTestId('tarjeta-paso')
  await card.getByRole('radio', { name: 'Chispas' }).check()
  const panel = card.getByRole('group', { name: 'Chispas' })
  for (const name of SPRINKLES) await expect(panel.getByRole('radio', { name })).toBeEnabled()
  await expect(panel.getByRole('radio', { name: 'Chispas de capuchino' })).toBeChecked()
  await expect(panel.getByText('Incluido')).toHaveCount(3)
  // Las chispas no llevan selector de color: salen de los rellenos.
  await expect(card.getByText('Color de la decoración')).toHaveCount(0)
  await panel.getByRole('radio', { name: 'Chispas de chocolate' }).check()
  await expect.poll(() => prices.at(-1)).toMatchObject({ decoration: 'chispas-chocolate' })
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Chispas de chocolate' })).toBeChecked()
  await proceed(page)
  await expect(shown(page, 'Chispas de chocolate')).toBeVisible()
})

test('a design without a price is disabled with "Precio por confirmar", and a group with none available cannot be chosen', async ({ page }) => {
  await openDecoration(page, withPendingDecorations(ALL_PENDING))
  const card = page.getByTestId('tarjeta-paso')
  for (const name of ['Patrón con duya', 'Rosas', 'Chispas']) {
    await expect(card.getByRole('radio', { name })).toBeDisabled()
    await expect(card.getByRole('radio', { name })).toHaveAccessibleDescription('Precio por confirmar')
  }
  // El estado va con su palabra, no solo con el color.
  await expect(card.getByText('Precio por confirmar')).toHaveCount(3)
  await expect(card.getByRole('radio', { name: 'Sin decoración' })).toBeEnabled()
})

test('with one design pending, the group opens on the first design that has a price', async ({ page }) => {
  await openDecoration(page, withPendingDecorations(['duya']))
  const card = page.getByTestId('tarjeta-paso')
  await card.getByRole('radio', { name: 'Patrón con duya' }).check()
  const panel = card.getByRole('group', { name: 'Patrón con duya' })
  await expect(panel.getByRole('radio', { name: 'Borde de conchas' })).toBeDisabled()
  await expect(panel.getByRole('radio', { name: 'Rosetones' })).toBeChecked()
})

test('choosing Rosas adds its $120 to the total that the API calculates and the included designs add nothing', async ({ page }) => {
  const prices = await openDecoration(page)
  const before = await amount(page)
  await page.getByRole('radio', { name: 'Rosas' }).check()
  await expect.poll(() => amount(page)).toBe(before + 120)
  expect(prices.at(-1)).toMatchObject({ decoration: 'flores' })
  await page.getByRole('radio', { name: 'Patrón con duya' }).check()
  await page.getByRole('radio', { name: 'Festones colgantes' }).check()
  await expect.poll(() => amount(page)).toBe(before)
  expect(prices.at(-1)).toMatchObject({ decoration: 'festones' })
  await page.getByRole('radio', { name: 'Rosas' }).check()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(shown(page, 'Rosas, color automático')).toBeVisible()
})

test('"Sin decoración" has no color to pick, and the choice survives a reload', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Sin decoración' }).check()
  await expect(page.getByText('Color de la decoración')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Sin decoración' })).toBeChecked()
})

test('the color of a design is automatic by default, shows the tones of the coverage and can be one of the 11 coverage colors', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Rosas' }).check()
  const card = page.getByTestId('tarjeta-paso')
  await expect(card.getByText('Color de la decoración')).toBeVisible()
  await expect(card.getByRole('radio', { name: 'Automático' })).toBeChecked()
  await expect(card.getByRole('radio', { name: 'Elegir un color' })).not.toBeChecked()
  await expect(card.getByText('Las hojitas siempre van en verde.')).toBeVisible()
  // Con "Automático" no hay lista de colores.
  await expect(card.getByRole('radio', { name: 'Rojo' })).toHaveCount(0)
  await card.getByRole('radio', { name: 'Elegir un color' }).check()
  const colors = card.getByRole('group', { name: 'Elige el color' }).getByRole('radio')
  // Los mismos 11 colores de la cobertura (regla 5), con el origen de datos del paso 5.
  await expect(colors).toHaveCount(cakeDesignOptions.coverage_colors.length)
  await expect(colors).toHaveCount(11)
  await card.getByText('Rojo', { exact: true }).click()
  await expect(card.getByRole('radio', { name: 'Rojo' })).toBeChecked()
  await proceed(page)
  await expect(shown(page, 'Rosas, color rojo')).toBeVisible()
  // Atrás: el color elegido sigue y se puede volver a automático.
  await page.getByRole('link', { name: 'Cambiar decoración' }).filter({ visible: true }).first().click()
  await expect(card.getByRole('radio', { name: 'Elegir un color' })).toBeChecked()
  await expect(card.getByRole('radio', { name: 'Rojo' })).toBeChecked()
  await card.getByRole('radio', { name: 'Automático' }).check()
  await expect(card.getByRole('radio', { name: 'Rojo' })).toHaveCount(0)
})

test('the chosen color is saved in the session with the design', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Patrón con duya' }).check()
  await page.getByRole('radio', { name: 'Festones colgantes' }).check()
  await page.getByRole('radio', { name: 'Elegir un color' }).check()
  await page.getByText('Blanco', { exact: true }).click()
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ilusion.cakeDesign.v1') ?? '{}'))
  expect(draft).toMatchObject({ decoration: 'festones', decorationColor: 'blanco' })
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Blanco' })).toBeChecked()
})

test('the keyboard moves through the options as one radio group, the groups included, and "Continuar" is reachable', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Sin decoración' }).focus()
  await page.keyboard.press('ArrowDown')
  // Cruza al grupo de duya, que queda elegido con su primer diseño.
  await expect(page.getByRole('radio', { name: 'Patrón con duya' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Borde de conchas' })).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: 'Rosas' })).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: /^Chispas\s*Incluido/ })).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: 'Otra decoración' })).toBeChecked()
  // Los diseños del grupo también se mueven con las flechas.
  await page.getByRole('radio', { name: 'Patrón con duya' }).check()
  await page.getByRole('radio', { name: 'Borde de conchas' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: 'Rosetones' })).toBeChecked()
})

test('"Otra decoración" asks for an image, warns that the order stays on hold and does not continue without it', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const card = page.getByTestId('tarjeta-paso')
  await expect(card.getByText('Tu pedido quedará en pausa')).toBeVisible()
  await expect(card.getByText(/Hasta que la pastelería te diga el precio de esta decoración/)).toBeVisible()
  await expect(card.getByText('JPG, PNG o WebP, de hasta 5 MB.')).toBeVisible()
  await expect(page.getByText('No incluye la decoración: la pastelería te dice su precio.').first()).toBeVisible()
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Elige la imagen de la decoración.' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('6. Decoración')
})

test('"Otra decoración" rejects a wrong type, an empty file and a file over the limit, with a sentence each', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const input = page.locator('input[type=file]')
  const alert = page.getByTestId('tarjeta-paso').getByRole('alert').filter({ hasText: /imagen|archivo/ })
  await input.setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(alert).toHaveText('Esa imagen no es JPG, PNG ni WebP. Elige otra.')
  await input.setInputFiles({ name: 'vacio.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })
  await expect(alert).toHaveText('Ese archivo está vacío. Elige otra imagen.')
  await input.setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(alert).toHaveText('La imagen pesa más de 5 MB. Elige una más ligera.')
  // Un rechazo no deja una imagen a medias: el paso sigue sin poder continuar.
  await expect(page.getByTestId('tarjeta-paso').getByText('grande.jpg', { exact: true })).toHaveCount(0)
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  // El límite es inclusivo: justo 5 MB sí pasa.
  // Una imagen de verdad con relleno al final (el decodificador lo ignora), de justo 5 MB.
  await input.setInputFiles({ name: 'justa.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 - PNG.length)]) })
  await expect(page.getByTestId('tarjeta-paso').getByText('justa.png', { exact: true })).toBeVisible()
  await expect(alert).toHaveCount(0)
})

test('"Otra decoración" shows the thumbnail and the name, lets you remove the image and continues with it', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const card = page.getByTestId('tarjeta-paso')
  await page.locator('input[type=file]').setInputFiles({ name: 'decoracion-referencia.png', mimeType: 'image/png', buffer: PNG })
  await expect(card.getByText('decoracion-referencia.png', { exact: true })).toBeVisible()
  await expect(card.locator('img')).toHaveAttribute('src', /^blob:/)
  await expect(card.getByRole('button', { name: 'Quitar la imagen decoracion-referencia.png' })).toBeVisible()
  await card.getByRole('button', { name: /Quitar/ }).click()
  await expect(card.getByText('decoracion-referencia.png', { exact: true })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Elegir imagen' })).toHaveCount(1)
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Elige la imagen de la decoración.' })).toBeVisible()
  // El mismo archivo otra vez, ya quitado, también se acepta.
  await page.locator('input[type=file]').setInputFiles({ name: 'decoracion-referencia.png', mimeType: 'image/png', buffer: PNG })
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(shown(page, 'Otra decoración, decoracion-referencia.png')).toBeVisible()
  await expect(shown(page, 'Por cotizar')).toBeVisible()
})

test('after a reload the image is gone: the step says so, asks for it again and never continues without it', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await page.locator('input[type=file]').setInputFiles({ name: 'decoracion-referencia.png', mimeType: 'image/png', buffer: PNG })
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await page.reload()
  // El paso 6 ya no está completo: la URL del paso 7 vuelve a él.
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await expect(page.getByRole('radio', { name: 'Otra decoración' })).toBeChecked()
  await expect(page.getByText('Tu imagen ya no está')).toBeVisible()
  await expect(page.getByText(/Se perdió al recargar la página/)).toContainText('decoracion-referencia.png')
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu imagen no se conservó al recargar. Elígela otra vez.' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await page.locator('input[type=file]').setInputFiles({ name: 'otra.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('Tu imagen ya no está')).toHaveCount(0)
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
})

test('choosing another decoration drops the image, and every object URL is released', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { created: 0, revoked: 0 }
    ;(window as unknown as { __urls: typeof counts }).__urls = counts
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (object: Blob | MediaSource) => {
      counts.created++
      return create(object)
    }
    URL.revokeObjectURL = (url: string) => {
      counts.revoked++
      revoke(url)
    }
  })
  await openDecoration(page)
  const urls = () => page.evaluate(() => (window as unknown as { __urls: { created: number; revoked: number } }).__urls)
  const input = page.locator('input[type=file]')
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('a.png', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Quitar/ }).click()
  expect(await urls()).toEqual({ created: 1, revoked: 1 })
  await input.setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('radio', { name: 'Sin decoración' }).check()
  expect(await urls()).toEqual({ created: 2, revoked: 2 })
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await expect(page.getByText('b.png', { exact: true })).toHaveCount(0)
  await input.setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('c.png', { exact: true })).toBeVisible()
  expect(await urls()).toEqual({ created: 3, revoked: 2 })
  // Al salir de la pantalla (sin recargar), la última también se libera.
  await page.getByRole('link', { name: 'Catálogo' }).first().click()
  await expect(page).toHaveURL(/\/catalogo/)
  await expect.poll(urls).toEqual({ created: 3, revoked: 3 })
})

test('a file that claims to be an image but cannot be opened is dropped with its own sentence', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  // Cabecera de PNG válida pero sin datos: pasa la revisión del archivo y el navegador no la puede decodificar.
  await page.locator('input[type=file]').setInputFiles({ name: 'roto.png', mimeType: 'image/png', buffer: pngHeader(10, 10) })
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos abrir esa imagen. Elige otra.' })).toBeVisible()
  await expect(page.getByText('roto.png', { exact: true })).toHaveCount(0)
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('6. Decoración')
})

test('a decoration that lost its price after it was chosen cannot be confirmed', async ({ page }) => {
  await openDecoration(page, withPendingDecorations(['rosetones']), { ...DRAFT_TO_STEP_6, decoration: 'rosetones' })
  await expect(page.getByRole('radio', { name: 'Rosetones' })).toBeDisabled()
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Rosetones todavía no tiene precio. Elige otra decoración.' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('6. Decoración')
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
  // Con la máquina cargada, el segundo clic llegaba antes de que el paso 2 se pintara y volvía a confirmar el 1.
  await expect(stepTitle(page)).toHaveText('2. Tipo de pastel')
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

// --- Vista previa: giro en dos ejes y encuadre (D52) ---
// La escena expone en desarrollo `data-angle`, `data-elevation` (grados), `data-scale` (píxeles por unidad de la
// cámara) y `data-frames`, para probarla sin acoplar la prueba a three. Con "reducir movimiento" los pasos de las
// flechas saltan y no hay giro solo, así los números son exactos.

const preview = (page: Page) => page.getByRole('img', { name: 'Vista previa de tu pastel', exact: true })
const reading = async (page: Page, attr: string) => Number(await preview(page).getAttribute(attr))
const ARROWS_HINT = 'Usa las flechas para girarlo y verlo desde arriba o desde abajo.'
const DRAG_HINT = 'Arrastra el pastel para girarlo.'

/** La vista previa del paso 4 con un borrador de `people` personas (siete por kilo), ya dibujada. */
async function openPreview(page: Page, draft: object = {}) {
  await seedDraft(page, {
    people: 84, form: 'round', tiers: 1, cakeType: 'seco', bread: 'vainilla', fillingBase: 'normal', flavorCount: 1,
    flavors: ['durazno'], coverageColor: null, confirmed: [1, 2, 3, 4], ...draft,
  })
  await open(page, '?paso=4')
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => reading(page, 'data-frames')).toBeGreaterThan(0)
}

test.describe('the preview, with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the up and down arrows change the elevation like left and right change the turn, within the range', async ({ page }) => {
    await openPreview(page)
    await preview(page).focus()
    expect(await reading(page, 'data-elevation')).toBe(15)
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => reading(page, 'data-elevation')).toBe(25)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => reading(page, 'data-elevation')).toBe(5)
    // Hasta casi cenital arriba y un poco por debajo del horizonte abajo.
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp')
    await expect.poll(() => reading(page, 'data-elevation')).toBe(82)
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown')
    await expect.poll(() => reading(page, 'data-elevation')).toBe(-10)
    // El giro de lado sigue igual, y no mueve la elevación.
    const angle = await reading(page, 'data-angle')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => reading(page, 'data-angle')).toBe(angle + 15)
    expect(await reading(page, 'data-elevation')).toBe(-10)
  })

  test('the arrows do not scroll the page while the preview has the focus', async ({ page }) => {
    await openPreview(page)
    await preview(page).focus()
    const scrolled = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  })

  test('a mouse drag in any direction turns both axes, and the elevation stays where it is left', async ({ page }) => {
    await openPreview(page)
    const rect = (await preview(page).boundingBox())!
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const angle = await reading(page, 'data-angle')
    await page.mouse.move(x, y)
    await page.mouse.down()
    // Solo en vertical: 60 px, de los que 4 son del umbral, a medio grado cada uno.
    await page.mouse.move(x, y + 60, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => reading(page, 'data-elevation')).toBe(43)
    expect(await reading(page, 'data-angle')).toBe(angle)
    await page.waitForTimeout(500)
    expect(await reading(page, 'data-elevation')).toBe(43)
    // En diagonal: hacia arriba baja la cámara y hacia la derecha gira.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y - 80, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => reading(page, 'data-elevation')).toBeLessThan(10)
    expect(await reading(page, 'data-angle')).toBeGreaterThan(angle + 20)
  })

  test('the camera keeps its scale for a small and a big one-tier cake, and moves away only for a tall one', async ({ page }) => {
    await openPreview(page, { people: 28 })
    const small = await reading(page, 'data-scale')
    await openPreview(page, { people: 84 })
    const big = await reading(page, 'data-scale')
    expect(small).toBe(big)
    // Visto desde arriba, se aleja un poco para que la base no se salga de la tarjeta.
    await preview(page).focus()
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowUp')
    await expect.poll(() => reading(page, 'data-scale')).toBeLessThan(big)
    await openPreview(page, { people: 210, tiers: 5 })
    expect(await reading(page, 'data-scale')).toBeLessThan(small)
  })
})

test('the hint and the accessible description mention the arrows, and the visible one follows the keyboard focus', async ({ page }) => {
  await openPreview(page)
  const card = page.getByRole('region', { name: 'Total estimado' })
  await expect(preview(page)).toHaveAccessibleDescription(new RegExp(ARROWS_HINT))
  await expect(preview(page)).toHaveAccessibleDescription(new RegExp(DRAG_HINT))
  await expect(card.getByText(DRAG_HINT, { exact: true })).not.toHaveClass(/sr-only/)
  await expect(card.getByText(ARROWS_HINT, { exact: true })).toHaveClass(/sr-only/)
  await preview(page).focus()
  await expect(card.getByText(ARROWS_HINT, { exact: true })).not.toHaveClass(/sr-only/)
  await expect(card.getByText(DRAG_HINT, { exact: true })).toHaveClass(/sr-only/)
  await preview(page).blur()
  await expect(card.getByText(DRAG_HINT, { exact: true })).not.toHaveClass(/sr-only/)
})

test.describe('the preview on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })

  /** Un gesto táctil como el del dedo: un toque que baja o sube y se mueve de lado, por el protocolo del navegador. */
  async function swipe(page: Page, from: { x: number; y: number }, moves: { x: number; y: number }[]) {
    const session = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) =>
      session.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] })
    await touch('touchStart', from)
    for (const move of moves) {
      await touch('touchMove', move)
      await page.waitForTimeout(30)
    }
    await touch('touchEnd')
  }

  test('a gesture that starts vertical scrolls the page and one that starts horizontal takes the cake in both axes', async ({ page }) => {
    await openPreview(page, { people: 28 })
    const box = (await preview(page).boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const elevation = await reading(page, 'data-elevation')
    const scrolled = await page.evaluate(() => window.scrollY)

    // Empieza en vertical: es el scroll de la página, y el pastel no se mueve.
    await swipe(page, from, [{ x: from.x, y: from.y - 10 }, { x: from.x, y: from.y - 40 }, { x: from.x + 20, y: from.y - 80 }, { x: from.x + 20, y: from.y - 120 }])
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled)
    expect(await reading(page, 'data-elevation')).toBe(elevation)

    // Empieza en horizontal: toma el pastel y, desde ahí, también gira en vertical en todo el gesto, sin mover la página.
    await page.evaluate(() => window.scrollTo(0, 0))
    const top = (await preview(page).boundingBox())!
    const start = { x: top.x + top.width / 2, y: top.y + top.height / 2 }
    const before = await page.evaluate(() => window.scrollY)
    await swipe(page, start, [{ x: start.x + 12, y: start.y }, { x: start.x + 30, y: start.y + 5 }, { x: start.x + 30, y: start.y + 40 }, { x: start.x + 30, y: start.y + 80 }])
    await expect.poll(() => reading(page, 'data-elevation')).toBeGreaterThan(elevation + 20)
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
  })
})

test('choosing the image moves the focus to "Quitar", removing it moves it back, and both are announced', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const input = page.locator('input[type=file]')
  await input.focus()
  await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  // WCAG 2.4.3: el control que tenía el foco desaparece; el foco pasa al que ocupa su lugar, no al cuerpo de la página.
  const remove = page.getByRole('button', { name: 'Quitar la imagen a.png' })
  await expect(remove).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Imagen elegida: a.png' })).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(page.locator('input[type=file]')).toBeFocused()
  await expect(page.getByText('Imagen elegida')).toHaveCount(0)
  // Tab sigue por "Continuar", sin saltos raros.
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Continuar' })).toBeFocused()
})

test('the piping group is described by its help text', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Patrón con duya' }).check()
  await expect(page.getByRole('group', { name: 'Patrón con duya' })).toHaveAccessibleDescription('Elige uno de los diseños.')
})

test('the file name is cleaned before it is shown and saved: no control or format characters', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  // U+202E invierte el texto que sigue; U+200B no se ve; el salto de línea no cabe en un nombre.
  await page.locator('input[type=file]').setInputFiles({ name: 'foto‮gpj.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('tarjeta-paso').getByText('fotogpj.png', { exact: true })).toBeVisible()
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ilusion.cakeDesign.v1') ?? '{}'))
  expect(draft.decorationImageName).toBe('fotogpj.png')
  await page.reload()
  await expect(page.getByText(/Se perdió al recargar la página/)).toContainText('fotogpj.png')
})

test('a file whose content is not a JPG, PNG or WebP is rejected even if it says it is', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await page.locator('input[type=file]').setInputFiles({ name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') })
  await expect(page.getByTestId('tarjeta-paso').getByRole('alert').filter({ hasText: /aunque lo parezca/ })).toHaveText('Ese archivo no es una imagen JPG, PNG ni WebP, aunque lo parezca. Elige otra.')
  await expect(page.getByTestId('tarjeta-paso').getByText('falsa.png', { exact: true })).toHaveCount(0)
})

test('an image with too many pixels is rejected by its header, without decoding it', async ({ page }) => {
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const input = page.locator('input[type=file]')
  const alert = page.getByTestId('tarjeta-paso').getByRole('alert').filter({ hasText: /demasiados píxeles/ })
  const message = 'Esa imagen tiene demasiados píxeles (más de 12 000 por lado o 40 megapíxeles). Elige una más chica.'
  await input.setInputFiles({ name: 'larga.png', mimeType: 'image/png', buffer: pngHeader(12_001, 100) })
  await expect(alert).toHaveText(message)
  await input.setInputFiles({ name: 'mp.png', mimeType: 'image/png', buffer: pngHeader(8_000, 6_000) })
  await expect(alert).toHaveText(message)
  // 12 000 px por lado y menos de 40 MP sí pasa (la cabecera es lo único que se revisa).
  await input.setInputFiles({ name: 'justa.png', mimeType: 'image/png', buffer: pngHeader(6_000, 6_000) })
  await expect(page.getByTestId('tarjeta-paso').getByText('justa.png', { exact: true })).toBeVisible()
})

test('the header reader finds the size of JPEG, PNG and the three kinds of WebP, and rejects what it cannot read', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(async (module) => {
    const { imageSize, inspectImage } = await import(module)
    const u8 = (bytes: number[]) => new Uint8Array(bytes)
    const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
    const le = (value: number, length: number) => Array.from({ length }, (_, i) => (value >>> (8 * i)) & 0xff)
    const jpeg = (width: number, height: number, app = 14) => [0xff, 0xd8, 0xff, 0xe0, (app + 2) >> 8, (app + 2) & 0xff, ...new Array(app).fill(0), 0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3]
    const vp8x = (w: number, h: number) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...le(w - 1, 3), ...le(h - 1, 3)]
    const vp8l = (w: number, h: number) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8L'), 5, 0, 0, 0, 0x2f, ...le((w - 1) | ((h - 1) << 14), 4)]
    const vp8 = (w: number, h: number) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le(w, 2), ...le(h, 2)]
    // Dos segmentos de metadatos de 40 000 bytes: el de tamaño queda pasados los 64 KB del primer trozo.
    const segment = (marker: number) => [0xff, marker, (40_002 >> 8) & 0xff, 40_002 & 0xff, ...new Array(40_000).fill(0)]
    const big = new Uint8Array([0xff, 0xd8, ...segment(0xe1), ...segment(0xe2), 0xff, 0xc0, 0, 17, 8, 0x0f, 0xa0, 0x13, 0x88, 3])
    return {
      jpeg: imageSize(u8(jpeg(512, 291))),
      vp8x: imageSize(u8(vp8x(1920, 1080))),
      vp8l: imageSize(u8(vp8l(640, 480))),
      vp8: imageSize(u8(vp8(800, 600))),
      text: imageSize(u8(ascii('hola mundo'))),
      truncatedJpeg: imageSize(u8([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0])),
      // El tamaño queda después de 64 KB de metadatos: se lee un trozo mayor.
      bigMetadata: await inspectImage(new Blob([big])),
      hugeJpeg: await inspectImage(new Blob([u8(jpeg(13_000, 100))])),
      okJpeg: await inspectImage(new Blob([u8(jpeg(4_000, 3_000))])),
      noSize: await inspectImage(new Blob([u8([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0])])),
    }
  }, '/src/models/decorationImage.ts')
  expect(result.jpeg).toEqual({ width: 512, height: 291 })
  expect(result.vp8x).toEqual({ width: 1920, height: 1080 })
  expect(result.vp8l).toEqual({ width: 640, height: 480 })
  expect(result.vp8).toEqual({ width: 800, height: 600 })
  expect(result.text).toBe('other')
  expect(result.truncatedJpeg).toBeNull()
  expect(result.bigMetadata).toBeNull()
  expect(result.hugeJpeg).toBe('dimensions')
  expect(result.okJpeg).toBeNull()
  expect(result.noSize).toBe('unreadable')
})

/** Demora (o hace fallar) la lectura de la cabecera de la imagen, que es `Blob.arrayBuffer()`, la próxima vez que se pida. */
async function controlHeaderReads(page: Page) {
  await page.addInitScript(() => {
    const control = { holdNext: false, failNext: false, release: () => {} }
    ;(window as unknown as { __reads: typeof control }).__reads = control
    const original = Blob.prototype.arrayBuffer
    Blob.prototype.arrayBuffer = async function (this: Blob) {
      if (control.failNext) {
        control.failNext = false
        throw new DOMException('El archivo cambió', 'NotReadableError')
      }
      const hold = control.holdNext ? new Promise<void>((resolve) => (control.release = resolve)) : null
      control.holdNext = false
      const buffer = await original.call(this)
      if (hold) await hold
      return buffer
    }
  })
}
const reads = (page: Page) => ({
  hold: () => page.evaluate(() => void ((window as unknown as { __reads: { holdNext: boolean } }).__reads.holdNext = true)),
  fail: () => page.evaluate(() => void ((window as unknown as { __reads: { failNext: boolean } }).__reads.failNext = true)),
  release: () => page.evaluate(() => (window as unknown as { __reads: { release: () => void } }).__reads.release()),
})
const savedName = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('ilusion.cakeDesign.v1') ?? '{}').decorationImageName)

test('two quick choices: the last one wins even if the first one finishes reading later', async ({ page }) => {
  await controlHeaderReads(page)
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const input = page.locator('input[type=file]')
  await reads(page).hold()
  await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await input.setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('tarjeta-paso').getByText('b.png', { exact: true })).toBeVisible()
  await reads(page).release()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('tarjeta-paso').getByText('b.png', { exact: true })).toBeVisible()
  await expect(page.getByText('a.png', { exact: true })).toHaveCount(0)
  expect(await savedName(page)).toBe('b.png')
})

test('removing the image or choosing another decoration while a file is being read cancels that read', async ({ page }) => {
  await controlHeaderReads(page)
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('button', { name: /Quitar/ })).toBeVisible()
  // Se elige otra imagen y, mientras se lee, se quita la que había.
  await page.getByRole('button', { name: /Quitar/ }).click()
  await reads(page).hold()
  await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('radio', { name: 'Sin decoración' }).check()
  await reads(page).release()
  await page.waitForTimeout(300)
  expect(await savedName(page)).toBeNull()
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await expect(page.getByText('a.png', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Elegir imagen' })).toHaveCount(1)
  expect(await savedName(page)).toBeNull()
})

test('a read that fails says so and leaves no unhandled error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await controlHeaderReads(page)
  await openDecoration(page)
  await page.getByRole('radio', { name: 'Otra decoración' }).check()
  await reads(page).fail()
  await page.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('tarjeta-paso').getByRole('alert').filter({ hasText: /No pudimos leer/ })).toHaveText('No pudimos leer el tamaño de esa imagen. Elige otra.')
  await expect(page.getByText('a.png', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  // Y se puede volver a elegir.
  await page.locator('input[type=file]').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('tarjeta-paso').getByText('b.png', { exact: true })).toBeVisible()
})

test('markers without a length are skipped, and the file name keeps joined emojis but not the rest of the format characters', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(async (module) => {
    const { imageSize, displayFileName } = await import(module)
    const sof = [0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3]
    return {
      withMarkers: imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd0, 0xff, 0xd7, ...sof])),
      zwj: displayFileName('\u{1F468}‍\u{1F469}.png'),
      rtl: displayFileName('a‮b​c.png'),
      // Primero se recorta a 120 caracteres y después se quitan los espacios de los extremos.
      trimmed: displayFileName(`${'x'.repeat(119)} y`),
      empty: displayFileName('‮​  '),
      onlyJoiners: displayFileName('\u200d\u200d \u200d'),
    }
  }, '/src/models/decorationImage.ts')
  expect(result.withMarkers).toEqual({ width: 200, height: 100 })
  expect(result.zwj).toBe('\u{1F468}‍\u{1F469}.png')
  expect(result.rtl).toBe('abc.png')
  expect(result.trimmed).toBe('x'.repeat(119))
  expect(result.empty).toBeNull()
  expect(result.onlyJoiners).toBeNull()
})

