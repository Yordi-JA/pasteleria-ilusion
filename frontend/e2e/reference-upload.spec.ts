import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockAuth, signedIn } from './support/auth.ts'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { NOW } from './support/checkout.ts'
import { heavyPhoto, imageId, mockReferenceImages, mockReferences, photo, referenceRequest } from './support/references.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/referencia` (D70, frontend): las fotos con su vista previa, el tope y sus errores, los datos de la
 * solicitud, la subida con `purpose=reference`, el envío con `Idempotency-Key` y los errores del servidor bajo su campo.
 */

const UPLOAD = '/pedido/referencia'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

const fileInput = (page: Page) => page.locator('input[type="file"]')
const photos = (page: Page) => page.getByRole('list', { name: 'Fotos elegidas' })
const submit = (page: Page) => page.getByRole('button', { name: 'Enviar solicitud' })
const alert = (page: Page) => page.getByRole('alert')
const typeGroup = (page: Page) => page.getByRole('group', { name: 'Elige el tipo de pastel' })
const breadGroup = (page: Page) => page.getByRole('group', { name: 'Elige el pan' })
const baseGroup = (page: Page) => page.getByRole('group', { name: 'Primero, la base del relleno' })

/** El sabor, con las opciones y las reglas de los pasos 2 a 4 de "Diseña tu pastel": tres leches de chocolate, Normal de fresa y nuez. */
async function chooseFlavor(page: Page) {
  await typeGroup(page).getByRole('radio', { name: 'Tres leches' }).check()
  await breadGroup(page).getByRole('radio', { name: /^Chocolate/ }).check()
  await baseGroup(page).getByRole('radio', { name: 'Normal' }).check()
  await page.getByRole('radio', { name: /Dos sabores/ }).check()
  await page.getByRole('checkbox', { name: 'Fresa', exact: true }).check()
  await page.getByRole('checkbox', { name: /^Nuez/ }).check()
}

async function fillForm(page: Page) {
  await page.getByLabel('¿Qué quieres que tomemos de la foto?').fill('La decoración de flores, pero en tonos durazno y de 2 pisos')
  await page.getByLabel('¿Para qué ocasión es?').selectOption({ label: 'XV años' })
  await page.getByLabel('¿Para cuántas personas?').fill('40')
  await page.getByLabel('Fecha del evento').fill('2026-11-21')
  await page.getByLabel('Presupuesto aproximado').fill('$1,500')
  await chooseFlavor(page)
}

test('without a session it asks to sign in and comes back here', async ({ page }) => {
  await mockAuth(page)
  await page.goto(UPLOAD)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Freferencia$/)
})

test('sends the photos and the request, then shows the sent page', async ({ page }) => {
  await signedIn(page)
  const images = await mockReferenceImages(page)
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Envía tu referencia')
  await expect(page).toHaveTitle('Envía tu referencia · Pastelería Ilusión')
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Realizar pedido')
  await expect(page.getByRole('heading', { name: 'Qué sigue' })).toBeVisible()
  await expect(page.getByText('No se cobra nada hasta que aceptes la cotización.')).toBeVisible()

  await fileInput(page).setInputFiles([photo('referencia-boda.png'), photo('colores-flores.png')])
  await expect(photos(page).getByRole('listitem')).toHaveCount(2)
  await expect(photos(page)).toContainText('referencia-boda.png')
  await expect(photos(page).getByRole('img', { name: 'Vista previa de colores-flores.png' })).toBeVisible()
  // Quitar una y volver a elegirla.
  await page.getByRole('button', { name: 'Quitar colores-flores.png' }).click()
  await expect(photos(page).getByRole('listitem')).toHaveCount(1)
  await fileInput(page).setInputFiles([photo('colores-flores.png')])
  await expect(photos(page).getByRole('listitem')).toHaveCount(2)

  await fillForm(page)
  await submit(page).click()
  await expect(page).toHaveURL(/\/pedido\/referencia\/enviada\?solicitud=7$/)

  expect(images.uploads).toHaveLength(2)
  expect(images.uploads[0].postData()).toContain('reference')
  expect(references.creates).toHaveLength(1)
  const create = references.creates[0]
  expect(create.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  expect(create.postDataJSON()).toEqual({
    image_ids: [imageId(1), imageId(2)],
    description: 'La decoración de flores, pero en tonos durazno y de 2 pisos',
    occasion: 'quinceanera',
    people: 40,
    event_date: '2026-11-21',
    budget: '1500.00',
    cake_type: 'tres_leches',
    bread: 'chocolate',
    filling_base: 'normal',
    filling_flavors: ['fresa', 'nuez'],
  })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibimos tu solicitud')
})

test('the optional fields go empty: no occasion and no budget', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('idea.png')])
  await page.getByLabel('¿Qué quieres que tomemos de la foto?').fill('Los colores')
  await page.getByLabel('¿Para cuántas personas?').fill('20')
  await page.getByLabel('Fecha del evento').fill('2026-11-21')
  await chooseFlavor(page)
  await submit(page).click()
  await expect(page).toHaveURL(/enviada\?solicitud=7$/)
  expect(references.creates[0].postDataJSON()).toMatchObject({ occasion: '', budget: null, people: 20 })
})

