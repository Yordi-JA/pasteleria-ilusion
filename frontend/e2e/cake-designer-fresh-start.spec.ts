import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, bruno, logIn, mockAuth, mockSwitchableAccounts, opened, signedIn, withoutGoogle } from './support/auth.ts'
import type { Accounts } from './support/auth.ts'
import { COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { designLine, DRAFT_KEY, mockCalendar, mockOrders, NOW, placedOrder, seedCart, storedCart } from './support/checkout.ts'
import { mockPayment, ORDER_ID, orderItems } from './support/payments.ts'
import { durazno, mockProductDetails } from './support/products.ts'
import { mockReferenceImages, mockReferences, photo } from './support/references.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Diseña tu pastel" empieza de cero después de usar el diseño (tanda 4, parte 2). El borrador de `sessionStorage` (D49) es
 * para no perder un diseño a medias; una vez que el pastel está en el carrito, ya está a salvo en su línea, y volver a abrir
 * el diseñador (desde el menú, tras crear el pedido o con "Personalizar este pastel") no debe traer el pastel anterior.
 * "Editar pedido" sigue abriendo el pastel del carrito tal cual, y cerrar la sesión también borra el borrador (como el
 * carrito, D77).
 */

test.use({ viewport: { width: 1440, height: 900 } })

const DRAFT_TO_STEP_8 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6, 7],
}

/** Un diseño a medias que nunca se agregó: 60 personas, envinado, confirmado hasta el paso 2. */
const HALF_DONE = { people: 60, form: 'round', tiers: 1, cakeType: 'envinado', bread: null, fillingBase: null, flavorCount: 1, flavors: [], confirmed: [1, 2] }

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const people = (page: Page) => page.getByLabel('¿Para cuántas personas?')
const notice = (page: Page) => card(page).getByTestId('aviso-carrito')

/** Guarda el borrador una sola vez, antes de abrir la página: recargar o volver a cargar otra ruta no lo vuelve a poner. */
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

function storedDraft(page: Page) {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null') as Record<string, unknown> | null, DRAFT_KEY)
}

async function mockDesigner(page: Page) {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
}

/** Abre la revisión (paso 8) con el pastel ya armado y lo agrega al pedido. */
async function addDesignFromReview(page: Page) {
  await seedDraftOnce(page, DRAFT_TO_STEP_8)
  await page.goto('/pedido/disena?paso=8')
  await expect(page.getByTestId('desglose')).toBeVisible()
  await card(page).getByRole('button', { name: 'Agregar al pedido' }).click()
  await expect(notice(page)).toContainText('Agregado al pedido')
}

/** El diseñador vacío: el paso 1 con las personas de inicio y sin nada elegido en el borrador. */
async function expectFreshDesigner(page: Page) {
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  await expect(people(page)).toHaveValue('40')
  const draft = await storedDraft(page)
  expect(draft?.cakeType ?? null).toBeNull()
  expect(draft?.flavors ?? []).toEqual([])
  expect(draft?.confirmed ?? []).toEqual([])
}

/** Del menú: "Realizar pedido" y luego "Empezar a diseñar", sin recargar la página. */
async function openDesignerFromMenu(page: Page) {
  await page.getByRole('banner').getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Realizar pedido' }).click()
  await page.getByRole('link', { name: 'Empezar a diseñar' }).click()
}

