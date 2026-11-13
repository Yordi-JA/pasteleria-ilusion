import { expect, test } from '@playwright/test'
import { featuredProducts, mockCatalog, showcaseItems, TODAY } from './support/catalog.ts'
import { mockStoreInfo } from './support/store-info.ts'

// No hay corredor de pruebas unitarias: los módulos se importan en el navegador desde el servidor de desarrollo.
const MONEY = '/src/models/money.ts'
const DATES = '/src/models/dates.ts'
const PRESENTATION = '/src/models/presentation.ts'
const CATALOG = '/src/models/catalog.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCatalog(page)
  // Una vista que no pide el catálogo: las pruebas cuentan solo las peticiones que hacen ellas.
  await page.goto('/legal')
})

test('formatPrice shows Mexican pesos without .00, with thousands separators, from the API text', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { formatPrice } = await import(url)
    const inputs: unknown[] = ['350.00', '35.50', '35.5', '45', '1250.00', '1234567.89', '0.00', '0350.00', ' 350.00 ']
    const invalid: unknown[] = ['abc', '-1.00', '', '12.345', '1,250.00', '123456789.00', 350, null]
    return { valid: inputs.map((value) => formatPrice(value)), invalid: invalid.map((value) => formatPrice(value)) }
  }, MONEY)
  expect(result.valid).toEqual(['$350', '$35.50', '$35.50', '$45', '$1,250', '$1,234,567.89', '$0', '$350', '$350'])
  expect(result.invalid).toEqual(Array(8).fill(null))
})

// Las dos zonas más lejanas de UTC: si la fecha pasara por la zona del navegador, una de ellas cambiaría el día.
for (const timezoneId of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId })

    test('formatTodayDate gives the weekday and the date in Mexican Spanish, without time zone shifts', async ({ page }) => {
      const result = await page.evaluate(async (url) => {
        const { formatTodayDate } = await import(url)
        return {
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          dates: ['2026-11-06', '2026-01-01', '2026-12-31', '2027-02-28', '2026-02-30', '2026-11-6', 'hoy', '', null].map((value) =>
            formatTodayDate(value),
          ),
        }
      }, DATES)
      expect(result.zone).toBe(timezoneId)
      expect(result.dates).toEqual([
        'Viernes 6 de noviembre',
        'Jueves 1 de enero',
        'Jueves 31 de diciembre',
        'Domingo 28 de febrero',
        null,
        null,
        null,
        null,
        null,
      ])
    })
  })
}

test('offeringLabel names a presentation that is not the whole cake with the product', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { offeringLabel } = await import(url)
    return [
      offeringLabel('Tres leches de durazno', 'whole'),
      offeringLabel('Tres leches de cajeta', 'slice'),
      offeringLabel('Tres leches de cajeta', 'mini'),
      offeringLabel('Gelatina de mosaico', 'cup'),
      offeringLabel('Imposible', 'individual'),
      offeringLabel('Choco-pingüino', 'large'),
      offeringLabel('XV años', 'slice'),
    ]
  }, PRESENTATION)
  expect(result).toEqual([
    'Tres leches de durazno',
    'Rebanada de tres leches de cajeta',
    'Mini de tres leches de cajeta',
    'Vaso de gelatina de mosaico',
    'Individual de imposible',
    'Grande de choco-pingüino',
    // Una sigla al inicio conserva sus mayúsculas.
    'Rebanada de XV años',
  ])
})

test('parseProductCards keeps valid cards and drops malformed cards and offerings', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, cards }) => {
      const { parseProductCards } = await import(url)
      const [durazno] = cards as Record<string, unknown>[]
      const parsed = parseProductCards([
        { ...durazno, photo: 'tres-leches-durazno.webp' },
        { ...durazno, slug: '../admin' },
        { ...durazno, slug: 'sin-nombre', name: '   ' },
        { ...durazno, slug: 'categoria-rara', category: 'gelatina' },
        {
          ...durazno,
          slug: 'con-ofertas-malas',
          photo: 'https://ejemplo.com/foto.webp',
          summary: 7,
          offerings: [
            { id: 5, presentation: 'familiar', price: '10.00' },
            { id: 0, presentation: 'whole', price: '10.00' },
            { id: 6, presentation: 'whole', price: 10 },
            { id: 7, presentation: 'slice', price: '12.00' },
          ],
        },
        'texto',
        null,
      ])
      let notList = ''
      try {
        parseProductCards({ items: [] })
      } catch (error) {
        notList = (error as Error).name
      }
      return { parsed, notList }
    },
    { url: CATALOG, cards: featuredProducts },
  )
  expect(result.parsed).toHaveLength(2)
  expect(result.parsed[0]).toEqual({
    slug: 'tres-leches-de-durazno',
    name: 'Tres leches de durazno',
    category: 'cake',
    salesChannel: 'showcase_and_order',
    cakeType: 'tres_leches',
    bread: null,
    fillingBase: null,
    summary: 'Relleno de durazno y cobertura de crema pastelera.',
    photo: 'tres-leches-durazno.webp',
    inShowcaseToday: true,
    slicedToday: false,
    offerings: [
      { id: 1, presentation: 'whole', price: '350.00' },
      { id: 2, presentation: 'slice', price: '35.00' },
      { id: 3, presentation: 'mini', price: '130.00' },
    ],
  })
  // Una foto que no es un nombre de archivo queda pendiente; un resumen que no es texto queda vacío.
  expect(result.parsed[1]).toMatchObject({
    slug: 'con-ofertas-malas',
    photo: null,
    summary: '',
    offerings: [{ id: 7, presentation: 'slice', price: '12.00' }],
  })
  // Una respuesta que no es una lista es un error de la API, no una lista vacía.
  expect(result.notList).toBe('TypeError')
})

