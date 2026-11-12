import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, mockCakeDesignOptions, mockCakeDesignPrice, PRICE_PATH, priceResponse, withPendingWafer } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Diseña tu pastel", paso 7 (mensaje y oblea) y paso 8 (revisión), D55. La API se simula (`support/cake-design.ts`); los
 * montos de la revisión son los que da ese simulacro, como los daría el backend. Corre en escritorio (1440 px) salvo donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// Los módulos se importan en el navegador desde el servidor de desarrollo (no hay corredor de pruebas unitarias).
const GEOMETRY_MODULE = '/src/viewmodels/lidGeometry.ts'
const CART_MODULE = '/src/models/cart.ts'

const DRAFT_TO_STEP_7 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: 'lila', decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6],
}

async function seedDraft(page: Page, draft: object) {
  // Solo la primera vez: tras recargar, manda el borrador que guardó la propia pantalla.
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('ilusion.cakeDesign.v1')) sessionStorage.setItem('ilusion.cakeDesign.v1', value)
  }, JSON.stringify(draft))
}

async function open(page: Page, step: number, draft: object = DRAFT_TO_STEP_7, options: typeof cakeDesignOptions = cakeDesignOptions) {
  await seedDraft(page, draft)
  await mockCakeDesignOptions(page, { status: 200, body: options })
  const prices = await mockCakeDesignPrice(page, options)
  await page.goto(`/pedido/disena?paso=${step}`)
  await expect(page.locator('#paso-titulo')).toBeVisible()
  return prices
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const editor = (page: Page) => page.getByTestId('editor-tapa')
const proceed = (page: Page, name = 'Continuar') => card(page).getByRole('button', { name, exact: true }).click()
const total = (page: Page) => page.getByTestId('total-estimado').first()
/** Un chip de dos o más opciones (su casilla está oculta): se elige tocando su etiqueta. */
const chip = (page: Page, name: string) => card(page).locator('label').filter({ hasText: new RegExp(`^${name}$`) })

async function addMessage(page: Page, text = 'Feliz cumpleaños Ana') {
  await card(page).getByLabel('Agregar un mensaje').check()
  await card(page).getByLabel('Tu mensaje').fill(text)
}

async function addWafer(page: Page, name = 'foto.png', buffer: Buffer = PNG) {
  await card(page).getByLabel('Agregar una oblea con tu imagen').check()
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer })
  await expect(card(page).getByText(name, { exact: true })).toBeVisible()
}

/** El acomodo de la oblea y del mensaje, leído del borrador guardado. */
const draftOf = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('ilusion.cakeDesign.v1') ?? '{}'))

// --- Paso 7: el mensaje ---

