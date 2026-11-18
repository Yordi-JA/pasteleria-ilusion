import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { designLine, seedCart } from './support/checkout.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Saltos de línea en el mensaje del pastel (paso 7, tanda 4): hasta 3 renglones, centrados; recto apila los renglones y en arco
 * cada uno va en su propio arco, paralelos y con el mismo centro. La API se simula (`support/cake-design.ts`).
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const DRAFT_KEY = 'ilusion.cakeDesign.v1'
const GEOMETRY_MODULE = '/src/viewmodels/messageGeometry.ts'
const LAYOUT_MODULE = '/src/models/cakeDesignLayout.ts'
const ORDERS_MODULE = '/src/models/orders.ts'
/** Los mismos números de `messageGeometry.ts` y de `design_layout.py`. */
const LINE_BOX = 1.05
const LINE_HEIGHT = 1.15

const DRAFT_TO_STEP_7 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6],
}
const MINI_TO_STEP_7 = {
  people: 3, cakeSize: 'mini', form: 'round', tiers: 1, cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal', flavorCount: 1,
  flavors: ['durazno'], coverageColor: COVERAGE_HEX.rosa, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6],
}

async function open(page: Page, draft: object = DRAFT_TO_STEP_7, step = 7) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value)
    },
    { key: DRAFT_KEY, value: JSON.stringify(draft) },
  )
  await mockCakeDesignOptions(page, { status: 200, body: cakeDesignOptions })
  await mockCakeDesignPrice(page, cakeDesignOptions)
  await page.goto(`/pedido/disena?paso=${step}`)
  await expect(page.locator('#paso-titulo')).toBeVisible()
}

const card = (page: Page) => page.getByTestId('tarjeta-paso')
const stepTitle = (page: Page) => page.locator('#paso-titulo')
const field = (page: Page) => card(page).getByLabel('Tu mensaje')
const glyphs = (page: Page) => page.getByTestId('editor-tapa').locator('[data-testid=mensaje-editor] text')
const proceed = (page: Page, name = 'Continuar') => card(page).getByRole('button', { name, exact: true }).click()
const chip = (page: Page, name: string) => card(page).locator('label').filter({ hasText: new RegExp(`^${name}$`) })
const draftOf = (page: Page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}'), DRAFT_KEY)
const lineLimit = (page: Page) => card(page).getByRole('status').filter({ hasText: 'Hasta 3 renglones' })

async function typeThreeLines(page: Page) {
  await card(page).getByLabel('Agregar un mensaje').check()
  await field(page).click()
  await page.keyboard.type('Feliz')
  await page.keyboard.press('Enter')
  await page.keyboard.type('cumpleaños')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('Ana')
}

const translateY = (transform: string | null) => Number(/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(transform ?? '')?.[2])

// --- El campo ---

test('Enter and Shift+Enter add a line, the step does not advance and line breaks are not words', async ({ page }) => {
  await open(page)
  await typeThreeLines(page)
  await expect(field(page)).toHaveValue('Feliz\ncumpleaños\nAna')
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await expect(card(page).getByText('3 de 4 palabras')).toBeVisible()
  await expect(card(page).getByText('Las frases cortas se leen mejor: hasta 4 palabras.')).toBeVisible()
  expect((await draftOf(page)).message.text).toBe('Feliz\ncumpleaños\nAna')
  await expect(lineLimit(page)).toHaveCount(0)
})

test('a fourth line is blocked and says why, by keyboard and by paste', async ({ page }) => {
  await open(page)
  await typeThreeLines(page)
  await page.keyboard.press('Enter')
  await expect(field(page)).toHaveValue('Feliz\ncumpleaños\nAna')
  await expect(lineLimit(page)).toBeVisible()
  await expect(lineLimit(page)).toHaveText('Hasta 3 renglones.')
  // Escribir en los 3 renglones lo quita.
  await page.keyboard.type('!')
  await expect(lineLimit(page)).toHaveCount(0)
  // Pegar 4 renglones junta el cuarto con el tercero.
  await field(page).fill('Feliz\ncumpleaños\nquerida\nAna')
  await expect(field(page)).toHaveValue('Feliz\ncumpleaños\nquerida Ana')
  await expect(lineLimit(page)).toBeVisible()
})