test('parseTodayStock reads the date and the items, marks sold out and drops malformed items', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, items, today }) => {
      const { parseTodayStock } = await import(url)
      const [durazno] = items as Record<string, unknown>[]
      const parsed = parseTodayStock({
        date: today,
        items: [
          durazno,
          { ...durazno, offering_id: 2, stock: 0, sold_out: false },
          { ...durazno, offering_id: 3, stock: 4, sold_out: true },
          { ...durazno, offering_id: 4, stock: -1 },
          { ...durazno, offering_id: 5, stock: 1.5 },
          { ...durazno, offering_id: 6, presentation: 'familiar' },
          { ...durazno, offering_id: 7, price: 'gratis' },
          { ...durazno, offering_id: 8, product_slug: 'a b' },
        ],
      })
      const badDate = parseTodayStock({ date: '6 de noviembre', items: [] })
      const errors = [null, 'texto', { date: today }, { date: today, items: {} }].map((data) => {
        try {
          parseTodayStock(data)
          return 'aceptado'
        } catch (error) {
          return (error as Error).name
        }
      })
      return { parsed, badDate, errors }
    },
    { url: CATALOG, items: showcaseItems, today: TODAY },
  )
  expect(result.parsed.date).toBe('2026-11-06')
  expect(result.parsed.items).toEqual([
    {
      offeringId: 1,
      productSlug: 'tres-leches-de-durazno',
      productName: 'Tres leches de durazno',
      category: 'cake',
      presentation: 'whole',
      price: '350.00',
      photo: null,
      stock: 2,
      soldOut: false,
      sliced: false,
    },
    // Con 0 piezas está agotada aunque `sold_out` diga otra cosa, y con `sold_out` no se ofrece aunque queden.
    expect.objectContaining({ offeringId: 2, stock: 0, soldOut: true }),
    expect.objectContaining({ offeringId: 3, stock: 4, soldOut: true }),
  ])
  expect(result.badDate).toEqual({ date: null, items: [] })
  expect(result.errors).toEqual(['TypeError', 'TypeError', 'TypeError', 'TypeError'])
})

test('the sliced cake (D60): `sliced` only counts on a slice, and `sliced_today` only when it is true', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, items, cards, today }) => {
      const { parseTodayStock, parseProductCards } = await import(url)
      const [durazno] = items as Record<string, unknown>[]
      const stock = parseTodayStock({
        date: today,
        items: [
          { ...durazno, offering_id: 1, presentation: 'slice', sliced: true },
          { ...durazno, offering_id: 2, presentation: 'whole', sliced: true },
          { ...durazno, offering_id: 3, presentation: 'slice', sliced: 'true' },
          { ...durazno, offering_id: 4, presentation: 'slice' },
        ],
      })
      const [card] = cards as Record<string, unknown>[]
      const parsed = parseProductCards([{ ...card, sliced_today: true }, { ...card, slug: 'otra', sliced_today: 'sí' }, { ...card, slug: 'sin' }])
      return {
        sliced: stock.items.map((item: { sliced: boolean }) => item.sliced),
        slicedToday: parsed.map((entry: { slicedToday: boolean }) => entry.slicedToday),
      }
    },
    { url: CATALOG, items: showcaseItems, cards: featuredProducts, today: TODAY },
  )
  expect(result.sliced).toEqual([true, false, false, false])
  expect(result.slicedToday).toEqual([true, false, false])
})