test('the message is optional, free, and the step continues without it', async ({ page }) => {
  await open(page, 7)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(card(page).getByText('Incluido', { exact: true })).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('the counter suggests four words, never blocks, and tells how many there are', async ({ page }) => {
  await open(page, 7)
  await card(page).getByLabel('Agregar un mensaje').check()
  const field = card(page).getByLabel('Tu mensaje')
  await expect(card(page).getByText('0 de 4 palabras')).toBeVisible()
  await expect(card(page).getByText('Las frases cortas se leen mejor: hasta 4 palabras.')).toBeVisible()
  await field.fill('Feliz cumpleaños Ana')
  await expect(card(page).getByText('3 de 4 palabras')).toBeVisible()
  await field.fill('Feliz cumpleaños mi querida amiga Ana')
  await expect(card(page).getByText('6 de 4 palabras')).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('an added message without text asks for the text and does not continue', async ({ page }) => {
  await open(page, 7)
  await card(page).getByLabel('Agregar un mensaje').check()
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Escribe tu mensaje o quítalo.' })).toBeVisible()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
})

test('the message is drawn in the top view with the handwritten font and black by default', async ({ page }) => {
  await open(page, 7)
  await addMessage(page)
  const text = editor(page).locator('[data-testid=mensaje-editor] text').first()
  await expect(text).toHaveText('Feliz cumpleaños Ana')
  await expect(text.locator('xpath=..')).toHaveAttribute('fill', '#000000')
  await expect(text.locator('xpath=..')).toHaveAttribute('font-family', /Dancing Script/)
  // La letra de verdad se carga (no solo se nombra).
  expect(await page.evaluate(() => document.fonts.check('600 40px "Dancing Script"'))).toBe(true)
})

test('the text color has three modes: automatic black, combining tones and the full list of eleven', async ({ page }) => {
  await open(page, 7)
  await addMessage(page)
  const ink = () => editor(page).locator('[data-testid=mensaje-editor] > g').first().getAttribute('fill')
  await expect(card(page).getByRole('radio', { name: /^Automático/ })).toBeChecked()
  expect(await ink()).toBe('#000000')
  await card(page).getByRole('radio', { name: /^Colores que combinan/ }).check()
  await expect(card(page).getByRole('radio', { name: 'Más oscuro' })).toBeChecked()
  await expect(card(page).getByRole('radio', { name: 'Más claro' })).toBeVisible()
  const deep = await ink()
  expect(deep).toMatch(/^#[0-9a-f]{6}$/)
  expect(deep).not.toBe('#000000')
  await card(page).getByText('Más claro', { exact: true }).click()
  expect(await ink()).not.toBe(deep)
  await card(page).getByRole('radio', { name: /^Lista completa/ }).check()
  const list = card(page).locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Elige el color' }) }).last()
  await expect(list.getByRole('radio')).toHaveCount(11)
  await card(page).getByText('Rojo', { exact: true }).click()
  expect(await ink()).toBe('#d44c48')
  expect((await draftOf(page)).message.color).toEqual({ mode: 'list', value: 'rojo' })
})

test('the contrast notice appears only when the text cannot be read (under 2:1), in the three modes', async ({ page }) => {
  await open(page, 7)
  await addMessage(page)
  const notice = card(page).getByRole('status').filter({ hasText: 'Se lee poco sobre tu cobertura' })
  // Automático: negro sobre lila, de sobra.
  await expect(notice).toHaveCount(0)
  // Colores que combinan: el tono más oscuro de la cobertura se lee; el más claro, no.
  await card(page).getByRole('radio', { name: /^Colores que combinan/ }).check()
  await expect(card(page).getByRole('radio', { name: 'Más oscuro' })).toBeChecked()
  await expect(notice).toHaveCount(0)
  await card(page).getByText('Más claro', { exact: true }).click()
  await expect(notice).toBeVisible()
  await card(page).getByText('Más oscuro', { exact: true }).click()
  await expect(notice).toHaveCount(0)
  // Lista completa: lila sobre lila casi no se ve; el azul fuerte sí.
  await card(page).getByRole('radio', { name: /^Lista completa/ }).check()
  await card(page).getByText('Lila', { exact: true }).click()
  await expect(notice).toBeVisible()
  await card(page).getByText('Azul fuerte', { exact: true }).click()
  await expect(notice).toHaveCount(0)
  // Un aviso nunca bloquea.
  await card(page).getByText('Lila', { exact: true }).click()
  await expect(notice).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('characters that do not print are dropped as you type, like the server would reject them', async ({ page }) => {
  await open(page, 7)
  await card(page).getByLabel('Agregar un mensaje').check()
  const field = card(page).getByLabel('Tu mensaje')
  const code = String.fromCharCode
  await field.fill(`a${code(0x202e)}b${code(0x200d)}c${code(0xad)}d${code(0x3164)}e${code(0x61c)}f`)
  await expect(field).toHaveValue('abcdef')
  // Los que se ven en blanco o no pintan nada: relleno de hangul, braille vacío, junta de grafemas, jemer y selectores mongoles.
  const blanks = [0xffa0, 0x2800, 0x34f, 0x17b4, 0x17b5, 0x180b, 0x180c, 0x180d, 0x180e, 0x180f].map((point) => code(point)).join('x')
  await field.fill(`a${blanks}b`)
  await expect(field).toHaveValue('axxxxxxxxxb')
  // Dos acentos seguidos caben; más, no.
  await field.fill(`a${code(0x301).repeat(79)}`)
  expect(((await field.inputValue()).match(/\u0301/g) ?? []).length).toBe(2)
  await field.fill('Feliz cumpleaños Ana')
  await expect(field).toHaveValue('Feliz cumpleaños Ana')
})

test('the message can be straight or on an arc with an adjustable curve', async ({ page }) => {
  await open(page, 7)
  await addMessage(page)
  const glyphs = editor(page).locator('[data-testid=mensaje-editor] text')
  await expect(glyphs).toHaveCount(1)
  await chip(page, 'En arco').click()
  await expect(glyphs).toHaveCount('Feliz cumpleaños Ana'.length)
  const rotations = async () => glyphs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
  const before = await rotations()
  expect(before[0]).toMatch(/rotate\(-?[1-9]/)
  await card(page).getByLabel('Curva').fill('-40')
  const flipped = await rotations()
  // Hacia el otro lado: el primer carácter gira al revés.
  const turn = (transform: string | null) => Math.sign(Number(/rotate\((-?[\d.]+)\)/.exec(transform ?? '')?.[1]))
  expect(turn(before[0])).toBe(-turn(flipped[0]))
  expect((await draftOf(page)).message).toMatchObject({ arrangement: 'arc', curve: -0.4 })
  await chip(page, 'Recto').click()
  await expect(glyphs).toHaveCount(1)
})

test('the message stays inside the lid: more size is capped at what fits', async ({ page }) => {
  await open(page, 7)
  await addMessage(page, 'Feliz cumpleaños muy querida Ana')
  await chip(page, 'Mensaje').click()
  const size = card(page).getByLabel('Tamaño', { exact: true })
  expect(Number(await size.getAttribute('max'))).toBeGreaterThan(0.08)
  await size.press('End')
  const inside = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid=editor-tapa]') as SVGSVGElement
    const text = svg.querySelector('[data-testid=mensaje-editor] > g') as SVGGElement
    const box = text.getBoundingClientRect()
    const lid = svg.querySelector('circle')!.getBoundingClientRect()
    const corners = [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]
    const [cx, cy, r] = [lid.left + lid.width / 2, lid.top + lid.height / 2, lid.width / 2]
    return corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= r + 1)
  })
  expect(inside).toBe(true)
})

// --- Paso 7: la oblea ---

test('the wafer shows its price from the API and adds it to the total', async ({ page }) => {
  const prices = await open(page, 7)
  await expect(card(page).getByText('+$125')).toBeVisible()
  await expect(total(page)).toHaveAttribute('data-state', 'ready')
  const before = Number(((await total(page).textContent()) ?? '').replace(/[^\d.]/g, ''))
  await addWafer(page)
  await expect.poll(() => prices.at(-1)?.wafer).toBe(true)
  await expect.poll(async () => Number(((await total(page).textContent()) ?? '').replace(/[^\d.]/g, ''))).toBe(before + 125)
  await card(page).getByLabel('Agregar una oblea con tu imagen').uncheck()
  await expect.poll(() => prices.at(-1)?.wafer).toBeUndefined()
})

test('a wafer without a price is disabled with "Precio por confirmar" and never reaches the price request', async ({ page }) => {
  const prices = await open(page, 7, DRAFT_TO_STEP_7, withPendingWafer())
  await expect(card(page).getByLabel('Agregar una oblea con tu imagen')).toBeDisabled()
  await expect(card(page).getByText('Precio por confirmar')).toBeVisible()
  expect(prices.every((body) => body.wafer === undefined)).toBe(true)
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('a wafer needs its image to continue, and keeps the same limits as "Otra decoración"', async ({ page }) => {
  await open(page, 7)
  await card(page).getByLabel('Agregar una oblea con tu imagen').check()
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Elige la imagen de la oblea.' })).toBeVisible()
  const alert = card(page).getByRole('alert').filter({ hasText: /Esa imagen|La imagen pesa/ })
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
  await expect(alert).toHaveText('Esa imagen no es JPG, PNG ni WebP. Elige otra.')
  await input.setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(alert).toHaveText('La imagen pesa más de 5 MB. Elige una más ligera.')
  await input.setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG })
  await expect(card(page).getByText('ok.png', { exact: true })).toBeVisible()
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('the wafer is a sheet or a circle, stretches by width and height and never passes the letter sheet', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  const wafer = editor(page).getByTestId('oblea-editor')
  await chip(page, 'Hoja').click()
  await expect(wafer.locator('g[style*="move"] rect').first()).toBeVisible()
  const width = card(page).getByLabel('Ancho')
  const height = card(page).getByLabel('Alto')
  // Hasta la carta, en cualquier orientación: 27.9 el lado largo y 21.6 el corto.
  expect(Number(await width.getAttribute('max'))).toBeLessThanOrEqual(27.9)
  await height.fill('10')
  await width.press('End')
  await height.press('End')
  const { widthCm, heightCm } = (await draftOf(page)).wafer
  expect(Math.max(widthCm, heightCm)).toBeLessThanOrEqual(27.9 + 1e-9)
  expect(Math.min(widthCm, heightCm)).toBeLessThanOrEqual(21.6 + 1e-9)
  await chip(page, 'Círculo').click()
  await expect(wafer.locator('g[style*="move"] circle').first()).toBeVisible()
  const circle = (await draftOf(page)).wafer
  expect(circle.widthCm).toBe(circle.heightCm)
  // Lo guardado es lo pedido; lo que se dibuja ya cabe en la carta (el diámetro, contra el lado corto).
  const drawn = Number(await wafer.locator('g[style*="move"] circle').first().getAttribute('r')) * 2
  expect(drawn).toBeLessThanOrEqual(21.6 + 1e-9)
  await expect(card(page).getByLabel('Ancho')).toHaveCount(0)
})

test('the wafer never leaves the lid, round or rectangular, with any rotation', async ({ page }) => {
  await open(page, 7)
  await page.goto('/')
  const result = await page.evaluate(async (module) => {
    const geometry = await import(module)
    const limits = { waferMaxWidthCm: 21.6, waferMaxHeightCm: 27.9 }
    const lids = [
      { form: 'round' as const, halfX: 14, halfY: 14, radius: 14 },
      { form: 'round' as const, halfX: 25.75, halfY: 25.75, radius: 25.75 },
      { form: 'rectangular' as const, halfX: 20.5, halfY: 13, radius: 13 },
    ]
    const base = { shape: 'sheet' as const, widthCm: 27, heightCm: 21, rotation: 0, x: 0, y: 0, imageZoom: 1, imageX: 0, imageY: 0 }
    const failures: string[] = []
    for (const lid of lids) {
      for (const shape of ['sheet', 'circle'] as const) {
        for (const rotation of [-180, -135, -90, -45, -10, 0, 30, 45, 90, 135, 180]) {
          for (const [x, y] of [[0, 0], [5, 5], [-5, 0.3], [0.9, 0.9], [-3, -3]]) {
            const fitted = geometry.fitWafer({ ...base, shape, rotation, x, y }, lid, limits)
            const points = shape === 'circle' ? [] : geometry.sheetCorners(fitted.widthCm, fitted.heightCm, fitted.rotation)
            const center = { x: fitted.x * lid.radius, y: fitted.y * lid.radius }
            const outside = shape === 'circle'
              ? !geometry.insideLid(lid, { x: center.x + Math.sign(center.x || 1) * fitted.widthCm / 2, y: 0 }, 1e-6) && lid.form === 'round' && Math.hypot(center.x, center.y) + fitted.widthCm / 2 > lid.radius + 1e-6
              : points.some((p: { x: number; y: number }) => !geometry.insideLid(lid, { x: center.x + p.x, y: center.y + p.y }, 1e-3))
            const letter = geometry.fitsLetter(shape, fitted.widthCm, fitted.heightCm, limits)
            if (outside || !letter) failures.push(`${lid.form} ${lid.radius} ${shape} ${rotation} ${x},${y}: outside=${outside} letter=${letter}`)
          }
        }
      }
    }
    // El límite carta, en las dos orientaciones.
    return {
      failures,
      portrait: geometry.fitsLetter('sheet', 21.6, 27.9, limits),
      landscape: geometry.fitsLetter('sheet', 27.9, 21.6, limits),
      tooBig: geometry.fitsLetter('sheet', 27.9, 21.7, limits),
      circle: [geometry.fitsLetter('circle', 21.6, 21.6, limits), geometry.fitsLetter('circle', 21.7, 21.7, limits)],
    }
  }, GEOMETRY_MODULE)
  expect(result.failures).toEqual([])
  expect(result).toMatchObject({ portrait: true, landscape: true, tooBig: false, circle: [true, false] })
})

test('the wafer moves with the position buttons, the keyboard and "Centrar", always inside the lid', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  const position = async () => (await draftOf(page)).wafer as { x: number; y: number }
  const start = await position()
  await card(page).getByRole('button', { name: 'Mover a la derecha' }).click()
  expect((await position()).x).toBeGreaterThan(start.x)
  await card(page).getByRole('button', { name: 'Mover hacia arriba' }).click()
  expect((await position()).y).toBeGreaterThan(start.y)
  await editor(page).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowDown')
  const moved = await position()
  expect(moved.x).toBeLessThan(0.05 + 1e-9)
  expect(moved.y).toBeLessThan(0.05)
  for (let i = 0; i < 40; i++) await card(page).getByRole('button', { name: 'Mover a la derecha' }).click()
  const far = await position()
  const wafer = (await draftOf(page)).wafer
  expect(far.x + wafer.widthCm / 2 / 14.5).toBeLessThanOrEqual(1.5)
  await card(page).getByRole('button', { name: 'Centrar' }).click()
  expect(await position()).toMatchObject({ x: 0, y: 0 })
})

test('dragging the wafer moves it and a corner resizes it, a handle turns it', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  // El editor queda abajo en la página: el puntero solo llega a lo que está en pantalla.
  await editor(page).scrollIntoViewIfNeeded()
  const body = editor(page).getByTestId('oblea-editor').locator('g[style*="move"] circle').first()
  const box = (await body.boundingBox())!
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 12, center.y - 8, { steps: 4 })
  await page.mouse.up()
  const moved = (await draftOf(page)).wafer
  expect(moved.x).toBeGreaterThan(0)
  expect(moved.y).toBeGreaterThan(0)
  // Una esquina: más chica con el puntero hacia el centro.
  const handles = editor(page).getByTestId('asas-oblea').locator('g[style*="nwse-resize"]')
  await expect(handles).toHaveCount(4)
  const corner = (await handles.nth(1).boundingBox())!
  const sizeBefore = (await draftOf(page)).wafer.widthCm
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
  await page.mouse.down()
  await page.mouse.move(corner.x + corner.width / 2 - 20, corner.y + corner.height / 2 + 20, { steps: 4 })
  await page.mouse.up()
  expect((await draftOf(page)).wafer.widthCm).toBeLessThan(sizeBefore)
  // El asa de arriba gira.
  const turn = (await editor(page).getByTestId('asas-oblea').locator('g[style*="grab"]').boundingBox())!
  await page.mouse.move(turn.x + turn.width / 2, turn.y + turn.height / 2)
  await page.mouse.down()
  await page.mouse.move(turn.x + turn.width / 2 + 60, turn.y + turn.height / 2 + 40, { steps: 4 })
  await page.mouse.up()
  expect(Math.abs((await draftOf(page)).wafer.rotation)).toBeGreaterThan(5)
})

test('the rotation slider turns the wafer and the image is framed inside it with zoom and pan', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  await chip(page, 'Hoja').click()
  await card(page).getByLabel('Giro').fill('30')
  await expect(editor(page).getByTestId('oblea-editor')).toHaveAttribute('transform', /rotate\(30\)/)
  const image = editor(page).locator('image')
  const read = () => image.evaluate((node) => ({ x: Number(node.getAttribute('x')), width: Number(node.getAttribute('width')) }))
  const first = await read()
  await card(page).getByLabel('Acercar la imagen dentro de la oblea').fill('2')
  const zoomed = await read()
  expect(zoomed.width).toBeCloseTo(first.width * 2, 3)
  await card(page).getByLabel('Mover la imagen a los lados').fill('1')
  // Con el zoom, sobra imagen: se corre hasta pegar su borde al de la oblea y no se sale.
  const moved = await read()
  expect(moved.x).toBeGreaterThan(zoomed.x === undefined ? 0 : zoomed.x)
  const stored = (await draftOf(page)).wafer
  expect(stored).toMatchObject({ imageZoom: 2, imageX: 1, rotation: 30 })
})

test('"Qué quieres acomodar" switches between the wafer and the message', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  await addMessage(page)
  await chip(page, 'Mensaje').click()
  await expect(chip(page, 'Recto')).toBeVisible()
  await expect(card(page).getByLabel('Forma de la oblea')).toHaveCount(0)
  await chip(page, 'Oblea').click()
  await expect(chip(page, 'Círculo')).toBeVisible()
  await expect(editor(page).getByTestId('asas-oblea')).toBeVisible()
  await expect(editor(page).getByTestId('asas-mensaje')).toHaveCount(0)
})

