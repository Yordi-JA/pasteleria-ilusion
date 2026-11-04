import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** El anillo de foco del libro de marca: 2px sólido, 2px de separación, en `mermelada` (#5e1921). */
async function expectFocusRing(locator: Locator, color = 'rgb(94, 25, 33)') {
  await expect(locator).toHaveCSS('outline-style', 'solid')
  await expect(locator).toHaveCSS('outline-width', '2px')
  await expect(locator).toHaveCSS('outline-offset', '2px')
  await expect(locator).toHaveCSS('outline-color', color)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/muestra')
  await expect(page.getByRole('heading', { level: 1, name: 'Muestra de componentes' })).toBeVisible()
})

test('button: keyboard focus shows the ring and Enter activates it', async ({ page }) => {
  const primary = page.getByRole('button', { name: 'Agregar al pedido' })
  await expect(primary).toHaveCSS('cursor', 'pointer')
  await primary.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(primary).toBeFocused()
  await expectFocusRing(primary)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Agregado al pedido' })).toBeVisible()
})

/** Recorre el teclado y comprueba que ningún control deshabilitado recibe el foco. */
async function tabThroughNever(page: Page, start: Locator, disabled: Locator[], presses = 14) {
  await start.focus()
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab')
    for (const control of disabled) await expect(control).not.toBeFocused()
  }
}

test('button: disabled ones keep their size, are skipped by Tab and use not-allowed', async ({ page }) => {
  const disabled = page.getByRole('button', { name: 'Calculando…' })
  await expect(disabled).toBeDisabled()
  await expect(disabled).toHaveCSS('cursor', 'not-allowed')
  await expect(disabled).toHaveCSS('border-top-style', 'dashed')
  const enabled = page.getByRole('button', { name: 'Realizar pedido' })
  const sizeOf = async (l: Locator) => (await l.boundingBox())!.height
  expect(await sizeOf(disabled)).toBe(await sizeOf(enabled))
  expect(await sizeOf(disabled)).toBeGreaterThanOrEqual(44)
  await expect(disabled).toHaveCSS('border-top-width', '2px')
  await expect(enabled).toHaveCSS('border-top-width', '2px')
  const onColorDisabled = page.getByRole('button', { name: 'Procesando pago…' })
  const onColorEnabled = page.getByRole('button', { name: 'Ver la vitrina' }).last()
  const box = async (l: Locator) => (await l.boundingBox())!
  expect((await box(onColorDisabled)).height).toBe((await box(onColorEnabled)).height)
  await tabThroughNever(page, enabled, [disabled, page.getByRole('button', { name: 'Ver tamaños y sabores' }), onColorDisabled])
})

test('button: on a mermelada field the ring is betun', async ({ page }) => {
  const onColor = page.getByRole('button', { name: 'Ver la vitrina' }).last()
  await onColor.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(onColor).toBeFocused()
  await expectFocusRing(onColor, 'rgb(255, 251, 251)')
})

test('field: label, help and error are tied to the input', async ({ page }) => {
  const phone = page.getByLabel('Teléfono')
  await expect(phone).toHaveAttribute('aria-describedby', /.+/)
  await expect(page.getByText('10 dígitos')).toHaveAttribute('id', (await phone.getAttribute('aria-describedby'))!)
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true')

  const name = page.getByLabel('Nombre')
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  const errorId = await name.getAttribute('aria-describedby')
  await expect(page.locator(`[id="${errorId}"]`)).toHaveText('Escribe tu nombre completo.')
  await expect(name).toHaveAccessibleDescription('Escribe tu nombre completo.')
})

test('field: typing an invalid email shows the error and fixing it clears it', async ({ page }) => {
  const email = page.getByLabel('Correo electrónico')
  await email.focus()
  await expectFocusRing(email)
  await page.keyboard.type('ana')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription(/correo con @/)
  await page.keyboard.type('@correo.com')
  await expect(email).not.toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription('')
})

test('field: the disabled one is skipped by Tab', async ({ page }) => {
  const disabled = page.getByLabel('Colonia')
  await expect(disabled).toBeDisabled()
  await expect(disabled).toHaveCSS('cursor', 'not-allowed')
  await tabThroughNever(page, page.getByLabel('Nombre'), [disabled], 3)
})