test.describe('after adding the cake to the cart', () => {
  test.beforeEach(async ({ page }) => {
    await mockDesigner(page)
  })

  test('step 8 keeps showing the cake, the notice and its buttons right after adding', async ({ page }) => {
    await addDesignFromReview(page)
    await expect(stepTitle(page)).toHaveText('8. Revisión')
    await expect(page.getByTestId('desglose')).toBeVisible()
    await expect(card(page).getByRole('link', { name: 'Ir a mi pedido' })).toBeVisible()
    await expect(card(page).getByRole('button', { name: 'Diseñar otro pastel' })).toBeVisible()
    // Lo que se ve es el pastel agregado: sigue en el carrito, una sola vez.
    expect((await storedCart(page)).items).toHaveLength(1)
  })

  test('after adding, the footer only says it was added and offers what comes next', async ({ page }) => {
    await addDesignFromReview(page)
    // Correcciones del 21 de noviembre: un aviso de un renglón y dos acciones, en lugar del aviso con su detalle, los dos enlaces,
    // "Agregar al pedido" (que ya no hacía nada) y "Atrás".
    await expect(notice(page)).toHaveText('Agregado al pedido')
    await expect(card(page).getByRole('button', { name: 'Agregar al pedido' })).toHaveCount(0)
    await expect(card(page).getByRole('button', { name: 'Atrás' })).toHaveCount(0)
    const goToOrder = card(page).getByRole('link', { name: 'Ir a mi pedido' })
    await expect(goToOrder).toHaveAttribute('href', '/carrito')
    // El botón que se tocó ya no existe: el foco pasa a lo que sigue.
    await expect(goToOrder).toBeFocused()
    await expect(card(page).getByRole('button', { name: 'Diseñar otro pastel' })).toBeVisible()
    // Para cambiar algo quedan los "Cambiar" de cada renglón: es otro pastel, y vuelve "Agregar al pedido".
    await page.getByTestId('desglose').getByRole('link', { name: /^Cambiar/ }).first().click()
    await expect(stepTitle(page)).not.toHaveText('8. Revisión')
  })

  test('opening Diseña tu pastel again from the menu starts from step 1 with an empty draft', async ({ page }) => {
    await addDesignFromReview(page)
    await openDesignerFromMenu(page)
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
    await expectFreshDesigner(page)
  })

  test('a reload of the designer after adding also starts from zero', async ({ page }) => {
    await addDesignFromReview(page)
    await page.goto('/pedido/disena')
    await expectFreshDesigner(page)
  })

  test('"Editar pedido" from the cart still opens the added cake exactly as it was', async ({ page }) => {
    await addDesignFromReview(page)
    await card(page).getByRole('link', { name: 'Ir a mi pedido' }).click()
    await expect(page).toHaveURL('/carrito')
    await page.getByRole('button', { name: /^Editar pedido/ }).click()
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=8$/)
    await expect(stepTitle(page)).toHaveText('8. Revisión')
    const designId = ((await storedCart(page)).items[0] as { designId: string }).designId
    expect(await storedDraft(page)).toMatchObject({
      people: 105, tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso', flavors: ['zarzamora'],
      coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', replaces: designId,
    })
  })

  test('"Diseñar otro pastel" starts from zero and a later visit does not bring the cake back', async ({ page }) => {
    await addDesignFromReview(page)
    await card(page).getByRole('button', { name: 'Diseñar otro pastel' }).click()
    await expectFreshDesigner(page)
    await page.goto('/pedido/disena')
    await expectFreshDesigner(page)
  })

  test('"Personalizar este pastel" no longer asks about the cake already in the cart', async ({ page }) => {
    await mockProductDetails(page, [durazno])
    await addDesignFromReview(page)
    await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')
    await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
    await expect(page.getByRole('status').filter({ hasText: 'Empezaste con Tres leches de durazno' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Ya tienes un diseño a medias' })).toHaveCount(0)
    expect(await storedDraft(page)).toMatchObject({ cakeType: 'tres_leches', flavors: ['durazno'], confirmed: [] })
  })
})

test.describe('a design in progress that was never added', () => {
  test.beforeEach(async ({ page }) => {
    await mockDesigner(page)
  })

  test('survives a reload and going away and back (D49)', async ({ page }) => {
    await seedDraftOnce(page, HALF_DONE)
    await page.goto('/pedido/disena?paso=3')
    await expect(stepTitle(page)).toHaveText('3. Pan')
    await page.reload()
    await expect(stepTitle(page)).toHaveText('3. Pan')
    await openDesignerFromMenu(page)
    await expect(people(page)).toHaveValue('60')
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado', confirmed: [1, 2] })
  })

  test('still makes "Personalizar este pastel" ask before replacing it (D59)', async ({ page }) => {
    await seedDraftOnce(page, HALF_DONE)
    await mockProductDetails(page, [durazno])
    await page.goto('/pedido/disena?pastel=tres-leches-de-durazno')
    await expect(page.getByRole('region', { name: 'Ya tienes un diseño a medias' })).toBeFocused()
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado' })
  })
})

test.describe('placing the order', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await mockDesigner(page)
    await signedIn(page)
    await mockCalendar(page)
    await mockOrders(page, [{ status: 201, body: placedOrder({ items: orderItems }) }])
    await mockPayment(page)
  })

  async function placeOrderFromCart(page: Page) {
    await page.getByRole('link', { name: 'Continuar a entrega' }).click()
    await expect(page).toHaveURL('/pedido/entrega')
    await page.getByRole('button', { name: 'Lunes 16 de noviembre' }).click()
    await page.locator('label').filter({ hasText: /^Tarde/ }).click()
    await page.locator('label').filter({ hasText: /^3:30 pm$/ }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar al pago' }).click()
    await expect(page).toHaveURL(new RegExp(`/pedido/pago\\?pedido=${ORDER_ID}$`))
  }

  test('design, add, check out and place the order: the next design starts from zero', async ({ page }) => {
    await addDesignFromReview(page)
    await card(page).getByRole('link', { name: 'Ir a mi pedido' }).click()
    await placeOrderFromCart(page)
    await page.goto('/pedido/disena')
    await expectFreshDesigner(page)
  })

  test('an edit opened from the cart and left unfinished is dropped once the order is placed', async ({ page }) => {
    await seedCart(page, [designLine])
    await page.goto('/carrito')
    await page.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=/)
    expect(await storedDraft(page)).toMatchObject({ replaces: designLine.designId })
    // Sin agregar el pastel editado, de vuelta al carrito y a pagar el de antes.
    await page.getByRole('banner').getByRole('link', { name: /^Carrito/ }).click()
    await placeOrderFromCart(page)
    await page.goto('/pedido/disena')
    await expectFreshDesigner(page)
  })

  test('another design in progress, never added, survives the order (D49)', async ({ page }) => {
    await seedDraftOnce(page, HALF_DONE)
    await seedCart(page, [designLine])
    await page.goto('/carrito')
    await placeOrderFromCart(page)
    await page.goto('/pedido/disena')
    await expect(people(page)).toHaveValue('60')
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado' })
  })
})