test('the saved layout holds shape, size, rotation, position, framing, and the message color, arrangement and position', async ({ page }) => {
  await open(page, 7)
  await addWafer(page, 'cumple.png')
  await addMessage(page)
  await chip(page, 'Mensaje').click()
  await chip(page, 'En arco').click()
  await proceed(page)
  const draft = await draftOf(page)
  expect(draft.wafer).toEqual(expect.objectContaining({ shape: 'circle', widthCm: expect.any(Number), heightCm: expect.any(Number), rotation: 0, x: expect.any(Number), y: expect.any(Number), imageZoom: 1, imageX: 0, imageY: 0 }))
  expect(draft.message).toEqual(expect.objectContaining({ text: 'Feliz cumpleaños Ana', arrangement: 'arc', color: { mode: 'auto', value: null }, scale: expect.any(Number), rotation: 0 }))
  expect(draft.waferImageName).toBe('cumple.png')
  expect(draft.confirmed).toContain(7)
})

test('reloading loses the wafer image, says so and asks for it again', async ({ page }) => {
  await open(page, 7)
  await addWafer(page, 'cumple.png')
  await proceed(page)
  await page.reload()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(page.getByText('Tu imagen ya no está')).toBeVisible()
  await proceed(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu imagen no se conservó al recargar. Elígela otra vez.' })).toBeVisible()
})

test('tampered data in the session falls back to safe values', async ({ page }) => {
  await open(page, 7, {
    ...DRAFT_TO_STEP_7,
    messageEnabled: true,
    message: { text: 'a'.repeat(500), color: { mode: 'list', value: '<script>' }, arrangement: 'arc', curve: 99, scale: -4, rotation: 1e9, x: 'x', y: null },
    waferEnabled: true,
    wafer: { shape: 'sheet', widthCm: 9999, heightCm: -1, rotation: 0, x: 0, y: 0, imageZoom: 1, imageX: 0, imageY: 0 },
  })
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  const draft = await draftOf(page)
  expect(draft.message.text.length).toBeLessThanOrEqual(80)
  expect(draft.message.color).toEqual({ mode: 'auto', value: null })
  expect(draft.message.scale).toBeGreaterThan(0)
  expect(draft.wafer).toBeNull()
})

// --- Paso 7 en móvil ---

test('on a phone the editor sits below the options, with the same controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 7)
  await addMessage(page)
  await addWafer(page)
  await expect(editor(page)).toBeVisible()
  const box = (await editor(page).boundingBox())!
  expect(box.width).toBeLessThanOrEqual(390)
  await expect(card(page).getByRole('button', { name: 'Centrar' })).toBeVisible()
  // No se sale de la pantalla a lo ancho.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('with reduced motion the step works the same and the preview jumps to the top view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 7)
  await addMessage(page)
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => page.locator('[data-elevation]').first().getAttribute('data-elevation')).toBe('78')
})

