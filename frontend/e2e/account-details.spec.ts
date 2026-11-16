import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anaAccount, ginaAccount, ginaUser, mockAccount, NEW_ACCESS } from './support/account.ts'
import { CSRF_TOKEN, mockAuth, signedIn } from './support/auth.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/cuenta/datos` (D72, mockup `CuentaDatos`): datos personales, avisos del pedido y cambio de contraseña. */

const SAVED = 'Tus cambios se guardaron.'
const SAVING = 'Guardando tus cambios…'
const PASSWORD_CHANGED = 'Cambiamos tu contraseña. Cerramos tu sesión en los demás dispositivos.'
const WHATSAPP_NEEDS_PHONE = 'Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales.'

const nameField = (page: Page) => page.getByRole('textbox', { name: 'Nombre completo' })
const phoneField = (page: Page) => page.getByRole('textbox', { name: /Teléfono o WhatsApp/ })
const emailField = (page: Page) => page.getByRole('textbox', { name: 'Correo electrónico' })
const emailNotice = (page: Page) => page.getByRole('checkbox', { name: 'Correo electrónico' })
const whatsapp = (page: Page) => page.getByRole('checkbox', { name: 'WhatsApp' })
const save = (page: Page) => page.getByRole('button', { name: 'Guardar cambios' })
const passwordToggle = (page: Page) => page.getByRole('button', { name: 'Cambiar contraseña' })
const currentPassword = (page: Page) => page.getByLabel('Contraseña actual', { exact: true })
const newPassword = (page: Page) => page.getByLabel('Contraseña nueva', { exact: true })
const savePassword = (page: Page) => page.getByRole('button', { name: 'Guardar contraseña' })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

test('without a session it asks to sign in and comes back', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/cuenta/datos')
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fdatos$/)
})

test('loads the account with its data, the email read only and the notices', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await expect(page).toHaveTitle('Datos y avisos · Pastelería Ilusión')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  await expect(page.getByRole('heading', { level: 2, name: 'Datos y avisos' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Datos personales' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Avisos del pedido' })).toBeVisible()
  expect(calls.get[0].headers().authorization).toBe('Bearer access-de-prueba')

  await expect(nameField(page)).toHaveValue('Ana López García')
  await expect(phoneField(page)).toHaveValue('55 1234 5678')
  await expect(phoneField(page)).toHaveAccessibleDescription('10 dígitos.')
  await expect(emailField(page)).toHaveValue('ana@correo.test')
  await expect(emailField(page)).toHaveAttribute('readonly', '')
  await expect(emailField(page)).toHaveAccessibleDescription('Es el correo con el que entras.')

  await expect(page.getByText('Elige por dónde te avisamos.')).toBeVisible()
  await expect(emailNotice(page)).toBeChecked()
  await expect(emailNotice(page)).toBeDisabled()
  await expect(emailNotice(page)).toHaveAccessibleDescription(/ana@correo\.test.*Siempre te avisamos por correo/)
  await expect(whatsapp(page)).not.toBeChecked()
  await expect(whatsapp(page)).toHaveAccessibleDescription('Usa el teléfono de tus datos personales.')

  await expect(passwordToggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(currentPassword(page)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/stand|bizcocho|cotizador/i)
})

test('shows a loading state with a screen reader label while the account loads', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, { get: () => ({ status: 200, body: anaAccount, delayMs: 600 }) })
  await page.goto('/cuenta/datos')
  await expect(page.getByRole('status').filter({ hasText: 'Cargando tus datos' })).toBeAttached()
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await expect(nameField(page)).toHaveValue('Ana López García')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
})

test('a failed load says so and retries', async ({ page }) => {
  await signedIn(page)
  let fail = true
  await mockAccount(page, anaAccount, { get: () => (fail ? { status: 500, body: { detail: 'Error' } } : { status: 200, body: anaAccount }) })
  await page.goto('/cuenta/datos')
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar tus datos')
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(nameField(page)).toHaveValue('Ana López García')
})

test('a Google account says so and has no password form', async ({ page }) => {
  await signedIn(page, ginaUser)
  await mockAccount(page, ginaAccount)
  await page.goto('/cuenta/datos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Gina')
  await expect(emailField(page)).toHaveValue('gina@gmail.com')
  await expect(emailField(page)).toHaveAccessibleDescription('Vinculado a tu cuenta de Google.')
  await expect(phoneField(page)).toHaveValue('')
  await expect(nameField(page)).toHaveValue('Gina Soto')
  await expect(passwordToggle(page)).toHaveCount(0)
  await expect(currentPassword(page)).toHaveCount(0)
  await expect(page.getByText('Contraseña', { exact: true })).toHaveCount(0)
})