test('card: uses the relieve border', async ({ page }) => {
  const card = page.getByRole('article').first()
  await expect(card).toHaveCSS('border-top-color', 'rgb(236, 210, 210)')
  await expect(card).toHaveCSS('border-top-width', '1px')
})

test('choice cards: a real radio group operated with the arrow keys', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Pan' })
  const chocolate = group.getByRole('radio', { name: /Chocolate/ })
  await expect(chocolate).toBeChecked()
  const chosenCard = chocolate.locator('xpath=..')
  await expect(chosenCard).toHaveCSS('border-top-width', '2px')
  await expect(chosenCard).toHaveCSS('border-top-color', 'rgb(94, 25, 33)')
  await expect(chosenCard).toHaveCSS('background-color', 'rgb(255, 251, 251)')
  await chocolate.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expectFocusRing(chocolate.locator('xpath=..'))
  await page.keyboard.press('ArrowUp')
  const vainilla = group.getByRole('radio', { name: /Vainilla/ })
  await expect(vainilla).toBeChecked()
  await expect(chocolate).not.toBeChecked()
  await expect(vainilla.locator('xpath=..')).toHaveCSS('border-top-width', '2px')
})

test('choice cards: the disabled option stays visible with its reason', async ({ page }) => {
  const redVelvet = page.getByRole('radio', { name: /Red velvet/ })
  await expect(redVelvet).toBeDisabled()
  await expect(redVelvet).toHaveAccessibleDescription('No se combina con pastel envinado')
  const card = redVelvet.locator('xpath=..')
  await expect(card).toHaveCSS('border-top-color', 'rgb(236, 210, 210)')
  await expect(card).toHaveCSS('border-top-style', 'dashed')
  await expect(card).toHaveCSS('background-color', 'rgb(255, 244, 244)')
  await expect(card).toHaveCSS('cursor', 'not-allowed')
  await tabThroughNever(page, page.getByRole('radio', { name: /Chocolate/ }), [redVelvet], 4)
  await expect(page.getByText('No se combina con pastel envinado')).toBeVisible()
})

test('chips: radios chosen by keyboard fill with mermelada', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Pisos' })
  const three = group.getByRole('radio', { name: '3 pisos' })
  await expect(three).toBeChecked()
  await expect(three.locator('xpath=..')).toHaveCSS('background-color', 'rgb(94, 25, 33)')
  await three.focus()
  await page.keyboard.press('ArrowLeft')
  const two = group.getByRole('radio', { name: '2 pisos' })
  await expect(two).toBeChecked()
  await expect(two.locator('xpath=..')).toHaveCSS('background-color', 'rgb(94, 25, 33)')
  await expect(three.locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 251, 251)')
  await expectFocusRing(two.locator('xpath=..'))
  const four = group.getByRole('radio', { name: '4 pisos' })
  await expect(four).toBeDisabled()
  await expect(four.locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 244, 244)')
  await expect(four.locator('xpath=..')).toHaveCSS('border-top-style', 'dashed')
  await expect(page.getByText('Solo con más kilos')).toBeVisible()
})

test('notices: roles, border widths and tone colors', async ({ page }) => {
  const error = page.getByRole('alert')
  await expect(error).toContainText('Mercado Pago rechazó el pago.')
  await expect(error).toHaveCSS('border-top-color', 'rgb(177, 58, 20)')
  await expect(error).toHaveCSS('border-top-width', '2px')
  const attention = page.getByRole('status').filter({ hasText: 'Apartado, falta tu pago' })
  await expect(attention).toHaveCSS('border-top-color', 'rgb(143, 84, 19)')
  await expect(attention).toHaveCSS('border-top-width', '2px')
  const info = page.getByRole('status').filter({ hasText: 'Para 4 pisos la pastelería recomienda' })
  await expect(info).toHaveCSS('border-top-color', 'rgb(236, 210, 210)')
  await expect(info).toHaveCSS('border-top-width', '1px')
  await expect(page.getByRole('status').filter({ hasText: 'Agregado al pedido' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  const success = page.getByRole('status').filter({ hasText: 'Agregado al pedido' })
  await expect(success).toHaveCSS('border-top-color', 'rgb(63, 95, 42)')
  await expect(success).toHaveCSS('border-top-width', '2px')
  for (const notice of [info, attention, success, error]) {
    await expect(notice.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  }
})

for (const width of [1440, 390]) {
  test(`layout: no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/muestra')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