test.describe('signing out', () => {
  test('"Cerrar sesión" clears the draft, like the cart (D77)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockDesigner(page)
    await seedDraftOnce(page, HALF_DONE)
    await signedIn(page)
    await page.goto('/')
    expect(await storedDraft(page)).toMatchObject({ cakeType: 'envinado' })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect.poll(() => storedDraft(page)).toBeNull()
    await page.goto('/pedido/disena')
    await expectFreshDesigner(page)
  })

  test('"Cerrar sesión" while designing empties the designer on screen too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockDesigner(page)
    await seedDraftOnce(page, HALF_DONE)
    await signedIn(page)
    await page.goto('/pedido/disena?paso=3')
    await expect(stepTitle(page)).toHaveText('3. Pan')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expectFreshDesigner(page)
  })

  test('signing out in another tab clears the draft of this one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockStoreInfo(page)
    await signedIn(page)
    await page.goto('/')
    // `sessionStorage` es de cada pestaña: el borrador está en la otra.
    const other = await page.context().newPage()
    await mockStoreInfo(other)
    await mockAuth(other, { refresh: () => opened() })
    await seedDraftOnce(other, HALF_DONE)
    await other.goto('/')
    await expect(other.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    expect(await storedDraft(other)).toMatchObject({ cakeType: 'envinado' })
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(other.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await expect.poll(() => storedDraft(other)).toBeNull()
  })
})

