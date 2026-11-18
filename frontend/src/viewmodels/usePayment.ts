import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../models/apiClient.ts'
import { forgetPaymentKey, orderThumbnails, paymentKey } from '../models/checkout.ts'
import { getPaymentState, safeCheckoutUrl, startPayment, stripePublishableKey } from '../models/payments.ts'
import type { PaymentAttempt, PaymentMethod, PaymentState } from '../models/payments.ts'
import {
  cashDeadline,
  declinedAlert,
  dueClock,
  isReservedInCash,
  onlinePending,
  orderSummary,
  paymentSentence,
  paymentStage,
  startFailure,
} from './paymentView.ts'
import type { PaymentAlert } from './paymentView.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Cada cuánto y cuántas veces se consulta el pago mientras la pasarela confirma: unos 60 s en total. */
const POLL_INTERVAL_MS = 2_500
const POLL_LIMIT = 24

/**
 * En desarrollo, las pruebas E2E acortan la espera (`__paymentPollMs`, `__paymentPollLimit`), como `__catalogTimeoutMs`.
 * Quien llama lo usa solo dentro de `import.meta.env.DEV`, para que el nombre no llegue al build.
 */
function devPollSetting(name: string, fallback: number): number {
  const value: unknown = Reflect.get(globalThis, name)
  return typeof value === 'number' && value > 0 ? value : fallback
}

/** El id del pedido: `?pedido=` (sobrevive a una recarga y al regreso de Mercado Pago) o el estado de la entrega (D66). */
function readOrderId(search: URLSearchParams, state: unknown): { id: number | null; fromState: boolean } {
  const fromUrl = search.get('pedido')
  if (fromUrl !== null) return { id: /^[1-9]\d{0,9}$/.test(fromUrl) ? Number(fromUrl) : null, fromState: false }
  const id = typeof state === 'object' && state !== null ? (state as Record<string, unknown>).orderId : undefined
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? { id, fromState: true } : { id: null, fromState: false }
}

/** Mercado Pago agrega `payment_id` (o `collection_id`) al volver; `null` si la persona salió sin pagar. */
function returnedWithPayment(search: URLSearchParams): boolean {
  return ['payment_id', 'collection_id'].some((name) => {
    const value = search.get(name)
    return value !== null && value !== '' && value !== 'null'
  })
}

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: PaymentState }

/**
 * `idle`: se elige un método. `starting`: se inicia el cobro con ese método. `confirming`: Stripe confirma en el
 * navegador (3D Secure incluido). `waiting`: la pasarela ya tiene el pago y se consulta al servidor hasta ver
 * `received`. `timedOut`: la consulta llegó a su límite sin respuesta.
 */
export type WaitSource = 'card' | 'checkout'

export type PaymentPhase =
  | { kind: 'idle' }
  | { kind: 'starting'; method: PaymentMethod }
  | { kind: 'confirming' }
  | { kind: 'waiting'; source: WaitSource }
  | { kind: 'timedOut'; source: WaitSource }

export type PaymentFocus = Record<'alert' | 'status', RefObject<HTMLElement | null>>

/**
 * View-model de `/pedido/pago` (D68): lee el pedido de la URL, pide su estado al servidor y decide qué mostrar; inicia
 * el cobro con la llave del método (`paymentKey`), redirige a Checkout Pro, aparta en efectivo y, después de Mercado
 * Pago o de Stripe, consulta el estado hasta que el servidor diga `received` (la URL de regreso no confirma nada).
 * Mientras cobra no acepta otra llamada: un doble clic manda una sola petición.
 */