test('the browser checks what it can before sending and moves the focus to the alert', async ({ page }) => {
  await signedIn(page)
  const images = await mockReferenceImages(page)
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await page.getByLabel('Presupuesto aproximado').fill('mil pesos')
  await submit(page).click()
  await expect(alert(page)).toContainText('Revisa tu solicitud')
  await expect(page.getByRole('group', { name: 'Fotos de referencia' })).toContainText('Elige al menos una foto de referencia.')
  await expect(page.getByLabel('¿Qué quieres que tomemos de la foto?')).toHaveAccessibleDescription(/Cuéntanos qué quieres que tomemos de la foto\./)
  await expect(page.getByLabel('¿Para cuántas personas?')).toHaveAccessibleDescription(/Indica para cuántas personas es\./)
  await expect(page.getByLabel('Fecha del evento')).toHaveAccessibleDescription(/Elige la fecha del evento\./)
  await expect(page.getByLabel('Presupuesto aproximado')).toHaveAccessibleDescription(/Escribe el presupuesto con número/)
  await expect(typeGroup(page)).toHaveAccessibleDescription('Elige el tipo de pastel.')
  await expect(breadGroup(page)).toHaveAccessibleDescription('Elige el pan.')
  await expect(page.getByTestId('referencia-aviso')).toBeFocused()
  expect(images.uploads).toHaveLength(0)
  expect(references.creates).toHaveLength(0)
})

test('it takes at most 3 photos and says so; the server cap goes under the photos', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, { create: [{ status: 400, body: { image_ids: ['Puedes mandar hasta 2 fotos.'] } }] })
  await page.goto(UPLOAD)
  await expect(page.getByText('Hasta 3 fotos, JPG, PNG o WebP de hasta 5 MB cada una')).toBeVisible()
  await fileInput(page).setInputFiles([photo('a.png'), photo('b.png'), photo('c.png'), photo('d.png')])
  await expect(photos(page).getByRole('listitem')).toHaveCount(3)
  await expect(page.getByText('Caben 3 fotos. No agregamos d.png.')).toBeVisible()
  await expect(fileInput(page)).toBeDisabled()
  await expect(page.getByText('Ya tienes 3 fotos, el máximo. Quita una para cambiarla.')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar c.png' }).click()
  await expect(fileInput(page)).toBeEnabled()

  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('Puedes mandar hasta 2 fotos.')
  await expect(page.getByRole('group', { name: 'Fotos de referencia' })).toContainText('Puedes mandar hasta 2 fotos.')
  expect(references.creates).toHaveLength(1)
})

test('a photo that is too heavy shows its error on its row and is never uploaded', async ({ page }) => {
  await signedIn(page)
  const images = await mockReferenceImages(page)
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('referencia-boda.png'), heavyPhoto('colores-flores.png')])
  const heavy = photos(page).getByRole('listitem').filter({ hasText: 'colores-flores.png' })
  await expect(heavy).toContainText('Pesa más de 5 MB, el máximo. Prueba con una foto más ligera.')
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('Quita las fotos con error para enviar tu solicitud.')
  expect(images.uploads).toHaveLength(0)
  await page.getByRole('button', { name: 'Quitar colores-flores.png' }).click()
  await submit(page).click()
  await expect(page).toHaveURL(/enviada\?solicitud=7$/)
  expect(images.uploads).toHaveLength(1)
  expect(references.creates).toHaveLength(1)
})