const BACK_TO_DESIGNER = `/entrar?volver=${encodeURIComponent('/pedido/disena')}`

/** El diseñador con la cuenta de `accounts`; nada sale al servidor de desarrollo: lo que no se simula responde 404. */
async function mockAccounts(page: Page, accounts: Accounts) {
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }))
  await mockDesigner(page)
  await withoutGoogle(page)
  await mockSwitchableAccounts(page, accounts)
}

/** Con la cuenta abierta, lleva el borrador a medias del paso 3 al 4 eligiendo el pan. */
async function designUpToFilling(page: Page) {
  await page.goto('/pedido/disena?paso=3')
  await expect(page.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('3. Pan')
  await page.getByRole('radio', { name: /^Chocolate/ }).check()
  await card(page).getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(stepTitle(page)).toHaveText('4. Relleno')
}

/** El borrador guarda de quién es sin guardar el correo. */
async function expectOwnedWithoutEmail(page: Page, email: string) {
  const draft = await storedDraft(page)
  expect(draft?.owner).toEqual(expect.any(String))
  expect(JSON.stringify(draft)).not.toContain(email)
}

/**
 * El borrador es de la cuenta que lo armó (tanda 5). Una sesión que termina sola (vence, la rechaza el servidor) no lo borra,
 * porque la misma cuenta puede volver; pero otra cuenta que entra en la pestaña nunca lo ve. Uno armado sin cuenta pasa a la
 * cuenta con la que se entra, para pagarlo.
 */
test.describe('the draft belongs to the account that built it', () => {
  test('a session that ends on its own keeps it, and another account signing in starts from zero', async ({ page }) => {
    const accounts: Accounts = { current: ana }
    await mockAccounts(page, accounts)
    await seedDraftOnce(page, HALF_DONE)
    await designUpToFilling(page)
    // La sesión termina sola, sin "Cerrar sesión": el borrador se queda.
    accounts.current = null
    await page.reload()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    expect(await storedDraft(page)).toMatchObject({ cakeType: 'envinado', bread: 'chocolate' })
    // Otra cuenta entra en la misma pestaña.
    await page.goto(BACK_TO_DESIGNER)
    await logIn(page, bruno.email)
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
    await expectFreshDesigner(page)
  })

  test('another account signing in from another tab empties the designer on screen', async ({ page }) => {
    const accounts: Accounts = { current: ana }
    await mockAccounts(page, accounts)
    await seedDraftOnce(page, HALF_DONE)
    await designUpToFilling(page)
    accounts.current = null
    await page.reload()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await expect(stepTitle(page)).toHaveText('4. Relleno')
    // `sessionStorage` es de cada pestaña: la otra entra con su cuenta y esta renueva con la cookie nueva.
    const other = await page.context().newPage()
    await mockAccounts(other, accounts)
    await other.goto(`/entrar?volver=${encodeURIComponent('/pedido')}`)
    await logIn(other, bruno.email)
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
    await expectFreshDesigner(page)
  })

  test('the same account coming back after its session ended keeps it', async ({ page }) => {
    const accounts: Accounts = { current: ana }
    await mockAccounts(page, accounts)
    await seedDraftOnce(page, HALF_DONE)
    await designUpToFilling(page)
    accounts.current = null
    await page.reload()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await page.goto(`/entrar?volver=${encodeURIComponent('/pedido/disena?paso=4')}`)
    await logIn(page, ana.email)
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=4$/)
    await expect(stepTitle(page)).toHaveText('4. Relleno')
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado', bread: 'chocolate' })
  })

  test('a reload while the same account is signed in keeps it', async ({ page }) => {
    await mockAccounts(page, { current: ana })
    await seedDraftOnce(page, HALF_DONE)
    await designUpToFilling(page)
    await page.reload()
    await expect(stepTitle(page)).toHaveText('4. Relleno')
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado', bread: 'chocolate' })
    await expectOwnedWithoutEmail(page, ana.email)
  })

  test('a design started without an account is kept after signing in, to pay for it', async ({ page }) => {
    const accounts: Accounts = { current: null }
    await mockAccounts(page, accounts)
    await seedDraftOnce(page, HALF_DONE)
    await page.goto('/pedido/disena?paso=3')
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await expect(stepTitle(page)).toHaveText('3. Pan')
    await page.goto(`/entrar?volver=${encodeURIComponent('/pedido/disena?paso=3')}`)
    await logIn(page, ana.email)
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=3$/)
    await expect(stepTitle(page)).toHaveText('3. Pan')
    expect(await storedDraft(page)).toMatchObject({ people: 60, cakeType: 'envinado', confirmed: [1, 2] })
    await expectOwnedWithoutEmail(page, ana.email)
    // Ya es de Ana: si su sesión termina y entra otra cuenta, no lo hereda.
    accounts.current = null
    await page.reload()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await page.goto(BACK_TO_DESIGNER)
    await logIn(page, bruno.email)
    await expectFreshDesigner(page)
  })

  test('an emptied draft of an account whose session ended has no owner, so a new design on it goes to the next account', async ({ page }) => {
    const accounts: Accounts = { current: ana }
    await mockAccounts(page, accounts)
    // Con Ana adentro, el diseñador vacío queda guardado con su marca.
    await page.goto('/pedido/disena')
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    await expect(people(page)).toHaveValue('40')
    await expect.poll(() => storedDraft(page).then((draft) => draft?.owner ?? null)).toEqual(expect.any(String))
    // Su sesión termina sola; alguien sin cuenta empieza un pastel encima y luego entra con su cuenta.
    accounts.current = null
    await page.reload()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await people(page).fill('60')
    await expect.poll(() => storedDraft(page).then((draft) => draft?.people ?? null)).toBe(60)
    await page.goto(BACK_TO_DESIGNER)
    await logIn(page, bruno.email)
    await expect(page).toHaveURL(/\/pedido\/disena\?paso=1$/)
    await expect(people(page)).toHaveValue('60')
    expect(await storedDraft(page)).toMatchObject({ people: 60 })
  })
})