test('a stored draft without breaks still loads, and one with too many lines keeps three', async ({ page }) => {
  await open(page, { ...DRAFT_TO_STEP_7, messageEnabled: true, message: { text: 'Feliz cumpleaños Ana' } })
  await expect(field(page)).toHaveValue('Feliz cumpleaños Ana')
  await expect(glyphs(page)).toHaveCount(1)
  await expect(glyphs(page)).toHaveText('Feliz cumpleaños Ana')
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? '{}')
    sessionStorage.setItem(key, JSON.stringify({ ...draft, message: { ...draft.message, text: 'a\r\nb\rc\nd' } }))
  }, DRAFT_KEY)
  await page.reload()
  await expect(field(page)).toHaveValue('a\nb\nc d')
})

// --- El dibujo en el editor ---

test('straight lines are stacked and centered, and the box grows in height with each line', async ({ page }) => {
  await open(page, { ...DRAFT_TO_STEP_7, messageEnabled: true, message: { text: 'Feliz' } })
  await chip(page, 'Mensaje').click()
  const group = page.getByTestId('editor-tapa').locator('[data-testid=mensaje-editor] > g').first()
  // Todo se lee de una vez: la letra puede terminar de cargar entre dos lecturas y cambiar el tamaño.
  const snapshot = () =>
    page.getByTestId('mensaje-editor').evaluate((node) => {
      const textGroup = node.querySelector(':scope > g')!
      return {
        fontSize: Number(textGroup.getAttribute('font-size')),
        height: Number(textGroup.querySelector('rect')!.getAttribute('height')),
        transforms: [...textGroup.querySelectorAll('text')].map((text) => text.getAttribute('transform')),
      }
    })
  const heightInEm = async () => {
    const { fontSize, height } = await snapshot()
    return Number((height / fontSize).toFixed(4))
  }
  await expect(glyphs(page)).toHaveCount(1)
  // Un renglón mide 1.05 em de alto; tres, 1.05 em más dos distancias de 1.15 em.
  await expect.poll(heightInEm).toBeCloseTo(LINE_BOX, 3)
  await field(page).fill('Feliz\ncumpleaños\nAna')
  await expect(glyphs(page)).toHaveText(['Feliz', 'cumpleaños', 'Ana'])
  await expect.poll(heightInEm).toBeCloseTo(LINE_BOX + 2 * LINE_HEIGHT, 3)
  // Centrados (el texto se ancla al centro) y a la misma distancia: 1.15 veces el alto de la letra.
  await expect(group).toHaveAttribute('text-anchor', 'middle')
  const { fontSize, height: threeHeight, transforms: ys } = await snapshot()
  const [top, middle, bottom] = ys.map(translateY)
  expect(middle - top).toBeCloseTo(LINE_HEIGHT * fontSize, 4)
  expect(bottom - middle).toBeCloseTo(LINE_HEIGHT * fontSize, 4)
  expect(middle).toBeCloseTo(0, 4)
  for (const transform of ys) expect(transform).toMatch(/^translate\(0 /)
  // La caja que envuelve todo el bloque es la que mueven las asas.
  await expect(page.getByTestId('asas-mensaje')).toBeVisible()
  const handles = page.getByTestId('asas-mensaje').locator('rect').first()
  expect(Number(await handles.getAttribute('height'))).toBeCloseTo(threeHeight, 4)
})

test('on an arc each line follows its own arc, parallel and with the same center', async ({ page }) => {
  await open(page, { ...DRAFT_TO_STEP_7, messageEnabled: true, message: { text: 'Feliz\ncumpleaños\nAna', arrangement: 'arc', curve: 0.5 } })
  await expect(glyphs(page)).toHaveCount('Feliz'.length + 'cumpleaños'.length + 'Ana'.length)
  const result = await page.evaluate(async (url) => {
    const { messageGeometry, estimatedMetrics } = await import(url)
    const layout = { text: 'Feliz\ncumpleaños\nAna', color: { mode: 'auto', value: null }, arrangement: 'arc', curve: 0.5, scale: 0.2, rotation: 0, x: 0, y: 0 }
    const up = messageGeometry(layout, estimatedMetrics(layout.text), 10)
    const down = messageGeometry({ ...layout, curve: -0.5 }, estimatedMetrics(layout.text), 10)
    return { up, down }
  }, GEOMETRY_MODULE)
  const fontSize = 0.2 * 10
  for (const [geometry, direction] of [[result.up, 1], [result.down, -1]] as const) {
    const lines = [geometry.glyphs.slice(0, 5), geometry.glyphs.slice(5, 15), geometry.glyphs.slice(15)]
    // El centro común: sobre el eje del texto, donde la normal de la primera letra corta ese eje.
    const first = lines[0][0]
    // El giro de una letra es su ángulo sobre el arco, con el signo de la curva.
    const angle = (direction * first.rotation * Math.PI) / 180
    const radius0 = first.x / Math.sin(angle)
    const center = { x: 0, y: first.y - direction * radius0 * Math.cos(angle) }
    const radii = lines.map((line: { x: number; y: number }[]) => line.map((glyph) => Math.hypot(glyph.x - center.x, glyph.y - center.y)))
    for (const line of radii) for (const radius of line) expect(radius).toBeCloseTo(line[0], 6)
    // Hacia arriba, cada renglón va por dentro del anterior; hacia abajo, por fuera: siempre 1.15 em entre arcos.
    expect(direction * (radii[0][0] - radii[1][0])).toBeCloseTo(LINE_HEIGHT * fontSize, 6)
    expect(direction * (radii[1][0] - radii[2][0])).toBeCloseTo(LINE_HEIGHT * fontSize, 6)
  }
  // La caja crece con los renglones también en arco.
  const box = (geometry: { bounds: { minY: number; maxY: number } }) => geometry.bounds.maxY - geometry.bounds.minY
  expect(box(result.up)).toBeGreaterThan((LINE_BOX + 2 * LINE_HEIGHT) * fontSize - 1e-6)
})

test('a single line is drawn exactly as before, straight and on an arc', async ({ page }) => {
  await page.goto('/legal')
  const compared = await page.evaluate(async (url) => {
    const { messageGeometry, estimatedMetrics } = await import(url)
    // La geometría de una línea antes de los renglones (D55), copiada tal cual para compararla.
    const before = (layout: { text: string; arrangement: string; curve: number; scale: number }, radius: number) => {
      const fontSizeCm = layout.scale * radius
      const widths = [...layout.text].map(() => 0.5)
      const width = widths.reduce((a, b) => a + b, 0) * fontSizeCm
      const half = (1.05 * fontSizeCm) / 2
      if (layout.arrangement !== 'arc') {
        return { glyphs: [{ text: layout.text, x: 0, y: 0, rotation: 0 }], outline: [{ x: -width / 2, y: -half }, { x: width / 2, y: -half }, { x: width / 2, y: half }, { x: -width / 2, y: half }] }
      }
      const direction = layout.curve >= 0 ? 1 : -1
      const span = Math.max(Math.abs(layout.curve), 0.05) * Math.PI
      const arcRadius = width / span
      const onArc = (angle: number) => ({ x: arcRadius * Math.sin(angle), y: direction * arcRadius * (Math.cos(angle) - 1) })
      const lift = (direction * arcRadius * (1 - Math.cos(span / 2))) / 2
      let start = -width / 2
      const glyphs = [...layout.text].map((char, index) => {
        const advance = widths[index] * fontSizeCm
        const angle = (start + advance / 2) / arcRadius
        start += advance
        const point = onArc(angle)
        return { text: char, x: point.x, y: point.y + lift, rotation: (direction * (angle * 180)) / Math.PI }
      })
      const along = Array.from({ length: 15 }, (_, step) => -span / 2 + (span * step) / 14)
      const edge = (side: number) =>
        along.map((angle) => {
          const point = onArc(angle)
          return { x: point.x + side * half * direction * Math.sin(angle), y: point.y + lift + side * half * Math.cos(angle) }
        })
      return { glyphs, outline: [...edge(-1), ...edge(1).reverse()] }
    }
    const cases = [
      { text: 'Feliz cumpleaños Ana', arrangement: 'straight', curve: 0.5, scale: 0.22 },
      { text: 'Feliz cumpleaños Ana', arrangement: 'arc', curve: 0.5, scale: 0.22 },
      { text: 'Ana', arrangement: 'arc', curve: -0.8, scale: 0.4 },
    ]
    return cases.map((layout) => {
      const now = messageGeometry({ ...layout, color: { mode: 'auto', value: null }, rotation: 0, x: 0, y: 0 }, estimatedMetrics(layout.text), 12)
      const then = before(layout, 12)
      const gap = (a: number[], b: number[]) => Math.max(...a.map((value, index) => Math.abs(value - b[index])))
      return {
        glyphs: now.glyphs.length === then.glyphs.length && now.glyphs.every((glyph: { text: string }, index: number) => glyph.text === then.glyphs[index].text),
        glyphGap: gap(now.glyphs.flatMap((g: { x: number; y: number; rotation: number }) => [g.x, g.y, g.rotation]), then.glyphs.flatMap((g) => [g.x, g.y, g.rotation])),
        outline: now.outline.length === then.outline.length,
        outlineGap: gap(now.outline.flatMap((p: { x: number; y: number }) => [p.x, p.y]), then.outline.flatMap((p) => [p.x, p.y])),
      }
    })
  }, GEOMETRY_MODULE)
  for (const result of compared) {
    expect(result).toMatchObject({ glyphs: true, outline: true })
    expect(result.glyphGap).toBeLessThan(1e-9)
    expect(result.outlineGap).toBeLessThan(1e-9)
  }
})

// --- La vista previa 3D ---

/** Cuántos píxeles casi negros tiene la vista previa: el mensaje automático es negro y la cobertura lila no. */
async function darkPixels(page: Page): Promise<number> {
  const shot = await page.getByTestId('vista-previa').locator('canvas').first().screenshot()
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 120) dark++
    return dark
  }, shot.toString('base64'))
}

