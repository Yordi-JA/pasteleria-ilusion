import { useState } from 'react'

const NONE: ReadonlySet<string> = new Set()

type Snapshot = { signature: string; keys: readonly string[]; progress: number; arrived: ReadonlySet<string> }

/**
 * Qué llaves llegaron con el último avance (22 de noviembre): las que no estaban en el render anterior, solo cuando `progress`
 * creció (en "Diseña tu pastel", el paso actual). Así se anima lo que confirma "Continuar" (la fila nueva de "Tu pastel", la
 * palomita del paso) y nada más: lo que ya se ve al montar, al regresar un paso, o lo que cambia sin avanzar (los kilos que
 * llegan de la API, un tipo de pastel que invalida un paso) se pinta tal cual. Una llave que se va sale de la lista, así que si
 * vuelve sin avanzar tampoco se anima. Se calcula durante el render, sin efecto, para que el elemento nazca con su clase.
 */
export function useArrivals(keys: readonly string[], progress: number): ReadonlySet<string> {
  const signature = keys.join('\n')
  const [snapshot, setSnapshot] = useState<Snapshot>({ signature, keys, progress, arrived: NONE })
  if (snapshot.signature === signature && snapshot.progress === progress) return snapshot.arrived
  const arrived =
    progress > snapshot.progress
      ? new Set(keys.filter((key) => !snapshot.keys.includes(key)))
      : new Set([...snapshot.arrived].filter((key) => keys.includes(key)))
  setSnapshot({ signature, keys, progress, arrived })
  return arrived
}