test('a photo the server rejects shows the error on its row, and a retry does not upload the good one again', async ({ page }) => {
  await signedIn(page)
  const images = await mockReferenceImages(page, [
    { status: 201, body: { id: imageId(1), purpose: 'reference' } },
    { status: 400, body: { image: ['No es una imagen JPG, PNG o WebP que se pueda abrir.'] } },
    { status: 201, body: { id: imageId(3), purpose: 'reference' } },
  ])
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('referencia-boda.png'), photo('dañada.png')])
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('Una foto no se pudo subir')
  await expect(photos(page).getByRole('listitem').filter({ hasText: 'dañada.png' })).toContainText('No es una imagen JPG, PNG o WebP que se pueda abrir.')
  expect(references.creates).toHaveLength(0)
  await page.getByRole('button', { name: 'Quitar dañada.png' }).click()
  await fileInput(page).setInputFiles([photo('otra.png')])
  await submit(page).click()
  await expect(page).toHaveURL(/enviada\?solicitud=7$/)
  expect(images.uploads).toHaveLength(3)
  expect(references.creates[0].postDataJSON().image_ids).toEqual([imageId(1), imageId(3)])
})

test('each 400 of the server goes under its field and in the alert', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, {
    create: [
      {
        status: 400,
        body: {
          description: ['Tu descripción lleva caracteres que no se pueden mostrar.'],
          people: ['Para tantas personas, escríbenos por WhatsApp.'],
          event_date: ['Los pedidos se hacen con al menos 2 días de anticipación.'],
          budget: ['El presupuesto no puede ser negativo.'],
          occasion: ['Elige una ocasión de la lista.'],
          non_field_errors: ['Ya tienes una solicitud en revisión. Espera su cotización o cancélala.'],
        },
      },
    ],
  })
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('idea.png')])
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('No pudimos enviar tu solicitud')
  await expect(alert(page)).toContainText('Ya tienes una solicitud en revisión. Espera su cotización o cancélala.')
  await expect(page.getByLabel('¿Qué quieres que tomemos de la foto?')).toHaveAccessibleDescription(/caracteres que no se pueden mostrar/)
  await expect(page.getByLabel('¿Para cuántas personas?')).toHaveAccessibleDescription(/escríbenos por WhatsApp/)
  await expect(page.getByLabel('Fecha del evento')).toHaveAccessibleDescription(/al menos 2 días de anticipación/)
  await expect(page.getByLabel('Presupuesto aproximado')).toHaveAccessibleDescription(/no puede ser negativo/)
  await expect(page.getByLabel('¿Para qué ocasión es?')).toHaveAccessibleDescription(/Elige una ocasión de la lista/)
  await expect(page.getByLabel('Fecha del evento')).toHaveAttribute('aria-invalid', 'true')
})

test('the flavor errors of the server (rule 4.7) go under their field and in the alert', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, {
    create: [
      {
        status: 400,
        body: {
          cake_type: ['Elige un tipo de pastel de la lista.'],
          bread: ['Red velvet: solo en pastel seco.'],
          filling_base: ['Este pan ya trae su relleno; no se elige otro.'],
          people: ['En línea el máximo es 50 kg. Para más, escríbenos por WhatsApp.'],
        },
      },
    ],
  })
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('idea.png')])
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('Red velvet: solo en pastel seco.')
  await expect(typeGroup(page)).toHaveAccessibleDescription('Elige un tipo de pastel de la lista.')
  await expect(breadGroup(page)).toHaveAccessibleDescription('Red velvet: solo en pastel seco.')
  await expect(baseGroup(page)).toHaveAccessibleDescription('Este pan ya trae su relleno; no se elige otro.')
  await expect(page.getByLabel('¿Para cuántas personas?')).toHaveAccessibleDescription(/En línea el máximo es 50 kg/)
})