// --- Vista previa ---

test('the preview looks from above in step 7, from an intermediate angle in step 8 and from the front before', async ({ page }) => {
  await open(page, 7)
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  const elevation = () => page.locator('[data-elevation]').first().getAttribute('data-elevation')
  await expect.poll(elevation, { timeout: 8000 }).toBe('78')
  await proceed(page)
  await expect.poll(elevation, { timeout: 8000 }).toBe('32')
  await card(page).getByRole('button', { name: 'Atrás' }).click()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await card(page).getByRole('button', { name: 'Atrás' }).click()
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  await expect.poll(elevation, { timeout: 8000 }).toBe('15')
})

// --- Paso 8: la revisión ---

test('the review shows the backend amounts: order, base apart, total, advance, pay today and the rest', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_7, bread: 'chocolate', decoration: 'flores', confirmed: [1, 2, 3, 4, 5, 6, 7], messageEnabled: true, message: { text: 'Feliz cumpleaños Ana' } })
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  const breakdown = page.getByTestId('desglose')
  await expect(breakdown).toContainText('Pastel tres leches de pan de chocolate, relleno con queso y zarzamora')
  await expect(breakdown).toContainText('15 kg × $255 por kg')
  await expect(page.getByTestId('monto-cake')).toHaveText('$3,825')
  await expect(breakdown).toContainText('Cobertura de crema pastelera')
  await expect(breakdown).toContainText('Color: lila')
  await expect(page.getByTestId('monto-decoration')).toHaveText('+$120')
  await expect(page.getByTestId('monto-message')).toHaveText('Incluido')
  await expect(breakdown).toContainText('Base para 15 kg')
  await expect(breakdown).toContainText('te lo devolvemos si regresas la base en 15 días con tu nota')
  await expect(page.getByTestId('monto-stand')).toHaveText('$200')
  await expect(page.getByTestId('monto-total')).toHaveText('$3,945 MXN')
  await expect(page.getByTestId('monto-advance')).toHaveText('$1,972.50')
  await expect(breakdown).toContainText('Anticipo (50% del pedido)')
  await expect(page.getByTestId('monto-deposit')).toHaveText('$200')
  await expect(page.getByTestId('monto-today')).toHaveText('$2,172.50')
  await expect(page.getByTestId('monto-delivery')).toHaveText('$1,972.50')
  await expect(breakdown).toContainText('Hoy pagas el 50% del pedido más el depósito de la base, y el resto el día de la entrega.')
  await expect(breakdown).toContainText('tu pastel puede ser para dentro de 2 días o después')
})