test('the 3D preview draws ink for a three-line message', async ({ page }) => {
  await open(page, DRAFT_TO_STEP_7)
  await expect(page.getByTestId('vista-previa')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => page.locator('[data-elevation]').first().getAttribute('data-elevation'), { timeout: 8000 }).toBe('78')
  const without = await darkPixels(page)
  await typeThreeLines(page)
  await expect.poll(() => darkPixels(page), { timeout: 10000 }).toBeGreaterThan(without + 150)
})

// --- Donde se muestra ---

test('the summary, the review and the cart keep the line breaks, without empty lines', async ({ page }) => {
  await open(page)
  await card(page).getByLabel('Agregar un mensaje').check()
  // Un renglón vacío en medio se queda en el campo mientras se escribe, pero no se dibuja ni se guarda.
  await field(page).fill('Feliz\n\nAna')
  await expect(glyphs(page)).toHaveText(['Feliz', 'Ana'])
  await field(page).fill('Feliz \ncumpleaños\nAna')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  const review = card(page).locator('li').filter({ hasText: 'Mensaje: Feliz' })
  expect(await review.locator('p').first().innerText()).toBe('Mensaje: Feliz\ncumpleaños\nAna')
  // "Tu pastel", junto a la vista previa: lista los pasos hechos que no son el de ahora, así que se ve desde el paso 6.
  await card(page).getByRole('link', { name: 'Cambiar la decoración' }).click()
  await expect(stepTitle(page)).toHaveText('6. Decoración')
  const lidRow = page.getByRole('region', { name: 'Lo que elegiste' }).getByRole('listitem').filter({ hasText: 'Mensaje y oblea' })
  expect(await lidRow.locator('p').nth(1).innerText()).toBe('Mensaje: Feliz\ncumpleaños\nAna')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  await proceed(page)
  await expect(stepTitle(page)).toHaveText('8. Revisión')
  await proceed(page, 'Agregar al pedido')
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? 'null'))
  const [line] = cart.items
  expect(line.design.message.text).toBe('Feliz\ncumpleaños\nAna')
  expect(line.details).toContain('Mensaje y oblea: Mensaje: Feliz\ncumpleaños\nAna')
  // Lo que va al servidor: el mismo texto, con `\n`.
  const request = await page.evaluate(async ({ url, snapshot }) => (await import(url)).designRequest(snapshot, {}), { url: ORDERS_MODULE, snapshot: line.design })
  expect(request.message_layout.text).toBe('Feliz\ncumpleaños\nAna')
})

