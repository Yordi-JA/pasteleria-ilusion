import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import { getProducts, SEARCH_MAX_LENGTH } from '../models/catalog.ts'
import type { CatalogQuery, ProductCard, ProductCategory } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { countLabel, toProductCardView } from './productCards.ts'
import { useRemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Parámetros del catálogo en la URL (las rutas del sitio van en español): `?categoria=pasteles&buscar=durazno`. */
export const CATEGORY_PARAM = 'categoria'
export const SEARCH_PARAM = 'buscar'

const CATEGORY_SLUGS: Record<ProductCategory, string> = { cake: 'pasteles', dessert: 'postres' }

/** Espera tras la última tecla antes de buscar: así no se pide a la API en cada tecla. */
export const SEARCH_DEBOUNCE_MS = 300

export type CatalogFilter = 'all' | ProductCategory

const FILTERS: { value: CatalogFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'cake', label: 'Pasteles' },
  { value: 'dessert', label: 'Postres' },
]

/**
 * Lo que la URL pide: una categoría que no se conoce es Todo, y la búsqueda se recorta y se corta a 80 caracteres,
 * el tope de la API (una URL editada a mano con más no termina en un 400).
 */
export function readCatalogQuery(params: URLSearchParams): CatalogQuery {
  const slug = params.get(CATEGORY_PARAM)
  const category = (Object.keys(CATEGORY_SLUGS) as ProductCategory[]).find((value) => CATEGORY_SLUGS[value] === slug) ?? null
  return { category, search: (params.get(SEARCH_PARAM) ?? '').trim().slice(0, SEARCH_MAX_LENGTH) }
}

/** La URL con la búsqueda nueva; vacía, sin el parámetro. Conserva los demás parámetros. */
function withSearch(params: URLSearchParams, search: string): URLSearchParams {
  const next = new URLSearchParams(params)
  if (search) next.set(SEARCH_PARAM, search)
  else next.delete(SEARCH_PARAM)
  return next
}

/** Marca de la entrada del historial que creó un chip: el chip siguiente la reemplaza en vez de agregar otra. */
const CHIP_ENTRY = { catalogChip: true } as const

function isChipEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>).catalogChip === true
}

/** Resultado de la última respuesta que llegó y de qué consulta era (`key`). */
type Result = { key: string; status: 'ready' | 'error'; cards: ProductCard[] }

/**
 * "Pastel mini, $130": se anuncia aparte si algún pastel de la lista tiene mini y todos cuestan lo mismo; si los
 * precios difieren, no se anuncia uno solo (no se inventa un "desde").
 */
function miniOffer(cards: ProductCard[]): string | null {
  const prices = new Set(cards.flatMap((card) => card.offerings.filter((offering) => offering.presentation === 'mini').map((offering) => offering.price)))
  if (prices.size !== 1) return null
  const price = formatPrice([...prices][0])
  return price ? `Pastel mini, ${price}` : null
}

/** El término como lo lee la persona, entre comillas latinas: «durazno». */
function quoted(search: string) {
  return `«${search}»`
}

/**
 * View-model de `/catalogo`. La categoría y la búsqueda viven en la URL (se pueden compartir y atrás las
 * restaura, también en el campo); el campo de búsqueda tiene su propio texto, que pasa a la URL 300 ms después de la última tecla
 * (o al instante con Enter). Cada cambio de la consulta cancela la petición anterior, así una respuesta lenta
 * nunca pisa a una más nueva. Mientras llega la nueva, los resultados anteriores quedan a la vista, tenues.
 */