test('if the price fails the review says so with "Volver a intentar": it never waits forever, and retrying brings the breakdown back', async ({ page }) => {
  await seedDraft(page, { ...DRAFT_TO_STEP_7, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await mockCakeDesignOptions(page)
  let healthy = false
  await page.route(PRICE_PATH, async (route) => {
    if (!healthy) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"no"}' })
    const response = priceResponse(route.request().postDataJSON())
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  await page.goto('/pedido/disena?paso=8')
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  const failure = card(page).getByRole('alert').filter({ hasText: 'No pudimos calcular tu pedido' })
  await expect(failure).toBeVisible()
  await expect(card(page).getByText('Calculando tu pedido…')).toHaveCount(0)
  await expect(card(page).getByRole('button', { name: 'Agregar al pedido' })).toBeDisabled()
  healthy = true
  await failure.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByTestId('desglose')).toBeVisible()
  await expect(failure).toHaveCount(0)
  await expect(page.getByTestId('monto-total')).toHaveText('$3,825 MXN')
  await expect(card(page).getByRole('button', { name: 'Agregar al pedido' })).toBeEnabled()
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
})

test('the step 7 price failure keeps its own "Volver a intentar" (the total card is still there)', async ({ page }) => {
  await seedDraft(page, DRAFT_TO_STEP_7)
  await mockCakeDesignOptions(page)
  await page.route(PRICE_PATH, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"no"}' }))
  await page.goto('/pedido/disena?paso=7')
  await expect(page.getByRole('button', { name: 'Volver a intentar' }).first()).toBeVisible()
})

test('the occasion is optional, does not change the price, and is saved in the draft', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_7, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  const select = card(page).getByLabel(/¿Para qué ocasión es\?/)
  await expect(select).toHaveValue('')
  await expect(select.locator('option')).toHaveText(['Elige una ocasión', 'Cumpleaños', 'Boda', 'XV años', 'Bautizo', 'Primera comunión', 'Baby shower', 'Graduación', 'Aniversario', 'Otra'])
  const before = await page.getByTestId('monto-total').textContent()
  await select.selectOption('birthday')
  await expect(page.getByTestId('monto-total')).toHaveText(before!)
  expect((await draftOf(page)).occasion).toBe('birthday')
})

test('a wafer adds its price to the order and to what is paid today', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  await proceed(page)
  await expect(page.getByTestId('monto-wafer')).toHaveText('+$125')
  await expect(page.getByTestId('monto-total')).toHaveText('$3,950 MXN')
  await expect(page.getByTestId('monto-today')).toHaveText('$2,175')
})

test('with "Otra decoración" nothing is charged: the order waits for the quote', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_7, decoration: 'otra', decorationImageName: 'ref.png', confirmed: [1, 2, 3, 4, 5, 6, 7] })
  // La imagen no sobrevive a la recarga: el paso 6 pide elegirla otra vez, y la revisión no se alcanza sin ella.
  await expect(stepTitle(page)).toHaveText('6. Decoración')
})