test('saves the changes, says so in words and updates the greeting', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page, anaAccount, {
    patch: (request) => {
      const changes = request.postDataJSON() as Record<string, unknown>
      return { status: 200, body: { ...anaAccount, ...changes }, delayMs: 500 }
    },
  })
  await page.goto('/cuenta/datos')
  await nameField(page).fill('Mariana Ruiz')
  await phoneField(page).fill('55-8765-4321')
  await whatsapp(page).check()
  await save(page).click()

  await expect(page.getByRole('status').filter({ hasText: SAVING })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  expect(calls.patch).toHaveLength(1)
  expect(calls.patch[0].postDataJSON()).toEqual({ full_name: 'Mariana Ruiz', phone: '5587654321', notify_whatsapp: true })
  expect(calls.patch[0].headers().authorization).toBe('Bearer access-de-prueba')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Mariana')
  await expect(phoneField(page)).toHaveValue('55 8765 4321')
  await expect(whatsapp(page)).toBeChecked()

  // Un cambio nuevo deja de decir "guardado".
  await nameField(page).fill('Mariana Ruiz Peña')
  await expect(page.getByText(SAVED)).toHaveCount(0)
})

test('shows the server errors under each field and keeps the greeting', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, {
    patch: () => ({
      status: 400,
      body: {
        full_name: ['Escribe tu nombre solo con letras, espacios y signos comunes.'],
        phone: ['Escribe 10 dígitos, por ejemplo 55 1234 5678.'],
      },
    }),
  })
  await page.goto('/cuenta/datos')
  await nameField(page).fill('Ana Nueva')
  await save(page).click()

  await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(nameField(page)).toHaveAccessibleDescription('Escribe tu nombre solo con letras, espacios y signos comunes.')
  await expect(phoneField(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(phoneField(page)).toHaveAccessibleDescription(/Escribe 10 dígitos, por ejemplo 55 1234 5678\./)
  await expect(nameField(page)).toBeFocused()
  await expect(page.getByText(SAVED)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
})

test('a read-only field rejected by the server is shown as a notice', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, { patch: () => ({ status: 400, body: { email: ['Este dato no se cambia desde aquí.'] } }) })
  await page.goto('/cuenta/datos')
  await save(page).click()
  await expect(page.getByRole('alert')).toContainText('No se pudieron guardar tus cambios.')
  await expect(page.getByRole('alert')).toContainText('Este dato no se cambia desde aquí.')
})

test('a failed save keeps what was typed and says so', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, { patch: () => ({ status: 500, body: { detail: 'Error' } }) })
  await page.goto('/cuenta/datos')
  await nameField(page).fill('Ana Cambiada')
  await save(page).click()
  await expect(page.getByRole('alert')).toContainText('No se pudieron guardar tus cambios.')
  await expect(nameField(page)).toHaveValue('Ana Cambiada')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
})

test('WhatsApp without a phone is explained before sending', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await phoneField(page).fill('')
  await whatsapp(page).check()
  await save(page).click()
  await expect(whatsapp(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(whatsapp(page)).toHaveAccessibleDescription(new RegExp(WHATSAPP_NEEDS_PHONE))
  await expect(whatsapp(page)).toBeFocused()
  expect(calls.patch).toHaveLength(0)

  // Con el teléfono, se guarda.
  await phoneField(page).fill('5512345678')
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  expect(calls.patch[0].postDataJSON()).toEqual({ full_name: 'Ana López García', phone: '5512345678', notify_whatsapp: true })
})

test('WhatsApp without a phone from the server is shown under the checkbox', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, { patch: () => ({ status: 400, body: { notify_whatsapp: [WHATSAPP_NEEDS_PHONE] } }) })
  await page.goto('/cuenta/datos')
  await whatsapp(page).check()
  await save(page).click()
  await expect(whatsapp(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText(WHATSAPP_NEEDS_PHONE)).toBeVisible()
})

test('an empty name or a short phone is explained before sending', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await nameField(page).fill('   ')
  await phoneField(page).fill('55 1234')
  await save(page).click()
  await expect(nameField(page)).toHaveAccessibleDescription('Escribe tu nombre.')
  await expect(phoneField(page)).toHaveAccessibleDescription(/Escribe 10 dígitos, por ejemplo 55 1234 5678\./)
  await expect(nameField(page)).toBeFocused()
  expect(calls.patch).toHaveLength(0)
})

