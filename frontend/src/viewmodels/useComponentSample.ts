import { useState } from 'react'

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

/** Estado de la página de muestra: solo lo necesario para operar los componentes. */
export function useComponentSample() {
  const [email, setEmail] = useState('')
  const [bread, setBread] = useState('chocolate')
  const [tiers, setTiers] = useState('3')
  const [added, setAdded] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)

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
  }
}