test('"Agregar al pedido" puts the design in the browser cart with its summary and price', async ({ page }) => {
  await open(page, 7, { ...DRAFT_TO_STEP_7, messageEnabled: true, message: { text: 'Feliz cumpleaños Ana' } })
  await addWafer(page, 'cumple.png')
  await proceed(page)
  await card(page).getByLabel(/¿Para qué ocasión es\?/).selectOption('birthday')
  await proceed(page, 'Agregar al pedido')
  const notice = page.getByTestId('aviso-carrito')
  await expect(notice).toContainText('Agregado al pedido')
  await expect(page.getByRole('banner').getByTestId('contador-carrito')).toHaveText('1')
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? 'null'))
  expect(cart.items).toHaveLength(1)
  const [line] = cart.items
  expect(line).toMatchObject({ kind: 'design', quantity: 1, total: '3950.00', baseDeposit: '200.00', requiresQuote: false })
  expect(line.name).toBe('Pastel tres leches de pan de chocolate, relleno con queso y zarzamora')
  expect(line.details).toEqual(expect.arrayContaining(['Mensaje y oblea: Mensaje: Feliz cumpleaños Ana. Oblea: círculo, cumple.png', 'Ocasión: Cumpleaños']))
  expect(line.design.wafer).toMatchObject({ shape: 'circle' })
  expect(line.design.occasion).toBe('birthday')
  // La imagen (de hasta 5 MB) no cabe en localStorage: va en IndexedDB y la línea solo lleva su clave.
  expect(JSON.stringify(cart)).not.toContain('iVBOR')
  const stored = await page.evaluate(
    (key) =>
      new Promise<{ name: string; size: number } | null>((resolve) => {
        const open = indexedDB.open('ilusion.designImages')
        open.onsuccess = () => {
          const get = open.result.transaction('images').objectStore('images').get(key)
          get.onsuccess = () => resolve(get.result ? { name: get.result.name, size: get.result.blob.size } : null)
        }
      }),
    line.images.wafer,
  )
  expect(stored).toEqual({ name: 'cumple.png', size: PNG.length })
  // El mismo diseño no entra dos veces.
  await proceed(page, 'Agregar al pedido')
  await expect(notice).toContainText('Ya está en tu pedido')
  await expect(page.getByRole('banner').getByTestId('contador-carrito')).toHaveText('1')
  await expect(page.getByRole('link', { name: 'Ir a mi pedido' })).toHaveAttribute('href', '/carrito')
})

test('"Diseñar otro pastel" starts over from step 1', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_7, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  await page.getByRole('button', { name: 'Diseñar otro pastel' }).click()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  expect((await draftOf(page)).cakeType).toBeNull()
})

test('the review has no total card, no "Tu pastel" and no bottom bar: each row carries its own "Cambiar"', async ({ page }) => {
  await open(page, 8, { ...DRAFT_TO_STEP_7, decoration: 'flores', messageEnabled: true, message: { text: 'Feliz cumpleaños Ana' }, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await expect(page.getByTestId('desglose')).toBeVisible()
  // Lo que repetía la tarjeta de revisión ya no está bajo la vista previa.
  await expect(page.getByTestId('total-estimado')).toHaveCount(0)
  await expect(page.getByText('Total estimado')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tu pastel', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('barra-movil')).toHaveCount(0)
  await expect(page.getByText(/^Ver tu pastel/)).toHaveCount(0)
  // La vista previa sigue ahí, con su pista.
  await expect(page.getByTestId('vista-previa')).toBeVisible()
  const rows = card(page).getByTestId('desglose').locator('li')
  const changeLink = (name: string) => card(page).getByRole('link', { name: `Cambiar ${name}` })
  await expect(changeLink('el pastel: tamaño, tipo, pan y relleno')).toHaveAttribute('href', '/pedido/disena?paso=1')
  await expect(changeLink('la cobertura')).toHaveAttribute('href', '/pedido/disena?paso=5')
  await expect(changeLink('la decoración')).toHaveAttribute('href', '/pedido/disena?paso=6')
  await expect(changeLink('el mensaje')).toHaveAttribute('href', '/pedido/disena?paso=7')
  // La base, los totales y los pagos no se cambian aquí.
  const withChange = await rows.filter({ has: page.getByRole('link', { name: /^Cambiar/ }) }).count()
  expect(withChange).toBe(4)
  await expect(card(page).getByTestId('monto-stand').locator('xpath=..').getByRole('link')).toHaveCount(0)
  for (const key of ['advance', 'deposit', 'today', 'delivery']) {
    await expect(card(page).getByTestId(`monto-${key}`).locator('xpath=..').getByRole('link')).toHaveCount(0)
  }
  // "Agregar al pedido" queda al final de la tarjeta.
  const buttonBox = (await card(page).getByRole('button', { name: 'Agregar al pedido' }).boundingBox())!
  const cardBox = (await card(page).boundingBox())!
  expect(buttonBox.y + buttonBox.height).toBeGreaterThan(cardBox.y + cardBox.height - 80)
  await changeLink('el mensaje').click()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(card(page).getByLabel('Tu mensaje')).toHaveValue('Feliz cumpleaños Ana')
})

test('the wafer row of the review goes to step 7; the cake row goes to the first step and the rest are reachable from there', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  await proceed(page)
  await card(page).getByRole('link', { name: 'Cambiar la oblea' }).click()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await proceed(page)
  await card(page).getByRole('link', { name: 'Cambiar el pastel: tamaño, tipo, pan y relleno' }).click()
  await expect(stepTitle(page)).toHaveText('1. Tamaño y forma')
  // Lo demás sigue completo: se vuelve a la revisión por la barra de pasos.
  await page.getByRole('link', { name: /Revisión/ }).or(page.getByRole('button', { name: /Revisión/ })).first().click()
  await expect(stepTitle(page)).toHaveText('8. Revisión')
})

test('on a phone the review has no "Ver tu pastel" and no bottom bar: "Agregar al pedido" ends the review card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 8, { ...DRAFT_TO_STEP_7, confirmed: [1, 2, 3, 4, 5, 6, 7] })
  await expect(page.getByTestId('desglose')).toBeVisible()
  await expect(page.getByTestId('barra-movil')).toHaveCount(0)
  await expect(page.getByText(/^Ver tu pastel/)).toHaveCount(0)
  await expect(page.getByText('Total estimado')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const button = card(page).getByRole('button', { name: 'Agregar al pedido' })
  await button.scrollIntoViewIfNeeded()
  await button.click()
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
})

test('the designer loading drawing has no candle either', async ({ page }) => {
  await open(page, 1, {})
  await expect(page.getByTestId('vista-previa').locator('svg path')).toHaveCount(1)
})

// --- El carrito con un pastel diseñado (modelo) ---

test('the cart model keeps designs apart from offerings, rejects duplicates and bad data, and lists image keys', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (module) => {
    const cart = await import(module)
    const design = { kind: 'design' as const, designId: 'abc123', name: 'Pastel tres leches', details: ['Tamaño: 15 kg'], total: '3825.00', baseDeposit: '200.00', requiresQuote: false, quantity: 1 as const, design: { kg: 15 }, images: { wafer: 'k1' } }
    const offering = { offeringId: 5, name: 'Tres leches', presentation: 'whole', unitPrice: '350.00', slug: 'tres-leches', fulfillment: 'order' }
    const one = cart.addDesign([], design)
    const again = cart.addDesign(one.items, design)
    const mixed = cart.addItem(one.items, offering, 2)
    const parsed = cart.parseCart(JSON.parse(JSON.stringify({ items: mixed.items })))
    let failure = ''
    try {
      cart.addDesign([], { ...design, total: 'mucho-secreto' })
    } catch (error) {
      failure = (error as Error).message
    }
    const bad = cart.parseCart({ items: [{ ...design, total: 'mucho' }, { ...design, designId: 'x y' }, { ...design, details: Array(30).fill('x') }, { ...design, quantity: 2 }, { ...design, kind: 'design2' }] })
    return {
      added: one.added,
      duplicate: [again.added, again.duplicate, again.items === one.items],
      count: cart.cartCount(mixed.items),
      kept: parsed.items.map((item: { kind: string }) => item.kind),
      removedOffering: cart.removeItem(mixed.items, { offeringId: 5, fulfillment: 'order' }).map((item: { kind: string }) => item.kind),
      removedDesign: cart.removeDesign(mixed.items, 'abc123').map((item: { kind: string }) => item.kind),
      keys: cart.imageKeysOf(mixed.items),
      bad: { items: bad.items.length, unknown: bad.unknown.length },
      failure,
    }
  }, CART_MODULE)
  expect(result).toEqual({
    added: true,
    duplicate: [false, true, true],
    count: 3,
    kept: ['design', 'offering'],
    removedOffering: ['design'],
    removedDesign: ['offering'],
    keys: ['k1'],
    bad: { items: 0, unknown: 1 },
    // El error no lleva el diseño: ni su total ni nada de lo que el cliente eligió.
    failure: 'El pastel diseñado no tiene la forma esperada.',
  })
})


