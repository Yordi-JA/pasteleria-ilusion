import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { getProduct, isProductSlug } from '../models/catalog.ts'
import type { ProductDetail } from '../models/catalog.ts'
import { hasProgress, matchesPrefill, PREFILL_PARAM, prefilledDraft, prefillSummary } from './cakeDesignPrefill.ts'
import type { Prefill } from './cakeDesignPrefill.ts'

/** Lo que el diseñador muestra del prellenado. */
export type PrefillNotice =
  /** Se prellenó un borrador vacío: qué quedó elegido. */
  | { kind: 'applied'; productName: string; detail: string }
  /** Había un diseño a medias: la persona decide. `autoFocus` solo la primera vez que se muestra. */
  | { kind: 'ask'; productName: string; autoFocus: boolean }
  /** Nada del producto sigue vigente (por ejemplo, su tipo de pastel): el borrador no cambia y se dice por qué. */
  | { kind: 'unavailable'; productName: string; detail: string }
  /** La ficha no existe ya, o no es un pastel: se diseña sin ella. */
  | { kind: 'notFound' }
  /** La ficha no llegó: se puede reintentar. */
  | { kind: 'error' }
  /** Se volvió a pedir la ficha: el diseñador sigue a la vista y el aviso dice que busca. */
  | { kind: 'retrying' }

/**
 * Qué hacer con la ficha: ya coincide (`match`), preguntar (`ask`), prellenar sin preguntar (`apply`) o nada que
 * elegir (`none`: todo lo del producto se ignoró).
 */
type Decision = { prefill: Prefill; productName: string; outcome: 'match' | 'ask' | 'apply' | 'none' }

type ProductState = { status: 'idle' | 'loading' | 'error' | 'notFound' } | { status: 'ready'; product: ProductDetail }

type Options = {
  options: CakeDesignOptions | null
  draft: CakeDesignDraft
  /** Empieza de cero con ese borrador (sin las imágenes del anterior), en el paso 1. */
  restart: (draft: CakeDesignDraft) => void
}

/**
 * "Personalizar este pastel" en el diseñador (D59). Lee `?pastel=<slug>` una sola vez y lo quita de la URL al
 * montar (recargar no vuelve a pisar nada), pide la ficha y, con las opciones ya cargadas, decide:
 * - sin borrador (o con uno que ya tiene esas elecciones), prellena sin preguntar y dice qué quedó elegido;
 * - con un diseño a medias, no lo pisa: pregunta "Seguir con mi diseño" o "Empezar con <producto>";
 * - si nada del producto sigue vigente, no toca el borrador y dice qué ya no está.
 * Una ficha que ya no existe, que no es un pastel o que no llega no bloquea: el diseñador sigue, con su aviso.
 */
export function useDesignPrefill({ options, draft, restart }: Options) {
  const [searchParams, setSearchParams] = useSearchParams()
  // Se lee al montar: el diseñador cambia la URL (`?paso=`) en cuanto carga, y ya no estaría ahí.
  const [slug] = useState(() => {
    const value = searchParams.get(PREFILL_PARAM)
    return value && isProductSlug(value) ? value : null
  })
  const hasParam = searchParams.has(PREFILL_PARAM)
  useEffect(() => {
    if (!hasParam) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(PREFILL_PARAM)
        return next
      },
      { replace: true },
    )
  }, [hasParam, setSearchParams])

  const [product, setProduct] = useState<ProductState>(() => ({ status: slug ? 'loading' : 'idle' }))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    getProduct(slug, controller.signal).then(
      (detail) => {
        if (controller.signal.aborted) return
        // Un postre no se diseña: su `slug` es como uno que no existe.
        setProduct(detail && detail.category === 'cake' ? { status: 'ready', product: detail } : { status: 'notFound' })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el pastel para "Diseña tu pastel".', error)
        setProduct({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [attempt, slug])

  // Se decide una sola vez, en el render en que ya están la ficha y las opciones, con el borrador de ese momento.
  const [decision, setDecision] = useState<Decision | null>(null)
  if (decision === null && product.status === 'ready' && options) {
    const prefill = prefilledDraft(product.product, options)
    const outcome = prefill.applied.length === 0 ? 'none' : matchesPrefill(draft, prefill) ? 'match' : hasProgress(draft) ? 'ask' : 'apply'
    setDecision({ prefill, productName: product.product.name, outcome })
  }
  const [answer, setAnswer] = useState<'keep' | 'product' | null>(null)
  // El borrador prellenado ya está en el estado: hasta entonces el diseñador sigue en su esqueleto, así no se ve un
  // cuadro del paso 1 vacío. Se marca una vez; un cambio posterior de la persona no lo deshace.
  const [settled, setSettled] = useState(false)
  if (!settled && decision?.outcome === 'apply' && matchesPrefill(draft, decision.prefill)) setSettled(true)
  // La pregunta toma el foco solo la primera vez que se muestra, no cada vez que se vuelve al paso 1.
  const [askFocused, setAskFocused] = useState(false)
  const markAskFocused = useCallback(() => setAskFocused(true), [])

  // Un borrador vacío se prellena sin preguntar. `restart` cambia el borrador y la URL: es un efecto, una sola vez.
  const applied = useRef(false)
  useEffect(() => {
    if (decision?.outcome !== 'apply' || applied.current) return
    applied.current = true
    restart(decision.prefill.draft)
  }, [decision, restart])

  /** "Empezar con <producto>": cambia el diseño a medias por el del producto. */
  const startWithProduct = useCallback(() => {
    if (decision?.outcome !== 'ask') return
    setAnswer('product')
    restart(decision.prefill.draft)
  }, [decision, restart])

  /** "Seguir con mi diseño": el borrador queda como estaba. */
  const keepDesign = useCallback(() => setAnswer('keep'), [])

  const retry = useCallback(() => {
    setProduct({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  let notice: PrefillNotice | null = null
  // Una ficha que no existe o que no llegó no cambia el borrador: solo lo avisa.
  if (product.status === 'notFound' || product.status === 'error') notice = { kind: product.status }
  else if (product.status === 'loading' && attempt > 0) notice = { kind: 'retrying' }
  else if (decision?.outcome === 'none') {
    notice = { kind: 'unavailable', productName: decision.productName, detail: prefillSummary(decision.prefill, decision.productName) }
  } else if (decision && (decision.outcome === 'apply' || answer === 'product')) {
    notice = { kind: 'applied', productName: decision.productName, detail: prefillSummary(decision.prefill, decision.productName) }
  } else if (decision?.outcome === 'ask' && answer === null) notice = { kind: 'ask', productName: decision.productName, autoFocus: !askFocused }

  return {
    /**
     * Solo en la primera carga, y hasta que el borrador prellenado está en el estado, el diseñador sigue en su
     * esqueleto. Un reintento no lo vuelve a poner, ni siquiera el cuadro en que se asienta el prellenado: el aviso
     * dice "Buscando el pastel…" y el foco se queda en él.
     */
    loading: attempt === 0 && (product.status === 'loading' || (decision?.outcome === 'apply' && !settled)),
    notice,
    startWithProduct,
    keepDesign,
    retry,
    markAskFocused,
  }
}