test('a bread with its own filling does not let you choose a filling, and sends none', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page)
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('idea.png')])
  await page.getByLabel('¿Qué quieres que tomemos de la foto?').fill('Los colores')
  await page.getByLabel('¿Para cuántas personas?').fill('40')
  await page.getByLabel('Fecha del evento').fill('2026-11-21')
  await typeGroup(page).getByRole('radio', { name: 'Tres leches' }).check()
  // Red velvet solo va en seco: se ve, desactivado y con su motivo (regla 4.7).
  await expect(breadGroup(page).getByRole('radio', { name: 'Red velvet' })).toBeDisabled()
  await expect(baseGroup(page)).toBeVisible()
  await breadGroup(page).getByRole('radio', { name: 'Choco-pingüino' }).check()
  await expect(baseGroup(page)).toHaveCount(0)
  await expect(page.getByText('Tu pan Choco-pingüino ya trae su relleno')).toBeVisible()
  await submit(page).click()
  await expect(page).toHaveURL(/enviada\?solicitud=7$/)
  expect(references.creates[0].postDataJSON()).toMatchObject({ cake_type: 'tres_leches', bread: 'choco_pinguino', filling_base: null, filling_flavors: [] })
})

test('a new type that does not take the chosen bread drops it and says why', async ({ page }) => {
  await signedIn(page)
  await page.goto(UPLOAD)
  await typeGroup(page).getByRole('radio', { name: 'Tres leches' }).check()
  await breadGroup(page).getByRole('radio', { name: 'Choco-pingüino' }).check()
  await typeGroup(page).getByRole('radio', { name: 'Envinado' }).check()
  await expect(breadGroup(page).getByRole('radio', { name: 'Choco-pingüino' })).not.toBeChecked()
  await expect(breadGroup(page)).toHaveAccessibleDescription(/Tu pan Choco-pingüino no se combina con pastel envinado\./)
  await expect(baseGroup(page)).toBeVisible()
})

test('a retry after a network failure sends the same key and does not upload again; a change is a new attempt', async ({ page }) => {
  await signedIn(page)
  const images = await mockReferenceImages(page)
  const references = await mockReferences(page, { create: ['abort', { status: 400, body: { people: ['Indica para cuántas personas es.'] } }, { status: 201, body: referenceRequest() }] })
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('referencia-boda.png'), photo('colores-flores.png')])
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('No pudimos conectar con la pastelería')
  await submit(page).click()
  await expect(alert(page)).toContainText('Indica para cuántas personas es.')
  expect(references.creates).toHaveLength(2)
  const first = references.creates[0].headers()['idempotency-key']
  expect(references.creates[1].headers()['idempotency-key']).toBe(first)
  // La llave vive en `sessionStorage` (no un token ni datos de la cuenta).
  expect(await page.evaluate(() => sessionStorage.getItem('ilusion.reference.v1'))).toContain(first)
  expect(images.uploads).toHaveLength(2)

  await page.getByLabel('¿Para cuántas personas?').fill('45')
  await submit(page).click()
  await expect(page).toHaveURL(/enviada\?solicitud=7$/)
  expect(references.creates[2].headers()['idempotency-key']).not.toBe(first)
  expect(images.uploads).toHaveLength(2)
  expect(await page.evaluate(() => sessionStorage.getItem('ilusion.reference.v1'))).toBeNull()
})

test('a 429 says to wait', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page, { create: [{ status: 429, body: { detail: 'Demasiadas solicitudes.' } }] })
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('idea.png')])
  await fillForm(page)
  await submit(page).click()
  await expect(alert(page)).toContainText('Mandaste varias solicitudes seguidas. Espera unos minutos y vuelve a intentarlo.')
})

test('keyboard: the photo picker opens with the keyboard and Quitar is a real button', async ({ page }) => {
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page)
  await page.goto(UPLOAD)
  await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Realizar pedido' }).focus()
  await page.keyboard.press('Tab')
  await expect(fileInput(page)).toBeFocused()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Space')
  await (await chooser).setFiles([photo('idea.png')])
  await expect(photos(page).getByRole('listitem')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Quitar idea.png' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(photos(page)).toHaveCount(0)
  await expect(fileInput(page)).toBeFocused()
})

test('mobile at 390 px: one column, no horizontal scroll, the form before "Qué sigue"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockReferenceImages(page)
  await mockReferences(page)
  await page.goto(UPLOAD)
  await fileInput(page).setInputFiles([photo('un-nombre-de-archivo-muy-largo-para-la-foto-de-referencia.png')])
  await expect(photos(page).getByRole('listitem')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const form = await page.getByRole('heading', { name: 'Tu referencia', exact: true }).boundingBox()
  const next = await page.getByRole('heading', { name: 'Qué sigue' }).boundingBox()
  expect(form && next && form.y < next.y && Math.abs(form.x - next.x) < 2).toBe(true)
})