// --- Ronda 1: textura del mensaje, ajuste al dibujar, vela, huella, accesibilidad ---

/** Los píxeles de la vista previa cercanos a un color: cuántos son, dónde está su centro y qué tan ancha es la mancha. */
async function inkStats(page: Page, hex: string) {
  const png = (await page.getByTestId('vista-previa').screenshot()).toString('base64')
  return page.evaluate(
    async ({ png, hex }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      let [count, sumX, sumY, minX, maxX] = [0, 0, 0, Infinity, -Infinity]
      for (let i = 0; i < data.length; i += 4) {
        const distance = Math.abs(data[i] - target[0]) + Math.abs(data[i + 1] - target[1]) + Math.abs(data[i + 2] - target[2])
        if (distance > 60) continue
        const [x, y] = [(i / 4) % canvas.width, Math.floor(i / 4 / canvas.width)]
        count++
        sumX += x
        sumY += y
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
      }
      return { count, cx: count ? sumX / count : 0, cy: count ? sumY / count : 0, width: count ? maxX - minX : 0, canvas: [canvas.width, canvas.height] }
    },
    { png, hex },
  )
}

test('the message texture is redrawn at its own size: the ink shows in the 3D top view, before and after a longer text or another curve', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, 7, { ...DRAFT_TO_STEP_7, coverageColor: 'blanco' })
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => page.locator('[data-elevation]').first().getAttribute('data-elevation'), { timeout: 15000 }).toBe('78')
  await card(page).getByLabel('Agregar un mensaje').check()
  await card(page).getByRole('radio', { name: /^Lista completa/ }).check()
  await card(page).getByText('Rojo', { exact: true }).click()
  await card(page).getByLabel('Tu mensaje').fill('Feliz')
  const RED = '#d44c48'
  // Tinta del color elegido, cerca del centro de la tapa (el mensaje está en el centro).
  await expect.poll(async () => (await inkStats(page, RED)).count, { timeout: 20000 }).toBeGreaterThan(30)
  const short = await inkStats(page, RED)
  const [w, h] = short.canvas
  expect(Math.abs(short.cx - w / 2)).toBeLessThan(w * 0.2)
  expect(Math.abs(short.cy - h / 2)).toBeLessThan(h * 0.3)
  // Un texto más largo: otro lienzo, más grande. Si se reutilizara el de antes, saldría estirado o no saldría.
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumpleaños Ana')
  await expect.poll(async () => (await inkStats(page, RED)).width, { timeout: 20000 }).toBeGreaterThan(short.width * 1.4)
  const long = await inkStats(page, RED)
  expect(long.count).toBeGreaterThan(short.count)
  // Otro color de tinta junto con otro texto: la textura nueva trae el color nuevo, no el viejo.
  await card(page).getByText('Azul fuerte', { exact: true }).click()
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumpleaños Ana María')
  const BLUE = '#4a70ba'
  await expect.poll(async () => (await inkStats(page, BLUE)).count, { timeout: 20000 }).toBeGreaterThan(30)
  expect((await inkStats(page, RED)).count).toBeLessThan(10)
  await card(page).getByText('Rojo', { exact: true }).click()
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumpleaños Ana')
  await expect.poll(async () => (await inkStats(page, RED)).count, { timeout: 20000 }).toBeGreaterThan(30)
  // Otra curva: otro lienzo, con las letras en otro lugar.
  await chip(page, 'En arco').click()
  await expect.poll(async () => Math.abs((await inkStats(page, RED)).cy - long.cy), { timeout: 20000 }).toBeGreaterThan(0.5)
  expect((await inkStats(page, RED)).count).toBeGreaterThan(30)
  // Más corto otra vez: la mancha vuelve a ser angosta (no queda el lienzo grande).
  await chip(page, 'Recto').click()
  await card(page).getByLabel('Tu mensaje').fill('Feliz')
  await expect.poll(async () => (await inkStats(page, RED)).width, { timeout: 20000 }).toBeLessThan(long.width * 0.8)
})