test('the cart shows each line of the message on its own row', async ({ page }) => {
  await mockCakeDesignOptions(page, { status: 200, body: cakeDesignOptions })
  await seedCart(page, [{ ...designLine, details: [...designLine.details, 'Mensaje y oblea: Mensaje: Feliz\ncumpleaños\nAna'] }])
  await page.goto('/carrito')
  const detail = page.getByRole('region', { name: 'Productos' }).locator('li li').filter({ hasText: 'Mensaje y oblea' })
  expect(await detail.innerText()).toBe('Mensaje y oblea: Mensaje: Feliz\ncumpleaños\nAna')
})

test('the order request drops empty lines and the spaces beside a break', async ({ page }) => {
  await page.goto('/legal')
  const text = await page.evaluate(async ({ orders, layout }) => {
    const { designRequest } = await import(orders)
    const { messageText } = await import(layout)
    const snapshot = {
      people: 100, kg: 15, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso', flavors: ['zarzamora'],
      coverageColor: '#f6b8ca', decoration: 'ninguna', decorationColor: null, decorationImageName: null, wafer: null, waferImageName: null, occasion: null,
      message: { text: '\nFeliz \n\n  Ana\n', color: { mode: 'auto', value: null }, arrangement: 'straight', curve: 0.5, scale: 0.22, rotation: 0, x: 0, y: 0 },
    }
    return { request: designRequest(snapshot, {}).message_layout.text, canonical: messageText('\r\nFeliz \r\n\r\n  Ana\r\n') }
  }, { orders: ORDERS_MODULE, layout: LAYOUT_MODULE })
  expect(text).toEqual({ request: 'Feliz\nAna', canonical: 'Feliz\nAna' })
})

