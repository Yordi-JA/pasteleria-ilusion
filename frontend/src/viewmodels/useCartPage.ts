import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router'
import { draftFromDesign, readDraft, writeDraft } from '../models/cakeDesignDraft.ts'
import { MAX_LINE_QUANTITY } from '../models/cart.ts'
import { hasProgress } from './cakeDesignPrefill.ts'
import { cartLines, cartSummary, paymentNote } from './cartLines.ts'
import type { CartLineView } from './cartLines.ts'
import { useCart } from './useCart.ts'

/** Al editar un pastel se abre su revisión (paso 8), con todo lo elegido. */
const EDIT_DESIGN_PATH = '/pedido/disena?paso=8'

/**
 * View-model de `/carrito` (D66): las líneas en frases, el resumen estimado, cambiar cantidades, quitar y "Editar pedido".
 * Si el carrito junta la vitrina de hoy con un pastel diseñado (o dos decoraciones por cotizar), no deja continuar y
 * dice por qué. Quitar una línea lo anuncia y deja el foco en el título de los productos (o en el del carrito vacío),
 * porque el botón desaparece con su línea.
 */
export function useCartPage(headings: { products: RefObject<HTMLElement | null>; empty: RefObject<HTMLElement | null> }) {
  const cart = useCart()
  const navigate = useNavigate()
  const lines = useMemo(() => cartLines(cart.items), [cart.items])
  const summary = useMemo(() => cartSummary(cart.items), [cart.items])
  const [announcement, setAnnouncement] = useState('')
  // El foco se mueve después de pintar: con la última línea quitada, el título de los productos ya no existe.
  const focusAfterRemove = useRef(false)
  useEffect(() => {
    if (!focusAfterRemove.current) return
    focusAfterRemove.current = false
    ;(cart.items.length === 0 ? headings.empty : headings.products).current?.focus()
  }, [cart.items, headings])
  // Un pastel por editar cuando ya hay otro a medias en "Diseña tu pastel": se pregunta antes de reemplazarlo.
  const [pendingEdit, setPendingEdit] = useState<string | null>(null)

  const setQuantity = useCallback(
    (line: CartLineView, quantity: number) => {
      if (line.key.kind !== 'offering' || quantity < 1 || quantity > MAX_LINE_QUANTITY) return
      cart.setQuantity(line.key.line, quantity)
    },
    [cart],
  )

  const remove = useCallback(
    (line: CartLineView) => {
      if (line.key.kind === 'offering') cart.remove(line.key.line)
      else cart.removeDesign(line.key.designId)
      setPendingEdit(null)
      setAnnouncement(`Quitaste ${line.name} de tu pedido.`)
      focusAfterRemove.current = true
    },
    [cart],
  )

  const openDesign = useCallback(
    (designId: string) => {
      const item = cart.items.find((candidate) => candidate.kind === 'design' && candidate.designId === designId)
      if (!item || item.kind !== 'design') return
      writeDraft(draftFromDesign(item.design, designId))
      navigate(EDIT_DESIGN_PATH)
    },
    [cart.items, navigate],
  )

  /** "Editar pedido": abre el pastel en "Diseña tu pastel"; si ahí hay otro diseño a medias, pregunta primero. */
  const editDesign = useCallback(
    (designId: string) => {
      const current = readDraft()
      if (hasProgress(current) && current.replaces !== designId) setPendingEdit(designId)
      else openDesign(designId)
    },
    [openDesign],
  )
  const confirmEdit = useCallback(() => {
    if (pendingEdit) openDesign(pendingEdit)
  }, [openDesign, pendingEdit])
  const cancelEdit = useCallback(() => setPendingEdit(null), [])

  return {
    lines,
    summary,
    paymentNote: paymentNote(summary),
    empty: cart.items.length === 0,
    canContinue: cart.items.length > 0 && summary.conflict === null,
    setQuantity,
    remove,
    editDesign,
    pendingEdit,
    confirmEdit,
    cancelEdit,
    announcement,
  }
}
