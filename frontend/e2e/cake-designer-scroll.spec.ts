import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La tarjeta del paso de "Diseña tu pastel" (tanda 3 de correcciones): en escritorio tiene su propio desplazamiento, con
 * el título y "Continuar" siempre a la vista; en el teléfono no hay un desplazamiento dentro de otro. Y las opciones son
 * filas dentro de la tarjeta, no tarjetas dentro de la tarjeta.
 */

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

/** Un borrador con los pasos 1 a 6 confirmados y "Rosetones" (un grupo de duya, que se despliega) en la decoración. */
const DRAFT = {
  people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal',
  flavorCount: 1, flavors: ['durazno'], coverageColor: COVERAGE_HEX.lila, decoration: 'rosetones', decorationColor: null,
  confirmed: [1, 2, 3, 4, 5, 6],
}

async function open(page: Page, step: number, draft: object = DRAFT) {
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
  await page.addInitScript((value) => sessionStorage.setItem('ilusion.cakeDesign.v1', value), JSON.stringify(draft))
  await page.goto(`/pedido/disena?paso=${step}`)
  await expect(stepTitle(page)).toBeVisible()
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const content = (page: Page) => card(page).getByRole('region', { name: 'Contenido del paso' })
const continueButton = (page: Page) => card(page).getByRole('button', { name: 'Continuar', exact: true })
const pageScroll = (page: Page) => page.evaluate(() => window.scrollY)
const contentScroll = (page: Page) => content(page).evaluate((element) => element.scrollTop)

/** Lleva la página hasta la tarjeta del paso, como quien baja a ver las opciones. */
async function scrollToCard(page: Page) {
  await page.evaluate(() => {
    const top = document.querySelector('[data-testid="tarjeta-paso"]')!.getBoundingClientRect().top
    window.scrollTo(0, window.scrollY + top - 112)
  })
}

/** El elemento cabe completo en la ventana. */
async function expectInViewport(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 800 } })

  test('a long step scrolls inside its card while the title, "Continuar" and the total stay in view', async ({ page }) => {
    await open(page, 6)
    await scrollToCard(page)
    await expectInViewport(page, card(page))
    await expectInViewport(page, stepTitle(page))
    await expectInViewport(page, continueButton(page))
    await expectInViewport(page, page.getByTestId('total-estimado').first())
    // El contenido es más alto que la tarjeta: se desplaza dentro de ella.
    expect(await content(page).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    const scrolled = await pageScroll(page)
    const titleBefore = (await stepTitle(page).boundingBox())!.y
    const buttonBefore = (await continueButton(page).boundingBox())!.y
    const box = (await content(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => contentScroll(page)).toBeGreaterThan(0)
    // La página no se movió; el título y "Continuar" siguen donde estaban.
    expect(await pageScroll(page)).toBe(scrolled)
    expect((await stepTitle(page).boundingBox())!.y).toBe(titleBefore)
    expect((await continueButton(page).boundingBox())!.y).toBe(buttonBefore)
  })

  test('in step 7 the preview stays below the header and inside the window, with the card and the page scrolled to the end', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await open(page, 7)
    await content(page).evaluate((element) => element.scrollTo(0, element.scrollHeight))
    // La página baja hasta el final del diseñador (el borde de abajo de sus dos columnas), sin pasar a lo que sigue.
    await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="tarjeta-paso"]')!.parentElement!
      const card = document.querySelector('[data-testid="tarjeta-paso"]')!
      const stuck = card.getBoundingClientRect().top + window.scrollY - 112
      window.scrollTo(0, Math.max(grid.getBoundingClientRect().bottom + window.scrollY - window.innerHeight, stuck))
    })
    const header = (await page.getByRole('banner').boundingBox())!
    const preview = (await page.getByTestId('vista-previa').boundingBox())!
    expect(preview.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(preview.y + preview.height).toBeLessThanOrEqual(1000)
  })

  test('changing the step brings the content back to the top', async ({ page }) => {
    await open(page, 6)
    await scrollToCard(page)
    await content(page).evaluate((element) => element.scrollTo(0, element.scrollHeight))
    expect(await contentScroll(page)).toBeGreaterThan(0)
    await card(page).getByRole('button', { name: 'Atrás' }).click()
    await expect(stepTitle(page)).toHaveText('5. Cobertura')
    expect(await contentScroll(page)).toBe(0)
    await expectInViewport(page, stepTitle(page))
  })

  test('the scrolling content is a named region the keyboard can reach and scroll', async ({ page }) => {
    await open(page, 6)
    await scrollToCard(page)
    await expect(content(page)).toHaveAttribute('tabindex', '0')
    await content(page).focus()
    await expect(content(page)).toBeFocused()
    await page.keyboard.press('End')
    await expect.poll(() => contentScroll(page)).toBeGreaterThan(0)
    expect(await content(page).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
  })

  test('a step whose content fits has no inner scroll and no extra tab stop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await open(page, 2)
    expect(await content(page).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(false)
    await expect(content(page)).not.toHaveAttribute('tabindex', /.*/)
  })

  test('the step card and the options use the soft border, and the options are rows, not cards inside the card', async ({ page }) => {
    // Cuatro pasos, cada uno con su vista previa: más que el tiempo de una prueba.
    test.slow()
    await open(page, 3)
    // `relieve` (#ecd2d2), el borde de las tarjetas del libro de marca; no `mermelada`.
    await expect(card(page)).toHaveCSS('border-top-color', 'rgb(236, 210, 210)')
    await expect(card(page)).toHaveCSS('border-top-width', '1px')
    for (const step of [2, 3, 4, 6]) {
      if (step !== 3) await page.goto(`/pedido/disena?paso=${step}`)
      await expect(stepTitle(page)).toBeVisible()
      // Ningún contenedor entre una opción y la tarjeta lleva borde en sus cuatro lados.
      const boxed = await card(page).evaluate((root) => {
        const boxes = new Set<Element>()
        for (const input of root.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
          for (let node = input.parentElement; node && node !== root; node = node.parentElement) {
            const style = getComputedStyle(node)
            const sides = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
            if (sides.every((width) => parseFloat(width) > 0)) boxes.add(node)
          }
        }
        return boxes.size
      })
      expect(boxed, `paso ${step}`).toBe(0)
      // Cada opción conserva su radio o casilla a la vista y un área de toque de al menos 44 px.
      const rows = card(page).locator('label:has(input[type="radio"]:not(.sr-only)), label:has(input[type="checkbox"]:not(.sr-only))')
      expect(await rows.count()).toBeGreaterThan(0)
      for (const row of await rows.all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    // El selector de color de la cobertura tampoco es una caja dentro de la tarjeta.
    await page.goto('/pedido/disena?paso=5')
    await expect(page.getByTestId('selector-de-color')).toHaveCSS('border-top-width', '0px')
  })

  test('on a short window the last "Cambiar" of "Tu pastel" is reachable, focusable and fully in view', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 700 })
    await open(page, 6)
    const last = page.locator('section[aria-labelledby="tu-pastel"]').getByRole('link', { name: /^Cambiar/ }).last()
    await last.scrollIntoViewIfNeeded()
    await last.focus()
    await expect(last).toBeFocused()
    const box = (await last.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(700)
    // Se ve de verdad: en su centro está el enlace, no una lista recortada ni otra cosa encima.
    const hit = await last.evaluate((link) => {
      const rect = link.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return top !== null && link.contains(top)
    })
    expect(hit).toBe(true)
  })

  test('on step 8 the "Agregado al pedido" notice shows next to the button, in view and outside the scrolling content', async ({ page }) => {
    await open(page, 8, { ...DRAFT, confirmed: [1, 2, 3, 4, 5, 6, 7], messageEnabled: true, message: { text: 'Feliz cumpleaños Ana' } })
    await expect(stepTitle(page)).toHaveText('8. Revisión')
    await card(page).getByRole('button', { name: 'Agregar al pedido' }).click()
    const notice = page.getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    await expect(content(page).getByTestId('aviso-carrito')).toHaveCount(0)
    const box = (await notice.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(800)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the card does not scroll inside the page and nothing overflows sideways', async ({ page }) => {
    test.slow()
    for (const step of [3, 4, 6]) {
      await open(page, step)
      expect(await content(page).evaluate((element) => element.scrollHeight > element.clientHeight + 1), `paso ${step}`).toBe(false)
      await expect(content(page)).not.toHaveAttribute('tabindex', /.*/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }
  })

  test('the bottom bar does not hide the title of the new step', async ({ page }) => {
    await open(page, 2)
    const bar = page.getByTestId('barra-movil')
    // Arriba de la página, el título del paso queda justo donde está la barra fija.
    await bar.getByRole('button', { name: 'Continuar' }).click()
    await expect(stepTitle(page)).toHaveText('3. Pan')
    await expect(stepTitle(page)).toBeFocused()
    // Al recibir el foco, el título se trae a la vista por encima de la barra, no debajo de ella.
    await expect.poll(async () => {
      const title = (await stepTitle(page).boundingBox())!
      const barBox = (await bar.boundingBox())!
      return title.y + title.height <= barBox.y
    }).toBe(true)
  })
})
