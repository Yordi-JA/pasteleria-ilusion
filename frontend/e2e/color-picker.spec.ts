import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, mockCakeDesignOptions, mockCakeDesignPrice, withoutColorNames } from './support/cake-design.ts'
import { colorPicker, pickColor } from './support/color-picker.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El selector libre de color (cobertura, decoración y texto del mensaje), su "parecido a" y la migración de los borradores y del
 * carrito que guardaron un `slug` de la lista vieja. La API se simula (`support/cake-design.ts`). Corre en escritorio (1440 px)
 * salvo donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const MODELS = {
  color: '/src/models/color.ts',
  colors: '/src/viewmodels/colors.ts',
  tones: '/src/viewmodels/decorationTones.ts',
  draft: '/src/models/cakeDesignDraft.ts',
  cart: '/src/models/cart.ts',
  options: '/src/models/cakeDesign.ts',
  images: '/src/models/designImages.ts',
}

const DRAFT_TO_STEP_5 = {
  people: 40, form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal',
  flavorCount: 1, flavors: ['durazno'], confirmed: [1, 2, 3, 4],
}
const DRAFT_TO_STEP_8 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6, 7],
}

async function open(page: Page, step: number, draft: object, options: object = cakeDesignOptions) {
  await page.addInitScript(
    (value) => {
      if (!sessionStorage.getItem('ilusion.cakeDesign.v1')) sessionStorage.setItem('ilusion.cakeDesign.v1', value)
    },
    JSON.stringify(draft),
  )
  await mockCakeDesignOptions(page, { status: 200, body: options })
  const prices = await mockCakeDesignPrice(page, options as typeof cakeDesignOptions)
  await page.goto(`/pedido/disena?paso=${step}`)
  await expect(page.locator('#paso-titulo')).toBeVisible()
  return prices
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const picker = (page: Page) => colorPicker(card(page))
const code = (page: Page) => picker(page).getByTestId('codigo-de-color')
const bar = (page: Page, name: 'Tono' | 'Intensidad' | 'Claridad') => picker(page).getByRole('slider', { name })
const field = (page: Page) => picker(page).getByLabel('Código del color')
const draftOf = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('ilusion.cakeDesign.v1') ?? '{}'))
const proceed = (page: Page, name = 'Continuar') => card(page).getByRole('button', { name, exact: true }).click()

// --- Los módulos puros (en el navegador, como las otras pruebas de modelos) ---

test('a color is exactly #rrggbb: no short form, no alpha, no names, and the typed field accepts the short form only when it is done', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(async (urls) => {
    const { normalizeHex, parseTypedHex } = await import(urls.color)
    return {
      normalized: ['#A1B2C3', '#a1b2c3'].map(normalizeHex),
      rejected: ['A1B2C3', '#abc', '#a1b2c3ff', '#12345', '#a1b2c3\n', ' #a1b2c3', 'red', '', null, 12].map(normalizeHex),
      typed: ([['a1b2c3', false], ['#A1B2C3', false], ['  #a1b2c3 ', false], ['#abc', false], ['#abc', true], ['abc', true], ['#abcd', true], ['#12345g', true]] as [string, boolean][]).map(([text, short]) => parseTypedHex(text, short)),
    }
  }, MODELS)
  expect(result.normalized).toEqual(['#a1b2c3', '#a1b2c3'])
  expect(result.rejected.every((value) => value === null)).toBe(true)
  expect(result.typed).toEqual(['#a1b2c3', '#a1b2c3', '#a1b2c3', null, '#aabbcc', '#aabbcc', null, null])
})