test('changes the password, keeps the session and uses the new access', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await passwordToggle(page).click()
  await expect(passwordToggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(newPassword(page)).toHaveAccessibleDescription('Mínimo 8 caracteres.')
  await currentPassword(page).fill('pastel-de-fresa-2026')
  await newPassword(page).fill('merengue-de-limon-77')
  await savePassword(page).click()

  await expect(page.getByRole('status').filter({ hasText: PASSWORD_CHANGED })).toBeVisible()
  expect(calls.password).toHaveLength(1)
  expect(calls.password[0].postDataJSON()).toEqual({ current_password: 'pastel-de-fresa-2026', new_password: 'merengue-de-limon-77' })
  expect(calls.password[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
  expect(calls.password[0].headers().authorization).toBe('Bearer access-de-prueba')
  await expect(currentPassword(page)).toHaveCount(0)
  await expect(passwordToggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(passwordToggle(page)).toBeFocused()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')

  // La sesión sigue con el access nuevo.
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  expect(calls.patch[0].headers().authorization).toBe(`Bearer ${NEW_ACCESS}`)
})

test('a wrong current password is shown under its field and the session stays', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page, anaAccount, {
    password: () => ({
      status: 400,
      body: {
        current_password: ['Tu contraseña actual no coincide.'],
        new_password: ['Esa contraseña es muy común. Elige otra.'],
        codes: { current_password: ['wrong_password'], new_password: ['password_too_common'] },
      },
    }),
  })
  await page.goto('/cuenta/datos')
  await passwordToggle(page).click()
  await currentPassword(page).fill('no-es-la-mia-123')
  await newPassword(page).fill('password123')
  await savePassword(page).click()

  await expect(currentPassword(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(currentPassword(page)).toHaveAccessibleDescription('Tu contraseña actual no coincide.')
  await expect(newPassword(page)).toHaveAccessibleDescription(/Esa contraseña es muy común\. Elige otra\./)
  await expect(currentPassword(page)).toBeFocused()
  await expect(page.getByText(PASSWORD_CHANGED)).toHaveCount(0)
  expect(calls.password).toHaveLength(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
})

test('the password form explains empty and short passwords before sending', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await passwordToggle(page).click()
  await savePassword(page).click()
  await expect(currentPassword(page)).toHaveAccessibleDescription('Escribe tu contraseña actual.')
  await expect(newPassword(page)).toHaveAccessibleDescription(/Escribe la contraseña nueva\./)
  await currentPassword(page).fill('pastel-de-fresa-2026')
  await newPassword(page).fill('corta')
  await savePassword(page).click()
  await expect(newPassword(page)).toHaveAccessibleDescription(/Te faltan caracteres: el mínimo es 8\./)
  expect(calls.password).toHaveLength(0)

  // "Cancelar" cierra el formulario y lo vacía.
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(currentPassword(page)).toHaveCount(0)
  await expect(passwordToggle(page)).toBeFocused()
  await passwordToggle(page).click()
  await expect(currentPassword(page)).toHaveValue('')
})

test('too many password attempts are explained with the wait', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page, anaAccount, {
    password: () => ({ status: 429, body: { detail: 'Request was throttled.' }, headers: { 'Retry-After': '600' } }),
  })
  await page.goto('/cuenta/datos')
  await passwordToggle(page).click()
  await currentPassword(page).fill('pastel-de-fresa-2026')
  await newPassword(page).fill('merengue-de-limon-77')
  await savePassword(page).click()
  await expect(page.getByRole('alert')).toContainText('muchos intentos')
  await expect(page.getByRole('alert')).toContainText('Espera 10 minutos')
})

test('works with the keyboard', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page)
  await page.goto('/cuenta/datos')
  await nameField(page).focus()
  await page.keyboard.press('Tab')
  await expect(phoneField(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(emailField(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(passwordToggle(page)).toBeFocused()
  await page.keyboard.press('Tab')
  // La casilla del correo no se puede quitar: no es una parada.
  await expect(whatsapp(page)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(whatsapp(page)).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(save(page)).toBeFocused()

  // Enter en un campo guarda.
  await nameField(page).fill('Ana María López')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  expect(calls.patch[0].postDataJSON()).toMatchObject({ full_name: 'Ana María López', notify_whatsapp: true })

  // El formulario de la contraseña se abre con Enter y Enter en él cambia la contraseña, no los datos.
  await passwordToggle(page).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(currentPassword(page)).toBeFocused()
  await page.keyboard.type('pastel-de-fresa-2026')
  await newPassword(page).focus()
  await page.keyboard.type('merengue-de-limon-77')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: PASSWORD_CHANGED })).toBeVisible()
  expect(calls.password).toHaveLength(1)
  expect(calls.patch).toHaveLength(1)
})

test('at 1440 px the two cards sit side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await signedIn(page)
  await mockAccount(page)
  await page.goto('/cuenta/datos')
  const personal = await page.getByRole('heading', { level: 3, name: 'Datos personales' }).boundingBox()
  const notices = await page.getByRole('heading', { level: 3, name: 'Avisos del pedido' }).boundingBox()
  expect(personal && notices).toBeTruthy()
  expect(notices!.x).toBeGreaterThan(personal!.x + 400)
  expect(Math.abs(notices!.y - personal!.y)).toBeLessThan(4)
  // Nombre y teléfono, en la misma fila.
  const name = await nameField(page).boundingBox()
  const phone = await phoneField(page).boundingBox()
  expect(Math.abs(name!.y - phone!.y)).toBeLessThan(4)
  await expect(page.getByRole('navigation', { name: 'Tu cuenta' }).getByRole('link', { name: 'Datos y avisos' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('at 390 px everything stacks without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockAccount(page)
  await page.goto('/cuenta/datos')
  await expect(nameField(page)).toHaveValue('Ana López García')
  await passwordToggle(page).click()
  const personal = await page.getByRole('heading', { level: 3, name: 'Datos personales' }).boundingBox()
  const notices = await page.getByRole('heading', { level: 3, name: 'Avisos del pedido' }).boundingBox()
  expect(notices!.y).toBeGreaterThan(personal!.y)
  const name = await nameField(page).boundingBox()
  const phone = await phoneField(page).boundingBox()
  expect(phone!.y).toBeGreaterThan(name!.y)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // El menú de la cuenta dice en qué sección está.
  await expect(page.getByRole('button', { name: 'Datos y avisos' })).toBeVisible()
})

// --- Revisión única (D72) ---

test('while saving the fields are locked, so nothing typed is lost', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page, anaAccount, {
    patch: (request) => ({ status: 200, body: { ...anaAccount, ...(request.postDataJSON() as object) }, delayMs: 1500 }),
  })
  await page.goto('/cuenta/datos')
  await nameField(page).fill('Mariana Ruiz')
  await save(page).click()
  await expect(page.getByRole('status').filter({ hasText: SAVING })).toBeVisible()
  await expect(nameField(page)).toHaveAttribute('readonly', '')
  await expect(phoneField(page)).toHaveAttribute('readonly', '')
  await expect(whatsapp(page)).toBeDisabled()
  await nameField(page).focus()
  await page.keyboard.type(' Peña')
  await expect(nameField(page)).toHaveValue('Mariana Ruiz')

  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  await expect(nameField(page)).toHaveValue('Mariana Ruiz')
  await expect(nameField(page)).not.toHaveAttribute('readonly', '')
  await expect(whatsapp(page)).toBeEnabled()
  expect(calls.patch).toHaveLength(1)
})

test('a double click saves once', async ({ page }) => {
  await signedIn(page)
  const calls = await mockAccount(page, anaAccount, {
    patch: (request) => ({ status: 200, body: { ...anaAccount, ...(request.postDataJSON() as object) }, delayMs: 800 }),
  })
  await page.goto('/cuenta/datos')
  await save(page).dblclick()
  await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible()
  expect(calls.patch).toHaveLength(1)
})

for (const reply of [
  { status: 413, body: { detail: 'La petición es demasiado grande.' } },
  { status: 400, body: { detail: 'JSON inválido.' } },
]) {
  test(`a ${reply.status} without field errors asks to try again, not to check the connection`, async ({ page }) => {
    await signedIn(page)
    await mockAccount(page, anaAccount, { patch: () => reply })
    await page.goto('/cuenta/datos')
    await save(page).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('No se pudieron guardar tus cambios.')
    await expect(alert).toContainText('Inténtalo de nuevo')
    await expect(alert).not.toContainText('Revisa tu conexión')
  })
}

test('the email notice is drawn checked in mermelada and shows only the email', async ({ page }) => {
  await signedIn(page)
  await mockAccount(page)
  await page.goto('/cuenta/datos')
  await expect(emailNotice(page)).toHaveCSS('background-color', 'rgb(94, 25, 33)')
  await expect(page.getByText('Siempre te avisamos por correo; esta casilla no se puede quitar.')).toHaveClass(/sr-only/)
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Avisos del pedido' }) }).getByText('ana@correo.test', { exact: true })).toBeVisible()
})