test('the lid stops at the flat top, short of the rounded edge of the tier, in the editor and in the 3D', async ({ page }) => {
  await page.goto('/')
  const radii = await page.evaluate(
    async ({ models, lid, fixture }) => {
      const { parseCakeDesignOptions } = await import(models)
      const { lidOf } = await import(lid)
      const options = parseCakeDesignOptions(fixture)
      const round = lidOf(options, 'round', 4, 1)
      const rectangular = lidOf(options, 'rectangular', 4, 1)
      return { round: [round.radius, round.halfX], rectangular: [rectangular.halfX, rectangular.halfY, rectangular.radius] }
    },
    { models: '/src/models/cakeDesign.ts', lid: '/src/viewmodels/cakeLid.ts', fixture: cakeDesignOptions },
  )
  // El molde de 4 kg mide 34 cm; el canto redondeado de 0.06 unidades son unos 0.88 cm (0.06 / 0.068).
  const edge = 0.06 / 0.068
  expect(radii.round[0]).toBeCloseTo(17 - edge, 3)
  expect(radii.round[1]).toBeCloseTo(17 - edge, 3)
  expect(radii.rectangular[0]).toBeCloseTo(41 / 2 - edge, 3)
  expect(radii.rectangular[1]).toBeCloseTo(26 / 2 - edge, 3)
  expect(radii.rectangular[2]).toBeCloseTo(26 / 2 - edge, 3)
})

test('what the person asked for is kept: a text that stops fitting shrinks only while it does not fit, and comes back', async ({ page }) => {
  await open(page, 7)
  await addMessage(page, 'Feliz cumple')
  await chip(page, 'Mensaje').click()
  await card(page).getByLabel('Tamaño', { exact: true }).press('End')
  const asked = (await draftOf(page)).message.scale
  const fontSize = async () => Number(await editor(page).locator('[data-testid=mensaje-editor] > g').first().getAttribute('font-size'))
  const first = await fontSize()
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumple muy querida amiga Ana')
  await expect.poll(fontSize).toBeLessThan(first * 0.99)
  // Lo pedido no se tocó: solo se achicó al dibujar.
  expect((await draftOf(page)).message.scale).toBe(asked)
  await card(page).getByLabel('Tu mensaje').fill('Feliz cumple')
  await expect.poll(fontSize).toBeCloseTo(first, 3)
})

test('a sheet that stops fitting when turned shrinks only while turned, and comes back', async ({ page }) => {
  // Una tapa rectangular (4 kg, 41 × 26 cm): en una redonda el giro no cambia lo que cabe.
  await open(page, 7, { ...DRAFT_TO_STEP_7, people: 28, form: 'rectangular', tiers: 1 })
  await addWafer(page)
  await chip(page, 'Hoja').click()
  await card(page).getByLabel('Alto').press('End')
  await card(page).getByLabel('Ancho').press('End')
  const asked = (await draftOf(page)).wafer
  const width = async () => Number(await editor(page).locator('[data-testid=oblea-editor] g[style*="move"] rect').first().getAttribute('width'))
  const straight = await width()
  await card(page).getByLabel('Giro').fill('45')
  await expect.poll(width).toBeLessThan(straight - 0.2)
  // El tope del tamaño lo dice en palabras.
  await expect(card(page).getByLabel('Tamaño', { exact: true })).toHaveAttribute('aria-valuetext', /con este giro el máximo es/)
  expect((await draftOf(page)).wafer).toMatchObject({ widthCm: asked.widthCm, heightCm: asked.heightCm })
  await card(page).getByLabel('Giro').fill('0')
  await expect.poll(width).toBeCloseTo(straight, 3)
})

test('the arrows and buttons say where the wafer ended up, and when it cannot go further', async ({ page }) => {
  await open(page, 7)
  await addWafer(page)
  const status = card(page).getByRole('status').filter({ hasText: /quedó|Ya no cabe/ })
  await card(page).getByRole('button', { name: 'Mover a la derecha' }).click()
  await expect(status).toHaveText(/La oblea quedó \d+ cm a la derecha del centro\./)
  for (let i = 0; i < 30; i++) await card(page).getByRole('button', { name: 'Mover a la derecha' }).click()
  await expect(status).toHaveText('Ya no cabe más a la derecha.')
  await editor(page).focus()
  await page.keyboard.press('ArrowUp')
  await expect(status).toHaveText(/La oblea quedó .* arriba/)
  await card(page).getByRole('button', { name: 'Centrar' }).click()
  await expect(status).toHaveText('La oblea quedó en el centro.')
})

test('the editor lets a finger scroll the page, and only the wafer, the message and the handles take the touch', async ({ page }) => {
  await open(page, 7)
  await addMessage(page)
  await addWafer(page)
  const action = (selector: string) => editor(page).locator(selector).first().evaluate((node) => getComputedStyle(node).touchAction)
  expect(await editor(page).evaluate((node) => getComputedStyle(node).touchAction)).toBe('pan-y')
  expect(await action('[data-testid=oblea-editor] g[style*="move"]')).toBe('none')
  expect(await action('[data-testid=mensaje-editor] > g')).toBe('none')
  expect(await action('[data-testid=asas-oblea] g[style*="nwse-resize"]')).toBe('none')
})

test('two different photos with the same name are two different cakes in the order', async ({ page }) => {
  await open(page, 7)
  await addWafer(page, 'foto.png')
  await proceed(page)
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  await card(page).getByRole('button', { name: 'Atrás' }).click()
  await card(page).getByRole('button', { name: /^Quitar/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(64)]) })
  await expect(card(page).getByText('foto.png', { exact: true })).toBeVisible()
  await proceed(page)
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  await expect(page.getByRole('banner').getByTestId('contador-carrito')).toHaveText('2')
  // Y el mismo pastel con la misma foto no entra otra vez.
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Ya está en tu pedido')
})