test('tone, intensity and lightness convert to a color and back without losing it, including black, white and the greys', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(async (urls) => {
    const { hexToHsl, hslToHex } = await import(urls.colors)
    const samples = ['#000000', '#ffffff', '#808080', '#fffbfb', '#a1b2c3', '#ff0000', '#00ff00', '#0000ff', '#12ab9f', '#010101', '#fefefe']
    for (let value = 0; value < 256; value += 5) samples.push(`#${[value, value, value].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
    const lost = samples.filter((hex) => hslToHex(hexToHsl(hex)) !== hex)
    // En un gris el tono se conserva: la barra no salta al llegar al negro.
    const kept = hexToHsl('#000000', { h: 210, s: 40, l: 50 })
    // Un gris que llega después de un color no hereda su intensidad: #808080 desde el rojo no se vuelve #ff0101.
    const afterRed = hexToHsl('#ff0000')
    const lostAfterRed = ['#808080', '#333333', '#fefefe', '#000000', '#ffffff', '#cccccc'].filter((gray) => hslToHex(hexToHsl(gray, afterRed)) !== gray)
    return { lost, lostAfterRed, grayS: hexToHsl('#808080', afterRed).s, kept, red: hslToHex({ h: 0, s: 100, l: 50 }), blueHue: hexToHsl('#0000ff').h }
  }, MODELS)
  expect(result.lost).toEqual([])
  expect(result.lostAfterRed).toEqual([])
  expect(result.grayS).toBe(0)
  expect(result.kept).toMatchObject({ h: 210, s: 40, l: 0 })
  expect(result.red).toBe('#ff0000')
  expect(result.blueHue).toBeCloseTo(240, 5)
})

test('the automatic tones of the decoration work with any color: black, white, greys and the extremes', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(async (urls) => {
    const { automaticTones, chosenTones, lightness } = await import(urls.tones)
    const colors = ['#000000', '#ffffff', '#808080', '#fffbfb', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#010101', '#fefefe', '#4a70ba']
    return colors.map((hex) => {
      const auto = automaticTones(hex)
      const chosen = chosenTones(hex)
      return { hex, cover: lightness(hex), main: auto.main, accent: auto.accent, petals: auto.petals, chosenMain: chosen.main, chosenAccent: chosen.accent, mainL: lightness(auto.main), accentL: lightness(auto.accent) }
    })
  }, MODELS)
  for (const tone of result) {
    for (const value of [tone.main, tone.accent, tone.chosenMain, tone.chosenAccent, ...tone.petals]) expect(value, tone.hex).toMatch(/^#[0-9a-f]{6}$/)
    // Un tono más oscuro y otro más claro que la cobertura, o iguales cuando ya no se puede (negro y blanco).
    expect(tone.mainL, tone.hex).toBeLessThanOrEqual(tone.cover + 1e-6)
    expect(tone.accentL, tone.hex).toBeGreaterThanOrEqual(tone.cover - 1e-6)
  }
  const black = result.find((tone) => tone.hex === '#000000')!
  expect(black.main).toBe('#000000')
  expect(black.accentL).toBeGreaterThan(0.3)
  const white = result.find((tone) => tone.hex === '#ffffff')!
  expect(white.mainL).toBeLessThan(0.9)
  expect(white.accent).toBe('#ffffff')
  // Los grises siguen siendo grises: ningún canal se aparta de los otros.
  for (const gray of ['#808080', '#000000', '#ffffff']) {
    const tone = result.find((entry) => entry.hex === gray)!
    for (const value of [tone.main, tone.accent]) {
      const channels = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
      expect(Math.max(...channels) - Math.min(...channels), `${gray} -> ${value}`).toBeLessThan(3)
    }
  }
})

test('"parecido a" is the closest color of the list by perception, not by RGB distance, and it is empty with an empty list', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.options)
      const { colorPhrase, nearestColorName } = await import(urls.colors)
      const list = parseCakeDesignOptions(options).coverageColors
      const rgb = (a: string, b: string) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)))
      const byRgb = (hex: string) => list.reduce((best: { name: string; previewColor: string }, item: { name: string; previewColor: string }) => (rgb(hex, item.previewColor) < rgb(hex, best.previewColor) ? item : best)).name
      return {
        exact: list.map((item: { name: string; previewColor: string }) => nearestColorName(item.previewColor, list) === item.name),
        samples: ['#4dc707', '#12ab9f', '#808080', '#ffffff', '#d44c49'].map((hex) => nearestColorName(hex, list)),
        gray: ['#000000', '#333333', '#808080', '#666666'].map((hex) => [hex, nearestColorName(hex, list), colorPhrase(hex, list)]),
        vivid: ['#ff0000', '#4dc707', '#8a2be2', '#0000ff', '#ff7f00'].map((hex) => nearestColorName(hex, list)),
        nearWhite: ['#ffffff', '#fefefe'].map((hex) => nearestColorName(hex, list)),
        rgbWouldSay: byRgb('#4dc707'),
        phrase: colorPhrase('#4dc707', list),
        emptyList: nearestColorName('#4dc707', []),
        emptyPhrase: colorPhrase('#4dc707', []),
      }
    },
    { urls: MODELS, options: cakeDesignOptions },
  )
  expect(result.exact.every(Boolean)).toBe(true)
  expect(result.samples).toEqual(['Verde', 'Turquesa', null, 'Blanco', 'Rojo'])
  // Los grises oscuros o medios no se parecen a ningún color de la lista: solo muestra y código, sin nombre.
  expect(result.gray).toEqual([['#000000', null, '#000000'], ['#333333', null, '#333333'], ['#808080', null, '#808080'], ['#666666', null, '#666666']])
  // Los colores vivos razonables conservan nombre, y un gris casi blanco sigue siendo "Blanco".
  expect(result.vivid).toEqual(['Rojo', 'Verde', 'Azul fuerte', 'Azul fuerte', 'Naranja'])
  expect(result.nearWhite).toEqual(['Blanco', 'Blanco'])
  // Por RGB saldría Café: la distancia perceptual da Verde, que es lo que se ve.
  expect(result.rgbWouldSay).toBe('Café')
  expect(result.phrase).toBe('#4DC707, parecido a verde')
  expect(result.emptyList).toBeNull()
  expect(result.emptyPhrase).toBe('#4DC707')
})

test('an old draft with a list slug becomes its color code; a slug that is gone is dropped', async ({ page }) => {
  await page.goto('/legal')
  const result = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.options)
      const { migrateLegacyColors, parseDraft } = await import(urls.draft)
      const list = parseCakeDesignOptions(options).coverageColors
      const old = parseDraft({ coverageColor: 'rojo', decorationColor: 'azulfuerte', confirmed: [1, 2, 3, 4, 5], message: { text: 'Hola', color: { mode: 'list', value: 'lila' } } })
      const gone = parseDraft({ coverageColor: 'ya-no-existe', decorationColor: 'ya-no-existe', confirmed: [1, 2, 3, 4, 5], message: { text: 'Hola', color: { mode: 'list', value: 'ya-no-existe' } } })
      const fresh = parseDraft({ coverageColor: '#D44C48', decorationColor: '#4A70BA', message: { color: { mode: 'custom', value: '#CCBAE4' } } })
      return {
        old: migrateLegacyColors(old, list),
        gone: migrateLegacyColors(gone, list),
        sameObject: migrateLegacyColors(fresh, list) === fresh,
        fresh: { cover: fresh.coverageColor, deco: fresh.decorationColor, ink: fresh.message.color },
        garbage: parseDraft({ coverageColor: '<script>', decorationColor: '#12345', message: { color: { mode: 'custom', value: '#zzzzzz' } } }),
      }
    },
    { urls: MODELS, options: cakeDesignOptions },
  )
  expect(result.old).toMatchObject({ coverageColor: '#d44c48', decorationColor: '#4a70ba', confirmed: [1, 2, 3, 4, 5], message: { color: { mode: 'custom', value: '#ccbae4' } } })
  // La cobertura que ya no existe se vuelve a confirmar; la decoración vuelve a automático y el texto a negro.
  expect(result.gone).toMatchObject({ coverageColor: null, decorationColor: null, confirmed: [1, 2, 3, 4], message: { color: { mode: 'auto', value: null } } })
  expect(result.sameObject).toBe(true)
  expect(result.fresh).toEqual({ cover: '#d44c48', deco: '#4a70ba', ink: { mode: 'custom', value: '#ccbae4' } })
  expect(result.garbage).toMatchObject({ coverageColor: null, decorationColor: null, message: { color: { mode: 'auto', value: null } } })
})

// --- El selector ---

test('step 5 starts on the first color of the list, shows it large, and "Continuar" keeps it', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  await expect(card(page).getByRole('radio')).toHaveCount(0)
  await expect(picker(page)).toBeVisible()
  await expect(picker(page).locator('legend')).toHaveText('Elige el color de la cobertura')
  // El primero de la lista activa de la pastelería (Amarillo), no uno inventado.
  await expect(code(page)).toHaveText(cakeDesignOptions.coverage_colors[0].preview_color.toUpperCase())
  await expect(field(page)).toHaveValue(cakeDesignOptions.coverage_colors[0].preview_color.toUpperCase())
  await expect(picker(page).getByTestId('muestra-de-color')).toHaveCSS('background-color', 'rgb(250, 228, 150)')
  const swatch = await picker(page).getByTestId('muestra-de-color').boundingBox()
  expect(swatch!.width).toBeGreaterThanOrEqual(64)
  await proceed(page)
  await expect(page.locator('#paso-titulo')).toHaveText('6. Decoración')
  expect((await draftOf(page)).coverageColor).toBe('#fae496')
})

test('every control of the picker has a real label, a role and a value that is announced', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  for (const [name, max] of [['Tono', 360], ['Intensidad', 100], ['Claridad', 100]] as const) {
    const slider = bar(page, name)
    await expect(slider).toHaveAttribute('aria-valuemin', '0')
    await expect(slider).toHaveAttribute('aria-valuemax', String(max))
    await expect(slider).toHaveAttribute('aria-valuenow', /^\d+$/)
    await expect(slider).toHaveAttribute('aria-valuetext', name === 'Tono' ? /^\d+°$/ : /^\d+ %$/)
    await expect(slider).toHaveAttribute('tabindex', '0')
  }
  await expect(picker(page).getByLabel('Código del color')).toBeVisible()
  // Sin <input type="color"> del sistema.
  await expect(card(page).locator('input[type=color]')).toHaveCount(0)
})

test('the keyboard moves each bar: arrows by 1, Shift by 10, Page Up and Down by 10, Home and End to the ends; the focus is visible', async ({ page }) => {
  await open(page, 5, { ...DRAFT_TO_STEP_5, coverageColor: '#ff0000' })
  const hue = bar(page, 'Tono')
  await hue.focus()
  await expect(hue).toBeFocused()
  await expect(hue).toHaveCSS('outline-style', 'solid')
  await expect(hue).toHaveCSS('outline-width', '2px')
  await expect(hue).toHaveCSS('outline-color', 'rgb(94, 25, 33)')
  await expect(hue).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('ArrowRight')
  await expect(hue).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(hue).toHaveAttribute('aria-valuenow', '11')
  await page.keyboard.press('ArrowUp')
  await expect(hue).toHaveAttribute('aria-valuenow', '12')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await expect(hue).toHaveAttribute('aria-valuenow', '10')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(hue).toHaveAttribute('aria-valuenow', '0')
  // No pasa de los extremos.
  await page.keyboard.press('ArrowLeft')
  await expect(hue).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('End')
  await expect(hue).toHaveAttribute('aria-valuenow', '360')
  await page.keyboard.press('Home')
  await page.keyboard.press('PageUp')
  await expect(hue).toHaveAttribute('aria-valuenow', '10')
  await page.keyboard.press('PageDown')
  await expect(hue).toHaveAttribute('aria-valuenow', '0')
  // Tab llega a la siguiente barra y a la última, y de ahí al campo del código.
  await page.keyboard.press('Tab')
  await expect(bar(page, 'Intensidad')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(bar(page, 'Claridad')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(field(page)).toBeFocused()
  // La claridad en el negro y en el blanco, y el color sigue siendo el que se ve.
  await bar(page, 'Claridad').focus()
  await page.keyboard.press('Home')
  await expect(code(page)).toHaveText('#000000')
  await page.keyboard.press('End')
  await expect(code(page)).toHaveText('#FFFFFF')
  // Cada paso cambia el color de la vista previa y del borrador.
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(async () => (await draftOf(page)).coverageColor).toMatch(/^#[0-9a-f]{6}$/)
  expect((await draftOf(page)).coverageColor).not.toBe('#ffffff')
})

test('typing a gray after a vivid color shows and saves that gray, not a saturated one', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  for (const gray of ['#808080', '#333333', '#fefefe']) {
    await field(page).fill('#ff0000')
    await expect(code(page)).toHaveText('#FF0000')
    await field(page).fill(gray)
    await expect(code(page)).toHaveText(gray.toUpperCase())
    await expect(picker(page).getByTestId('muestra-de-color')).toHaveCSS('background-color', `rgb(${[1, 3, 5].map((i) => parseInt(gray.slice(i, i + 2), 16)).join(', ')})`)
    await expect(bar(page, 'Intensidad')).toHaveAttribute('aria-valuenow', '0')
    expect((await draftOf(page)).coverageColor).toBe(gray)
  }
})

test('the tone keeps its value when the lightness goes to black, and the bars follow a typed code', async ({ page }) => {
  await open(page, 5, { ...DRAFT_TO_STEP_5, coverageColor: '#12ab9f' })
  const hueBefore = await bar(page, 'Tono').getAttribute('aria-valuenow')
  await bar(page, 'Claridad').focus()
  await page.keyboard.press('Home')
  await expect(code(page)).toHaveText('#000000')
  await expect(bar(page, 'Tono')).toHaveAttribute('aria-valuenow', hueBefore!)
  await field(page).fill('#ff0000')
  await expect(bar(page, 'Tono')).toHaveAttribute('aria-valuenow', '0')
  await expect(bar(page, 'Intensidad')).toHaveAttribute('aria-valuenow', '100')
  await expect(bar(page, 'Claridad')).toHaveAttribute('aria-valuenow', '50')
})

test('dragging or clicking a bar sets its value from where the pointer is', async ({ page }) => {
  await open(page, 5, { ...DRAFT_TO_STEP_5, coverageColor: '#ff0000' })
  const hue = bar(page, 'Tono')
  const box = (await hue.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const middle = Number(await hue.getAttribute('aria-valuenow'))
  expect(middle).toBeGreaterThan(170)
  expect(middle).toBeLessThan(190)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(Number(await hue.getAttribute('aria-valuenow'))).toBeGreaterThan(300)
  // Más allá de los extremos se queda en el extremo.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(hue).toHaveAttribute('aria-valuenow', '0')
})

test('the code field takes a valid code, with or without #, in any case; the short form is taken when you leave the field', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  await field(page).fill('a1b2c3')
  await expect(code(page)).toHaveText('#A1B2C3')
  // Lo que se teclea no se reescribe mientras se escribe (mayúsculas, "#"): el cursor no salta al final.
  await expect(field(page)).toHaveValue('a1b2c3')
  await expect.poll(async () => (await draftOf(page)).coverageColor).toBe('#a1b2c3')
  await field(page).fill('#12AB9F')
  await expect(code(page)).toHaveText('#12AB9F')
  expect((await draftOf(page)).coverageColor).toBe('#12ab9f')
  await field(page).blur()
  await expect(field(page)).toHaveValue('#12AB9F')
  // Escribiendo la forma corta no se adelanta: "#abc" espera a #abcdef.
  await field(page).fill('')
  await field(page).pressSequentially('#abc')
  await expect(code(page)).toHaveText('#12AB9F')
  await field(page).pressSequentially('def')
  await expect(code(page)).toHaveText('#ABCDEF')
  // La forma corta completa se toma al salir del campo.
  await field(page).fill('#fa0')
  await expect(code(page)).toHaveText('#ABCDEF')
  await field(page).blur()
  await expect(code(page)).toHaveText('#FFAA00')
  await expect(field(page)).toHaveValue('#FFAA00')
  expect((await draftOf(page)).coverageColor).toBe('#ffaa00')
})

test('an invalid code says what to type, keeps the color it had and marks the field as invalid', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  await field(page).fill('#12AB9F')
  await expect(code(page)).toHaveText('#12AB9F')
  for (const bad of ['#12AB9', 'rojo', '#12AB9G', '#12AB9F00', '']) {
    await field(page).fill(bad)
    await field(page).blur()
    const message = picker(page).getByText('Escribe el código con 6 dígitos (del 0 al 9 y de la A a la F), por ejemplo #A1B2C3.')
    await expect(message, bad).toBeVisible()
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(field(page)).toHaveAccessibleDescription(/Escribe el código con 6 dígitos/)
    await expect(code(page)).toHaveText('#12AB9F')
    expect((await draftOf(page)).coverageColor).toBe('#12ab9f')
  }
  // Al corregirlo, el error se va.
  await field(page).fill('#00FF00')
  await expect(field(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(code(page)).toHaveText('#00FF00')
  // Enter también lo revisa.
  await field(page).fill('#00FF')
  await field(page).press('Enter')
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#paso-titulo')).toHaveText('5. Cobertura')
})

test('with an empty list of names the picker starts neutral and "Continuar" asks to choose a color first; no "parecido a" is shown', async ({ page }) => {
  const options = withoutColorNames()
  await open(page, 5, DRAFT_TO_STEP_5, options)
  await expect(code(page)).toHaveText('#FFFFFF')
  await proceed(page)
  await expect(card(page).getByText('Elige el color de la cobertura.')).toBeVisible()
  await expect(page.locator('#paso-titulo')).toHaveText('5. Cobertura')
  expect((await draftOf(page)).coverageColor).toBeNull()
  // Pasar por el campo sin escribir no elige el blanco de arranque.
  await field(page).focus()
  await field(page).blur()
  expect((await draftOf(page)).coverageColor).toBeNull()
  await pickColor(card(page), '#12ab9f')
  await proceed(page)
  await expect(page.locator('#paso-titulo')).toHaveText('6. Decoración')
  await expect(page.getByText('Crema pastelera, #12AB9F', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText(/parecido a/)).toHaveCount(0)
})

test('with an empty list, exactly #FFFFFF can be chosen even though the picker starts on it', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5, withoutColorNames())
  await field(page).fill('#ffffff')
  await expect.poll(async () => (await draftOf(page)).coverageColor).toBe('#ffffff')
  await proceed(page)
  await expect(page.locator('#paso-titulo')).toHaveText('6. Decoración')
})

// --- Los tres usos y el "parecido a" ---

test('the three uses share the picker; the review shows swatch, code and "parecido a", and the cart line carries the codes and the phrase in its details (there is no cart screen that lists designs yet)', async ({ page }) => {
  await open(page, 5, DRAFT_TO_STEP_5)
  // 5. Cobertura.
  await pickColor(card(page), '#d44c49')
  await proceed(page)
  // 6. Decoración: rosas con un color propio.
  await card(page).getByRole('radio', { name: 'Rosas' }).check()
  await card(page).getByRole('radio', { name: 'Elegir un color' }).check()
  await expect(picker(page).locator('legend')).toHaveText('Elige el color de la decoración')
  await pickColor(card(page), '#4dc707')
  await proceed(page)
  // 7. Mensaje: color propio.
  await card(page).getByLabel('Agregar un mensaje').check()
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumple')
  await card(page).getByRole('radio', { name: /^Elegir un color/ }).check()
  await expect(picker(page).locator('legend')).toHaveText('Elige el color del texto')
  await pickColor(card(page), '#12ab9f')
  await proceed(page)
  // 8. Revisión.
  await expect(page.locator('#paso-titulo')).toHaveText('8. Revisión')
  const breakdown = page.getByTestId('desglose')
  await expect(breakdown).toContainText('Color #D44C49, parecido a rojo')
  await expect(breakdown).toContainText('Color #4DC707, parecido a verde')
  await expect(breakdown).toContainText('Color #12AB9F, parecido a turquesa')
  const rowColors = await breakdown.evaluate((el) => {
    const swatches = [...el.querySelectorAll<HTMLElement>('li span[aria-hidden=true] > span')].map((swatch) => swatch.style.backgroundColor)
    return swatches
  })
  expect(rowColors).toEqual(expect.arrayContaining(['rgb(212, 76, 73)', 'rgb(77, 199, 7)', 'rgb(18, 171, 159)']))
  // El precio no cambia por un color libre: sin decoración extra, solo las rosas ($120) y la base.
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? 'null'))
  const [line] = cart.items
  expect(line.design).toMatchObject({ coverageColor: '#d44c49', decorationColor: '#4dc707', message: { color: { mode: 'custom', value: '#12ab9f' } } })
  expect(line.details).toEqual(
    expect.arrayContaining([
      'Cobertura: Crema pastelera, #D44C49, parecido a rojo',
      expect.stringContaining('Rosas, color #4DC707, parecido a verde'),
      expect.stringContaining('Mensaje: Feliz cumple, color #12AB9F, parecido a turquesa'),
    ]),
  )
})

test('a free color costs nothing extra: the price request carries no color and the total is the same for any color', async ({ page }) => {
  const prices = await open(page, 5, DRAFT_TO_STEP_5)
  const totals: string[] = []
  for (const hex of ['#fae496', '#12ab9f', '#000000']) {
    await pickColor(card(page), hex)
    await expect(page.getByTestId('total-estimado').first()).toHaveAttribute('data-state', 'ready')
    totals.push((await page.getByTestId('total-estimado').first().textContent()) ?? '')
  }
  expect(new Set(totals).size).toBe(1)
  expect(JSON.stringify(prices)).not.toMatch(/#[0-9a-f]{6}|color/i)
})

// --- Borradores y carritos viejos ---

test('an old draft with list slugs opens with the matching codes in the review and is saved migrated', async ({ page }) => {
  await open(page, 8, {
    ...DRAFT_TO_STEP_8, coverageColor: 'rojo', decoration: 'flores', decorationColor: 'azulfuerte',
    messageEnabled: true, message: { text: 'Hola', color: { mode: 'list', value: 'lila' } },
  })
  const breakdown = page.getByTestId('desglose')
  await expect(breakdown).toContainText('Color #D44C48, parecido a rojo')
  await expect(breakdown).toContainText('Color #4A70BA, parecido a azul fuerte')
  await expect(breakdown).toContainText('Color #CCBAE4, parecido a lila')
  await expect.poll(async () => (await draftOf(page)).coverageColor).toBe('#d44c48')
  const draft = await draftOf(page)
  expect(draft).toMatchObject({ decorationColor: '#4a70ba', message: { color: { mode: 'custom', value: '#ccbae4' } } })
})

test('an old draft whose color is no longer in the list goes back to ask for the cover color and never breaks the page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page, 8, { ...DRAFT_TO_STEP_8, coverageColor: 'color-que-ya-no-existe', decorationColor: 'otro-viejo', decoration: 'flores' })
  // La cobertura se vuelve a confirmar: el primer paso sin completar es el 5, con el primer color de la lista a la vista.
  await expect(page.locator('#paso-titulo')).toHaveText('5. Cobertura')
  await expect(picker(page)).toBeVisible()
  const draft = await draftOf(page)
  expect(draft.coverageColor).toBeNull()
  expect(draft.decorationColor).toBeNull()
  expect(errors).toEqual([])
})

test('a cart line saved with list slugs is dropped with its images and the page keeps working; a line with codes is kept', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/legal')
  const keys = await page.evaluate(async (urls) => {
    const { saveDesignImage } = await import(urls.images)
    const blob = new Blob(['x'], { type: 'image/png' })
    return { old: await saveDesignImage({ blob, name: 'vieja.png' }), fresh: await saveDesignImage({ blob, name: 'nueva.png' }) }
  }, MODELS)
  expect(keys.old).toBeTruthy()
  const line = (id: string, design: object, image: string) => ({
    kind: 'design', designId: id, name: `Pastel ${id}`, details: ['Tamaño: 15 kg'], total: '3825.00', baseDeposit: null, requiresQuote: false, quantity: 1, design, images: { wafer: image },
  })
  await page.evaluate(
    ({ old, fresh }) => localStorage.setItem('ilusion.cart.v1', JSON.stringify({ items: [old, fresh] })),
    { old: line('vieja', { coverageColor: 'rosa', decorationColor: null, message: null }, keys.old!), fresh: line('nueva', { coverageColor: '#f6b8ca', decorationColor: null, message: { color: { mode: 'custom', value: '#12ab9f' } } }, keys.fresh!) },
  )
  await page.reload()
  await expect(page.getByRole('banner').getByTestId('contador-carrito')).toHaveText('1')
  // Las imágenes de la línea descartada se borran de IndexedDB; las de la que se queda, no.
  const imageName = (key: string) =>
    page.evaluate(async ({ urls, key }) => (await (await import(urls.images)).readDesignImage(key))?.name ?? null, { urls: MODELS, key })
  const freshName = await imageName(keys.fresh!)
  await expect.poll(() => imageName(keys.old!)).toBeNull()
  expect(freshName).toBe('nueva.png')
  expect(errors).toEqual([])
  // Otro tipo de mal: un modo de texto viejo (`list`) en una línea guardada también se descarta.
  const result = await page.evaluate(async (urls) => {
    const cart = await import(urls.cart)
    const base = { kind: 'design', designId: 'abc', name: 'P', details: [], total: '1.00', baseDeposit: null, requiresQuote: false, quantity: 1, images: {} }
    const parse = (design: object) => cart.parseCart({ items: [{ ...base, design }] }).items.length
    return [
      parse({ message: { color: { mode: 'list', value: 'rosa' } } }),
      parse({ message: { color: { mode: 'custom', value: 'rosa' } } }),
      parse({ message: { color: { mode: 'custom', value: '#12ab9f' } } }),
      parse({ message: { color: { mode: 'auto', value: null } }, coverageColor: '#12ab9f', decorationColor: null }),
      parse({ decorationColor: 'verde' }),
      parse({ kg: 15 }),
    ]
  }, MODELS)
  expect(result).toEqual([0, 0, 1, 1, 0, 1])
})

test('dropping an old cart line keeps an image another line still uses, ignores keys that are not image slots, and rewrites the stored cart once', async ({ page }) => {
  await page.goto('/legal')
  const keys = await page.evaluate(async (urls) => {
    const { saveDesignImage } = await import(urls.images)
    const blob = new Blob(['x'], { type: 'image/png' })
    return { shared: await saveDesignImage({ blob, name: 'compartida.png' }), alone: await saveDesignImage({ blob, name: 'sola.png' }), stray: await saveDesignImage({ blob, name: 'ajena.png' }) }
  }, MODELS)
  const line = (id: string, design: object, images: object) => ({
    kind: 'design', designId: id, name: `Pastel ${id}`, details: ['Tamaño: 15 kg'], total: '3825.00', baseDeposit: null, requiresQuote: false, quantity: 1, design, images,
  })
  await page.evaluate(
    (items) => localStorage.setItem('ilusion.cart.v1', JSON.stringify({ items })),
    [
      // La vieja usa la imagen compartida, la propia y una clave que no es de ninguna ranura (no se toca).
      line('vieja', { coverageColor: 'rosa' }, { wafer: keys.shared, decoration: keys.alone, extra: keys.stray }),
      line('nueva', { coverageColor: '#f6b8ca' }, { wafer: keys.shared }),
    ],
  )
  await page.reload()
  await expect(page.getByRole('banner').getByTestId('contador-carrito')).toHaveText('1')
  const imageName = (key: string) => page.evaluate(async ({ urls, key }) => (await (await import(urls.images)).readDesignImage(key))?.name ?? null, { urls: MODELS, key })
  await expect.poll(() => imageName(keys.alone!)).toBeNull()
  expect(await imageName(keys.shared!)).toBe('compartida.png')
  expect(await imageName(keys.stray!)).toBe('ajena.png')
  // Lo guardado ya no trae la línea vieja: no se vuelve a descartar en cada carga.
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? 'null'))).items.map((item: { designId: string }) => item.designId)).toEqual(['nueva'])
  const result = await page.evaluate(async (urls) => {
    const cart = await import(urls.cart)
    return cart.readCart().discarded ?? null
  }, MODELS)
  expect(result).toBeNull()
})

// --- Móvil y movimiento reducido ---

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the picker fits in 390 px, the bars are at least 44 px tall and a finger sets them', async ({ page }) => {
    await open(page, 5, DRAFT_TO_STEP_5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const hue = bar(page, 'Tono')
    await hue.scrollIntoViewIfNeeded()
    for (const name of ['Tono', 'Intensidad', 'Claridad'] as const) {
      const box = (await bar(page, name).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
    }
    const input = (await field(page).boundingBox())!
    expect(input.height).toBeGreaterThanOrEqual(44)
    const box = (await hue.boundingBox())!
    await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height / 2)
    const value = Number(await hue.getAttribute('aria-valuenow'))
    expect(value).toBeGreaterThan(240)
    expect(value).toBeLessThan(300)
    await expect.poll(async () => (await draftOf(page)).coverageColor).not.toBe('#fae496')
    // La tarjeta sigue sin desbordar y "Continuar" se alcanza.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await expect(card(page).getByRole('button', { name: 'Continuar', exact: true })).toBeVisible()
  })

  test('on a bar, a vertical gesture does not change the value, a horizontal one does and a tap sets it', async ({ page }) => {
    await open(page, 5, { ...DRAFT_TO_STEP_5, coverageColor: '#ff0000' })
    const hue = bar(page, 'Tono')
    await hue.scrollIntoViewIfNeeded()
    const box = (await hue.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    const touch = async (points: { x: number; y: number }[]) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
      for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    // Empieza sobre la barra y sube: es el scroll de la página, el valor no se mueve ni un instante.
    const seen: string[] = []
    await page.exposeFunction('noteValue', (value: string) => seen.push(value))
    await hue.evaluate((el) => new MutationObserver(() => (window as unknown as { noteValue: (v: string) => void }).noteValue(el.getAttribute('aria-valuenow') ?? '')).observe(el, { attributes: true, attributeFilter: ['aria-valuenow'] }))
    await touch([{ x, y }, { x, y: y - 10 }, { x: x + 2, y: y - 25 }, { x: x + 3, y: y - 40 }])
    await page.waitForTimeout(300)
    expect(seen).toEqual([])
    await expect(hue).toHaveAttribute('aria-valuenow', '0')
    // Empieza horizontal: se arrastra. (El gesto vertical pudo mover la página: la barra se vuelve a medir.)
    await hue.scrollIntoViewIfNeeded()
    const moved = (await hue.boundingBox())!
    const y2 = moved.y + moved.height / 2
    await touch([{ x, y: y2 }, { x: x + 20, y: y2 }, { x: x + 60, y: y2 }, { x: x + 100, y: y2 }])
    await expect.poll(async () => Number(await hue.getAttribute('aria-valuenow'))).toBeGreaterThan(180)
  })

  test('the decoration picker also fits in 390 px', async ({ page }) => {
    await open(page, 6, { ...DRAFT_TO_STEP_8, coverageColor: '#f6b8ca', decoration: 'duya', confirmed: [1, 2, 3, 4, 5] })
    await card(page).getByRole('radio', { name: 'Elegir un color' }).check()
    await expect(picker(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('the text picker also fits in 390 px', async ({ page }) => {
    await open(page, 7, { ...DRAFT_TO_STEP_8, coverageColor: '#f6b8ca', confirmed: [1, 2, 3, 4, 5, 6] })
    await card(page).getByLabel('Agregar un mensaje').check()
    await card(page).getByRole('radio', { name: /^Elegir un color/ }).check()
    await expect(picker(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test('the picker has no animation or transition, so it already respects prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 5, DRAFT_TO_STEP_5)
  const motion = await picker(page).evaluate((el) =>
    [el, ...el.querySelectorAll('*')].map((node) => {
      const style = getComputedStyle(node)
      return { name: style.animationName, transition: style.transitionDuration }
    }),
  )
  expect(motion.every((entry) => entry.name === 'none' && /^0s(, 0s)*$/.test(entry.transition))).toBe(true)
  await bar(page, 'Tono').focus()
  await page.keyboard.press('ArrowRight')
  await expect(code(page)).not.toHaveText(cakeDesignOptions.coverage_colors[0].preview_color.toUpperCase())
})
