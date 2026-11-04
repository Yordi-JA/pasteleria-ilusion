import { useState } from 'react'

/** Estado de la página de muestra: solo lo necesario para operar los componentes. */
export function useComponentSample() {
  const [email, setEmail] = useState('')
  const [bread, setBread] = useState('chocolate')
  const [tiers, setTiers] = useState('3')
  const [added, setAdded] = useState(false)

  const emailError = email !== '' && !email.includes('@') ? 'Escribe un correo con @, por ejemplo nombre@correo.com.' : undefined

  return {
    email,
    setEmail,
    emailError,
    bread,
    setBread,
    tiers,
    setTiers,
    added,
    add: () => setAdded(true),
  }
}
