import { createContext, useContext, useLayoutEffect, useState } from 'react'
import type { DuyaField } from '../components/Duya.tsx'

/**
 * El campo del que cuelga la guirnalda antes del pie. Casi todas las páginas terminan en `nata`; `/entrar` y
 * `/registro` terminan en `fresa` (Login.dc.html), así que la vista lo dice y el marco pinta la guirnalda de ese color.
 */
export const ClosingFieldContext = createContext<(field: DuyaField) => void>(() => {})

export function useClosingFieldState() {
  return useState<DuyaField>('nata')
}

/** Lo declara una vista mientras está montada; al salir vuelve a `nata`. Antes de pintar, para que no parpadee. */
export function useClosingField(field: DuyaField) {
  const setField = useContext(ClosingFieldContext)
  useLayoutEffect(() => {
    setField(field)
    return () => setField('nata')
  }, [field, setField])
}