test('a list where every entry fails is an error; a partial one warns how many were dropped', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  const result = await page.evaluate(
    async ({ url, items, cards }) => {
      const { parseTodayStock, parseProductCards } = await import(url)
      const attempt = (run: () => unknown) => {
        try {
          run()
          return 'aceptado'
        } catch (error) {
          return (error as Error).name
        }
      }
      const [first] = items as Record<string, unknown>[]
      return {
        stockAllBad: attempt(() => parseTodayStock({ date: '2026-11-06', items: [{ ...first, stock: -1 }, 'x'] })),
        cardsAllBad: attempt(() => parseProductCards([{ slug: '../x' }, null])),
        empty: parseTodayStock({ date: '2026-11-06', items: [] }).items.length,
        partial: parseProductCards([...(cards as unknown[]), { slug: '../x' }, null]).length,
      }
    },
    { url: CATALOG, items: showcaseItems, cards: featuredProducts },
  )
  expect(result).toEqual({ stockAllBad: 'TypeError', cardsAllBad: 'TypeError', empty: 0, partial: 4 })
  await expect.poll(() => warnings.some((text) => text.includes('Se descartaron 2 de 6 tarjetas de producto'))).toBe(true)
})

test('photoUrl rebuilds the address only from a file name', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { photoUrl } = await import(url)
    return ['tres-leches.webp', '../admin.webp', 'https://ejemplo.com/a.webp', 'Foto.JPG', 'a.gif'].map((file) => photoUrl(file))
  }, CATALOG)
  expect(result).toEqual(['/fotos/tres-leches.webp', null, null, null, null])
})

test('parseStoreInfo keeps lead days whole and within a year, and does not read a list as a record', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { parseStoreInfo } = await import(url)
    return {
      days: [2, 0, 365, 366, 2.5, -1, Number.MAX_SAFE_INTEGER + 2, '2'].map((value) => parseStoreInfo({ custom_lead_days: value }).customLeadDays),
      list: parseStoreInfo([{ address: 'Calle 1' }]),
    }
  }, '/src/models/storeInfo.ts')
  expect(result.days).toEqual([2, 0, 365, null, null, null, null, null])
  expect(result.list).toEqual({ address: null, whatsapp: null, opensAt: null, closesAt: null, customLeadDays: null })
})

test('the cart adapters use the presentation label and the product slug', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, cards, items }) => {
      const { parseProductCards, parseTodayStock, toCartOffering, stockItemToCartOffering, featuredOffering, photoUrl } =
        await import(url)
      const [durazno, , imposible, gelatina] = parseProductCards(cards)
      const stock = parseTodayStock({ date: '2026-11-06', items }).items
      const mini = stock.find((item: { offeringId: number }) => item.offeringId === 3)
      return {
        whole: toCartOffering(durazno, featuredOffering(durazno)),
        wholeLater: featuredOffering(imposible),
        firstWhenNoWhole: toCartOffering(gelatina, featuredOffering(gelatina)),
        noOfferings: featuredOffering({ ...durazno, offerings: [] }),
        mini: stockItemToCartOffering(mini),
        photo: photoUrl('tres-leches-durazno.webp'),
      }
    },
    { url: CATALOG, cards: featuredProducts, items: showcaseItems },
  )
  expect(result.whole).toEqual({
    offeringId: 1,
    name: 'Tres leches de durazno',
    presentation: 'whole',
    unitPrice: '350.00',
    slug: 'tres-leches-de-durazno',
    fulfillment: 'order',
  })
  expect(result.wholeLater).toEqual({ id: 21, presentation: 'whole', price: '350.00' })
  expect(result.firstWhenNoWhole).toEqual({
    offeringId: 30,
    name: 'Vaso de gelatina de mosaico',
    presentation: 'cup',
    unitPrice: '45.50',
    slug: 'gelatina-de-mosaico',
    fulfillment: 'order',
  })
  expect(result.noOfferings).toBeNull()
  expect(result.mini).toEqual({
    offeringId: 3,
    name: 'Mini de tres leches de durazno',
    presentation: 'mini',
    unitPrice: '130.00',
    slug: 'tres-leches-de-durazno',
    fulfillment: 'showcase',
  })
  expect(result.photo).toBe('/fotos/tres-leches-durazno.webp')
})

test('the three requests go to their endpoints, with no query and no cache', async ({ page }) => {
  // Registrada después de la del `beforeEach`, esta simulación es la que responde y cuenta las peticiones.
  const requests = await mockCatalog(page)
  const result = await page.evaluate(async (url) => {
    const { getFeaturedProducts, getShowcase, getSlices } = await import(url)
    const signal = new AbortController().signal
    const [featured, showcase, slices] = await Promise.all([getFeaturedProducts(signal), getShowcase(signal), getSlices(signal)])
    // Una segunda llamada vuelve a pedir: las existencias cambian durante el día.
    await getShowcase(signal)
    return { featured: featured.length, showcase: showcase.items.length, slices: slices.items.length }
  }, CATALOG)
  expect(result).toEqual({ featured: 4, showcase: 10, slices: 4 })
  expect(requests.featured).toHaveLength(1)
  expect(requests.showcase).toHaveLength(2)
  expect(requests.slices).toHaveLength(1)
  for (const request of [...requests.featured, ...requests.showcase, ...requests.slices]) {
    expect(new URL(request.url()).search).toBe('')
    expect(request.headers().accept).toBe('application/json')
  }
})