test.describe('the reference photo (D70)', () => {
  test('after sending one, a new reference starts with an empty form', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await mockStoreInfo(page)
    await mockCakeDesignOptions(page)
    await signedIn(page)
    await mockReferenceImages(page)
    await mockReferences(page)
    await page.goto('/pedido/referencia')
    await page.locator('input[type="file"]').setInputFiles([photo('referencia-boda.png')])
    await page.getByLabel('¿Qué quieres que tomemos de la foto?').fill('La decoración de flores en tonos durazno')
    await page.getByLabel('¿Para cuántas personas?').fill('40')
    await page.getByLabel('Fecha del evento').fill('2026-11-21')
    await page.getByRole('group', { name: 'Elige el tipo de pastel' }).getByRole('radio', { name: 'Tres leches' }).check()
    await page.getByRole('group', { name: 'Elige el pan' }).getByRole('radio', { name: /^Chocolate/ }).check()
    await page.getByRole('group', { name: 'Primero, la base del relleno' }).getByRole('radio', { name: 'Normal' }).check()
    await page.getByRole('radio', { name: 'Fresa', exact: true }).check()
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(page).toHaveURL(/\/pedido\/referencia\/enviada\?solicitud=7$/)

    await page.getByRole('banner').getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Realizar pedido' }).click()
    await page.getByRole('link', { name: 'Enviar referencia' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Envía tu referencia')
    await expect(page.getByRole('list', { name: 'Fotos elegidas' })).toHaveCount(0)
    await expect(page.getByLabel('¿Qué quieres que tomemos de la foto?')).toHaveValue('')
    await expect(page.getByLabel('¿Para cuántas personas?')).toHaveValue('')
    await expect(page.getByRole('group', { name: 'Elige el tipo de pastel' }).getByRole('radio', { name: 'Tres leches' })).not.toBeChecked()
  })
})
