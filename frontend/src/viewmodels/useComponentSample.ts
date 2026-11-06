import { useState } from 'react'
import type { CartOffering } from '../models/cart.ts'
import { PRESENTATION_LABELS } from '../models/presentation.ts'
import { useAddToCart } from './useAddToCart.ts'
import { useCart } from './useCart.ts'

/** Etiquetas de ejemplo para las perlas; qué estado del pedido va en cada paso se decide en "Mis pedidos". */
const pearlSteps = ['Recibido', 'En preparación', 'Listo para entregar', 'Entregado']

/** Pasos de la muestra, con el valor fuera de rango para comprobar que se ajusta. */
const pearlExamples = [
  { id: 'perlas-paso-1', current: 1 },
  { id: 'perlas-paso-2', current: 2 },
  { id: 'perlas-paso-3', current: 3 },
  { id: 'perlas-paso-4', current: 4 },
  { id: 'perlas-menos-uno', current: -1 },
  { id: 'perlas-de-mas', current: 9 },
]

/** Seis tarjetas de catálogo en esqueleto (forma de `CatalogoCargando`). */
const catalogCards = [1, 2, 3, 4, 5, 6]

/** Presentaciones de ejemplo para el carrito, con los textos del mockup (Carrito); la rebanada tiene tope. */
const cartOfferings: { offering: CartOffering; price: string; stock?: number }[] = [
  {
    offering: { offeringId: 101, name: 'Tres leches de durazno', presentation: 'whole', unitPrice: '350.00', slug: 'tres-leches-de-durazno' },
    price: '$350',
  },
  {
    offering: {
      offeringId: 102,
      name: 'Rebanada de tres leches de cajeta',
      presentation: 'slice',
      unitPrice: '35.00',
      slug: 'tres-leches-de-cajeta',
    },
    price: '$35',
    stock: 2,
  },
]

/** La vista recibe el nombre de la presentación ya resuelto con `PRESENTATION_LABELS`. */
const cartExamples = cartOfferings.map((example) => ({ ...example, presentationLabel: PRESENTATION_LABELS[example.offering.presentation] }))

/** Estado de la página de muestra: solo lo necesario para operar los componentes. */
export function useComponentSample() {
  const [email, setEmail] = useState('')
  const [bread, setBread] = useState('chocolate')
  const [tiers, setTiers] = useState('3')
  const [added, setAdded] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const cart = useCart()
  const addToCart = useAddToCart()

  const emailError = email !== '' && !email.includes('@') ? 'Escribe un correo con @, por ejemplo nombre@correo.com.' : undefined

  return {
    pearlSteps,
    pearlExamples,
    catalogCards,
    email,
    setEmail,
    emailError,
    bread,
    setBread,
    tiers,
    setTiers,
    added,
    catalogLoading,
    toggleCatalogLoading: () => setCatalogLoading((value) => !value),
    add: () => setAdded(true),
    cartExamples,
    cartItems: cart.items,
    cartFeedback: addToCart.feedback,
    addToCart: (example: (typeof cartExamples)[number]) => addToCart.add(example.offering, 1, example.stock),
    removeFromCart: cart.remove,
    clearCart: cart.clear,
  }
}
