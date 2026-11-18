import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Diseña tu pastel", paso 7 (mensaje y oblea), tanda 3 de correcciones: el mensaje y la oblea son filas con su casilla
 * dentro de la tarjeta del paso, no cajas con borde `mermelada`, y lo que se despliega debajo va sin caja (D79). Un nombre
 * de imagen muy largo y sin espacios no se sale de la tarjeta, ni elegido ni después de recargar.
 */

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const DRAFT_TO_STEP_7 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6],
}

/** Sin espacios ni guiones: el navegador no encuentra dónde cortarlo. */
const LONG_NAME = 'IMG_20261115_fiesta_de_cumpleanos_de_la_abuela_en_el_salon_principal_foto_final_editada.png'

async function open(page: Page) {
  // Solo la primera vez: tras recargar, manda el borrador que guardó la propia pantalla.
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('ilusion.cakeDesign.v1')) sessionStorage.setItem('ilusion.cakeDesign.v1', value)
  }, JSON.stringify(DRAFT_TO_STEP_7))
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
  await page.goto('/pedido/disena?paso=7')
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')

async function addWafer(page: Page, name: string) {
  await card(page).getByLabel('Agregar una oblea con tu imagen').check()
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: PNG })
  await expect(card(page).getByText(name, { exact: true })).toBeVisible()
}

/**
 * Lo que se sale por la derecha de la tarjeta del paso: cada texto y cada elemento, recortado solo por los contenedores que
 * esconden lo que sobra (`overflow: hidden`, como el nombre con puntos suspensivos). Uno que se desplaza (`auto`) no cuenta
 * como recorte: lo que se sale ahí obliga a desplazar de lado.
 */
const overflowing = (page: Page) =>
  card(page).evaluate((root) => {
    const limit = root.getBoundingClientRect().right + 0.5
    const clipRight = (start: Element | null) => {
      let right = Infinity
      for (let node = start; node && node !== root; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX
        if (overflow === 'hidden' || overflow === 'clip') right = Math.min(right, node.getBoundingClientRect().right)
      }
      return right
    }
    const found: string[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(text)
      const box = range.getBoundingClientRect()
      if (box.width > 0 && Math.min(box.right, clipRight(text.parentElement)) > limit) found.push(`texto: ${text.textContent.trim().slice(0, 60)}`)
    }
    for (const element of root.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width > 0 && Math.min(box.right, clipRight(element)) > limit) found.push(`<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`)
    }
    return found
  })

/** Ningún contenedor entre el control y la tarjeta lleva borde en sus cuatro lados (una caja dentro de la tarjeta). */
const boxesAround = (page: Page, selector: string) =>
  card(page).evaluate((root, query) => {
    const boxes: string[] = []
    for (const control of root.querySelectorAll(query)) {
      for (let node = control.parentElement; node && node !== root; node = node.parentElement) {
        const style = getComputedStyle(node)
        const sides = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
        if (sides.every((width) => parseFloat(width) > 0)) boxes.push(`${control.getAttribute('aria-label') ?? control.id} dentro de <${node.tagName.toLowerCase()} class="${node.getAttribute('class')}">`)
      }
    }
    return [...new Set(boxes)]
  }, selector)

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })

  test('the message and the wafer are rows with a visible checkbox and a soft line, not boxes inside the step card', async ({ page }) => {
    await open(page)
    const message = card(page).getByRole('checkbox', { name: 'Agregar un mensaje' })
    const wafer = card(page).getByRole('checkbox', { name: 'Agregar una oblea con tu imagen' })
    for (const checkbox of [message, wafer]) {
      // La fila lleva solo su línea de arriba, de 1 px en `relieve` (#ecd2d2), y mide al menos 44 px.
      const row = checkbox.locator('xpath=ancestor::label/..')
      await expect(row).toHaveCSS('border-top-color', 'rgb(236, 210, 210)')
      await expect(row).toHaveCSS('border-top-width', '1px')
      await expect(row).toHaveCSS('border-bottom-width', '0px')
      expect((await checkbox.locator('xpath=ancestor::label').boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await message.check()
    await card(page).getByLabel('Tu mensaje').fill('Feliz cumpleaños Ana')
    await addWafer(page, 'foto.png')
    // Las casillas, los modos del color del texto, el campo del mensaje y el encuadre de la imagen: ninguno en una caja.
    const controls = 'input[type="checkbox"], input[type="radio"]:not(.sr-only), input[type="text"], input[type="range"]'
    expect(await boxesAround(page, controls)).toEqual([])
    // Los modos del color del texto también son filas con radio visible y al menos 44 px.
    for (const name of [/^Automático/, /^Colores que combinan/, /^Elegir un color/]) {
      const radio = card(page).getByRole('radio', { name })
      await expect(radio).toBeVisible()
      expect((await radio.locator('xpath=ancestor::label').boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('there is no "Mensaje" or "Oblea" group that only repeats the step title', async ({ page }) => {
    await open(page)
    await expect(card(page).getByRole('group', { name: 'Mensaje', exact: true })).toHaveCount(0)
    await expect(card(page).getByRole('group', { name: 'Oblea', exact: true })).toHaveCount(0)
  })
})

for (const width of [1440, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('a very long image name without spaces stays inside the step card, chosen and after a reload', async ({ page }) => {
      await open(page)
      await addWafer(page, LONG_NAME)
      expect(await overflowing(page)).toEqual([])
      await expect(card(page).getByText(LONG_NAME, { exact: true })).toHaveCSS('text-overflow', 'ellipsis')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

      // Al recargar, la imagen se pierde y el aviso la nombra completa para volver a elegirla.
      await page.reload()
      const notice = card(page).getByRole('status').filter({ hasText: 'Tu imagen ya no está' })
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(LONG_NAME)
      expect(await overflowing(page)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  })
}