export function useCatalog() {
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => readCatalogQuery(params), [params])
  const { category, search } = query
  const key = `${category ?? 'all'}|${search}`

  const location = useLocation()
  const navigationType = useNavigationType()

  // --- Búsqueda con espera ---
  const [text, setText] = useState(search)
  // Lo último que el campo mandó a la URL. Si la URL llega a ese valor, el cambio es del propio campo y no se toca lo
  // que la persona siguió escribiendo; si llega a otro, vino de fuera (un enlace) y el campo lo sigue.
  const [committed, setCommitted] = useState(search)
  const [urlSearch, setUrlSearch] = useState(search)
  const [entryKey, setEntryKey] = useState(location.key)
  // Se compara durante el render, sin efecto.
  if (entryKey !== location.key) {
    setEntryKey(location.key)
    // Atrás o adelante: el campo toma el término de esa entrada y se descarta lo que se escribía. Al cambiar el
    // texto, el efecto de la espera cancela su temporizador, que ya no reescribe la entrada a la que se volvió.
    if (navigationType === 'POP') {
      setText(search)
      setCommitted(search)
      setUrlSearch(search)
    }
  }
  if (urlSearch !== search) {
    setUrlSearch(search)
    if (search !== committed) {
      setText(search)
      setCommitted(search)
    }
  }

  // Si la entrada actual la creó el chip anterior de una racha. Es un ref y no un valor del render: con las flechas, el
  // siguiente chip puede llegar antes de que React vuelva a pintar, y `setFilter` lo marca en el acto. Cualquier
  // navegación que no hizo un chip termina la racha, también atrás o adelante (`POP`), aunque la entrada a la que se
  // vuelve la haya creado un chip: así el chip siguiente agrega su entrada y no reemplaza esa.
  const chipRun = useRef(false)
  useEffect(() => {
    chipRun.current = navigationType !== 'POP' && isChipEntry(location.state)
  }, [location.key, location.state, navigationType])

  const commitSearch = useCallback(
    (value: string) => {
      const term = value.trim().slice(0, SEARCH_MAX_LENGTH)
      chipRun.current = false
      setCommitted(term)
      setParams((prev) => withSearch(prev, term), { replace: true })
    },
    [setParams],
  )

  useEffect(() => {
    if (text.trim() === search) return
    const timer = setTimeout(() => commitSearch(text), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [commitSearch, search, text])

  const typeSearch = useCallback((value: string) => setText(value.slice(0, SEARCH_MAX_LENGTH)), [])
  /** Enter: busca ya, sin esperar. */
  const submitSearch = useCallback(() => commitSearch(text), [commitSearch, text])
  const clearSearch = useCallback(() => {
    setText('')
    commitSearch('')
  }, [commitSearch])

  // Cambiar de chip agrega una entrada al historial, así atrás vuelve al filtro anterior. Una racha de chips (las
  // flechas recorren el grupo y eligen cada uno) deja una sola: si la entrada actual la creó un chip, se reemplaza.
  const setFilter = useCallback(
    (filter: CatalogFilter) => {
      const replace = chipRun.current
      chipRun.current = true
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (filter === 'all') next.delete(CATEGORY_PARAM)
          else next.set(CATEGORY_PARAM, CATEGORY_SLUGS[filter])
          return next
        },
        { replace, state: CHIP_ENTRY },
      )
    },
    [setParams],
  )

  // --- Productos ---
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const current = `${category ?? 'all'}|${search}`
    getProducts({ category, search }, controller.signal).then(
      (cards) => {
        if (!controller.signal.aborted) setResult({ key: current, status: 'ready', cards })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el catálogo.', error)
        setResult({ key: current, status: 'error', cards: [] })
      },
    )
    return () => controller.abort()
  }, [attempt, category, search])

  const retry = useCallback(() => {
    setResult(null)
    setAttempt((count) => count + 1)
  }, [])

  /** `updating`: llegaron resultados de otra consulta y se espera la de ahora. */
  const status: 'loading' | 'ready' | 'updating' | 'error' =
    result === null ? 'loading' : result.key === key ? result.status : result.status === 'ready' ? 'updating' : 'loading'

  // Las opciones de "Diseña tu pastel" solo dan el precio por kilo de un pan de precio completo (Red velvet). Si
  // fallan, esa línea no sale y el catálogo sigue.
  const { state: optionsState } = useRemoteData(getCakeDesignOptions, 'No se pudo cargar el precio por kilo del catálogo.')
  const options = optionsState.status === 'ready' ? optionsState.data : null
  const store = useStoreDetails()

  const view = useMemo(() => {
    const cards = result && result.status === 'ready' ? result.cards : []
    const cakeCards = cards.filter((card) => card.category === 'cake')
    const dessertCards = cards.filter((card) => card.category === 'dessert')
    const cakes = category === 'dessert' ? [] : cakeCards.map((card) => toProductCardView(card, options))
    const desserts = category === 'cake' ? [] : dessertCards.map((card) => toProductCardView(card, options))
    return {
      cakes,
      desserts,
      cakeCount: countLabel(cakes.length, 'cake'),
      dessertCount: countLabel(desserts.length, 'dessert'),
      mini: category === 'dessert' ? null : miniOffer(cakeCards),
      empty: cakes.length === 0 && desserts.length === 0,
    }
  }, [category, options, result])

  const shownSearch = result && status !== 'loading' ? result.key.slice(result.key.indexOf('|') + 1) : search
  const emptyMessage = shownSearch
    ? `No encontramos ${quoted(shownSearch)}${category === 'cake' ? ' en los pasteles' : category === 'dessert' ? ' en los postres' : ' en el catálogo'}.`
    : category === 'cake'
      ? 'Por ahora no hay pasteles en el catálogo.'
      : category === 'dessert'
        ? 'Por ahora no hay postres en el catálogo.'
        : 'Por ahora no hay productos en el catálogo.'

  /** Lo que anuncia la región de resultados al terminar cada búsqueda o filtro; vacío mientras carga. */
  let announcement = ''
  if (status === 'ready') {
    if (view.empty) announcement = emptyMessage
    else {
      const parts = [view.cakes.length > 0 ? view.cakeCount : null, view.desserts.length > 0 ? view.dessertCount : null].filter(Boolean)
      announcement = `${parts.join(' y ')}${search ? ` para ${quoted(search)}` : ''}.`
    }
  } else if (status === 'updating') announcement = 'Buscando…'

  return {
    status,
    retry,
    filters: FILTERS.map((option) => ({ ...option, checked: option.value === (category ?? 'all') })),
    setFilter,
    search: { text, maxLength: SEARCH_MAX_LENGTH, type: typeSearch, submit: submitSearch, clear: clearSearch },
    ...view,
    /** Frase del catálogo sin resultados, y si conviene ofrecer buscar en todo (la búsqueda iba en una categoría). */
    emptyMessage,
    canClearSearch: shownSearch !== '',
    canSearchAll: shownSearch !== '' && category !== null,
    announcement,
    /** Días de anticipación de los pedidos: `null` pendiente, `undefined` mientras carga. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}

export type CatalogView = ReturnType<typeof useCatalog>