// --- La letra mínima en el mini ---

test('in the mini, three long lines do not fit with the 1.5 cm letter and say so; three short ones do', async ({ page }) => {
  await open(page, MINI_TO_STEP_7)
  await card(page).getByLabel('Agregar un mensaje').check()
  await field(page).fill('Feliz\ncumple\nAna')
  await expect(card(page).getByText('Tu mensaje no cabe en este pastel')).toHaveCount(0)
  await field(page).fill('Muchas felicidades abuelita\nte queremos mucho\nde parte de todos')
  await expect(card(page).getByText('Tu mensaje no cabe en este pastel')).toBeVisible()
  await proceed(page)
  await expect(card(page).getByText('Acorta tu mensaje: con letra de al menos 1.5 cm no cabe en el pastel.')).toBeVisible()
  await expect(stepTitle(page)).toHaveText('7. Mensaje y oblea')
  // La letra nunca baja del mínimo: 1.5 cm entre 6.12 cm de radio, también con 3 renglones.
  await chip(page, 'Mensaje').click()
  expect(Number(await card(page).getByLabel('Tamaño', { exact: true }).getAttribute('min'))).toBeCloseTo(1.5 / 6.12, 3)
})

// --- Móvil ---

test('on a phone the field has 16 px text and stays above the bottom bar while typing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await card(page).getByLabel('Agregar un mensaje').check()
  await field(page).focus()
  expect(await field(page).evaluate((node) => getComputedStyle(node).fontSize)).toBe('16px')
  await expect(field(page)).toHaveAttribute('enterkeyhint', 'enter')
  await page.keyboard.type('Feliz')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ana')
  await expect(field(page)).toHaveValue('Feliz\nAna')
  const box = (await field(page).boundingBox())!
  const bar = (await page.getByTestId('barra-movil').boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1)
})