export function usePayment(focus: PaymentFocus) {
  const [search] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const store = useStoreDetails()
  const { id: orderId, fromState } = readOrderId(search, location.state)
  const returned = returnedWithPayment(search)

  const [fetched, setLoad] = useState<Load>({ status: 'loading' })
  const load: Load = orderId === null ? { status: 'missing' } : fetched
  const [phase, setPhase] = useState<PaymentPhase>({ kind: 'idle' })
  const [alert, setAlert] = useState<PaymentAlert | null>(null)
  const [attempt, setAttempt] = useState(0)
  const polls = useRef(0)
  const busy = useRef(false)
  /** El último intento cuando empezó la espera: un `failed` que ya estaba no es un rechazo nuevo. */
  const waitBaseline = useRef<string | null>(null)
  /** El último intento que dio el servidor, para fijar esa línea base desde un evento. */
  const latestRef = useRef<PaymentAttempt | null>(null)
  /** Si ya se revisó el regreso de Checkout Pro (solo la primera respuesta cuenta). */
  const checkedReturn = useRef(false)
  const returnedRef = useRef(returned)

  const beginWaiting = useCallback((source: WaitSource, latest: PaymentAttempt | null = latestRef.current) => {
    waitBaseline.current = latest ? `${latest.status}:${latest.updatedAt ?? ''}` : null
    polls.current = 0
    setPhase({ kind: 'waiting', source })
  }, [])

  // La URL siempre lleva el pedido, así una recarga funciona (el estado de la navegación se pierde al salir del sitio).
  useEffect(() => {
    if (fromState && orderId !== null) navigate({ search: `?pedido=${orderId}` }, { replace: true, state: location.state })
  }, [fromState, orderId, navigate, location.state])

  // Pide el estado al montar, con "Volver a intentar" (`attempt`) y en cada consulta de la espera.
  useEffect(() => {
    if (orderId === null) return
    const controller = new AbortController()
    getPaymentState(orderId, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        latestRef.current = data.latest
        setLoad({ status: 'ready', data })
        // Al volver de Checkout Pro con un pago, se espera la confirmación del servidor, si el intento sigue pendiente.
        if (!checkedReturn.current) {
          checkedReturn.current = true
          if (returnedRef.current && onlinePending(data)) beginWaiting('checkout', data.latest)
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el pago del pedido.', error)
        setLoad(error instanceof ApiError && error.status === 404 ? { status: 'missing' } : { status: 'error' })
      },
    )
    return () => controller.abort()
  }, [orderId, attempt, beginWaiting])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  const retryLoad = useCallback(() => {
    setLoad({ status: 'loading' })
    reload()
  }, [reload])

  const data = load.status === 'ready' ? load.data : null
  const stage = data ? paymentStage(data) : null
  // Pagado: a la confirmación. El servidor lo dijo; nunca la URL de regreso.
  useEffect(() => {
    if (stage?.kind === 'paid' && orderId !== null) navigate(`/pedido/confirmacion?pedido=${orderId}`, { replace: true })
  }, [stage?.kind, orderId, navigate])

  // La espera: otra consulta cada intervalo, hasta `received`, un rechazo o el límite.
  useEffect(() => {
    if (phase.kind !== 'waiting' || !data) return
    const latest = data.latest
    if (latest?.status === 'failed' && latest.method !== 'cash' && `${latest.status}:${latest.updatedAt ?? ''}` !== waitBaseline.current) {
      setPhase({ kind: 'idle' })
      setAlert(declinedAlert(latest.method))
      return
    }
    if (stage?.kind !== 'payable') return
    if (polls.current >= (import.meta.env.DEV ? devPollSetting('__paymentPollLimit', POLL_LIMIT) : POLL_LIMIT)) {
      setPhase({ kind: 'timedOut', source: phase.source })
      return
    }
    const timer = setTimeout(() => {
      polls.current += 1
      reload()
    }, import.meta.env.DEV ? devPollSetting('__paymentPollMs', POLL_INTERVAL_MS) : POLL_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [phase, data, stage?.kind, reload])

  // Después de pintar un aviso o el estado de la espera, el foco va ahí (la persona sabe qué pasó sin buscarlo).
  const focusTarget = useRef<keyof PaymentFocus | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    focus[target].current?.focus()
  })

  const fail = useCallback((next: PaymentAlert | null) => {
    setAlert(next)
    if (next) focusTarget.current = 'alert'
  }, [])

  /**
   * Inicia el cobro con `method` y devuelve el pago iniciado, o `null` si falló (el aviso ya dice qué hacer). Una sola
   * llamada a la vez.
   */
  const start = useCallback(
    async (method: PaymentMethod) => {
      if (busy.current || orderId === null) return null
      busy.current = true
      setAlert(null)
      setPhase({ kind: 'starting', method })
      try {
        return await startPayment(orderId, method, paymentKey(orderId, method))
      } catch (error) {
        console.warn('No se pudo iniciar el pago.', error)
        const failure = startFailure(error)
        if (failure.forgetKey) forgetPaymentKey(orderId, method)
        if (failure.reload) reload()
        fail(failure.alert)
        setPhase({ kind: 'idle' })
        return null
      } finally {
        busy.current = false
      }
    },
    [orderId, reload, fail],
  )

  const payWithMercadoPago = useCallback(async () => {
    const started = await start('mercadopago')
    if (!started) return
    const url = safeCheckoutUrl(started.redirectUrl)
    if (!url) {
      setPhase({ kind: 'idle' })
      fail({ title: 'No pudimos iniciar tu pago', message: 'Mercado Pago no respondió como esperábamos. Vuelve a intentarlo en unos minutos.' })
      return
    }
    // El botón sigue desactivado mientras el navegador sale a Checkout Pro.
    window.location.assign(url)
  }, [start, fail])

  const reserveInCash = useCallback(async () => {
    const started = await start('cash')
    if (started && orderId !== null) navigate(`/pedido/apartado?pedido=${orderId}`)
  }, [start, orderId, navigate])

  /** La tarjeta pide el `client_secret` (inicia el cobro con Stripe) y avisa qué pasó al confirmarlo. */
  const card = useMemo(
    () => ({
      begin: async (): Promise<string | null> => {
        const started = await start('stripe')
        if (!started) return null
        if (!started.clientSecret) {
          setPhase({ kind: 'idle' })
          fail({ title: 'No pudimos iniciar tu pago', message: 'El pago con tarjeta no respondió como esperábamos. Vuelve a intentarlo en unos minutos.' })
          return null
        }
        setPhase({ kind: 'confirming' })
        return started.clientSecret
      },
      /** Stripe ya tiene el pago (o no se sabe, si se cortó la red): se espera al servidor, que es quien confirma. */
      confirmed: () => {
        beginWaiting('card')
        focusTarget.current = 'status'
        reload()
      },
      declined: (next: PaymentAlert) => {
        setPhase({ kind: 'idle' })
        fail(next)
      },
    }),
    [start, fail, reload, beginWaiting],
  )

  const checkAgain = useCallback(() => {
    beginWaiting(phase.kind === 'timedOut' ? phase.source : 'checkout')
    reload()
  }, [reload, beginWaiting, phase])

  const stripeKey = stripePublishableKey()
  const payable = data && stage?.kind === 'payable' ? stage.payment : null

  return {
    orderId,
    load,
    stage,
    store,
    phase,
    alert,
    retryLoad,
    checkAgain,
    payWithMercadoPago,
    reserveInCash,
    card,
    stripeKey,
    view:
      data && payable
        ? {
            sentence: paymentSentence(payable),
            summary: orderSummary(data.order, payable, { thumbnails: orderThumbnails(data.order.id) }),
            available: { ...data.available, stripe: data.available.stripe && stripeKey !== '' },
            /** El último intento rechazado (por el webhook), si no hay un aviso más reciente. */
            rejected: data.latest?.status === 'failed' && data.latest.method !== 'cash' ? declinedAlert(data.latest.method) : null,
            reserved: isReservedInCash(data) ? { due: dueClock(data.order) } : null,
            cashDeadline: cashDeadline(data.order, store.hours?.closesAt ?? null),
          }
        : null,
  }
}
