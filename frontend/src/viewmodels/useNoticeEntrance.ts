import { useState } from 'react'

/**
 * Cómo entra un aviso que se vuelve a montar con cada `id` (el de "Agregar al pedido"): `enter`, el primero tras una región
 * vacía, que baja a su lugar; `settle`, uno que reemplaza a otro, donde la caja no se mueve otra vez y solo se asienta su
 * marcador; `null`, el que ya estaba al montar la región (al volver al paso 8 de "Diseña tu pastel"), que no se anima porque
 * ya se había visto. Se calcula durante el render con el `id` anterior, sin efecto, así el aviso nace ya con su clase.
 */
export type NoticeEntrance = 'enter' | 'settle' | null

export function useNoticeEntrance(id: number | null): NoticeEntrance {
  const [seen, setSeen] = useState<{ id: number | null; entrance: NoticeEntrance }>({ id, entrance: null })
  if (seen.id === id) return seen.entrance
  const entrance: NoticeEntrance = id === null ? null : seen.id === null ? 'enter' : 'settle'
  setSeen({ id, entrance })
  return entrance
}
