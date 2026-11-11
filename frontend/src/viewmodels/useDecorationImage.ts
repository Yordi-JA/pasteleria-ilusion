import { useCallback, useEffect, useRef, useState } from 'react'
import { displayFileName, imageProblem, imageProblemMessage, inspectImage } from '../models/decorationImage.ts'

/** La imagen de "Otra decoración" que la persona eligió, solo en la memoria de esta pestaña (D53). */
export type DecorationImage = { name: string; url: string }

/**
 * View-model de la imagen de "Otra decoración". Revisa el tipo, el tamaño y la cabecera antes de aceptarla (`models/decorationImage.ts`),
 * da una dirección local para la miniatura y la libera siempre: al quitar la imagen, al cambiarla, cuando la miniatura no
 * se puede abrir y cuando la pantalla se desmonta. La imagen no se sube: todavía no hay dónde guardarla (Etapa 4).
 */
export function useDecorationImage() {
  const [image, setImage] = useState<DecorationImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  // La dirección vigente, para liberarla al desmontar sin depender del estado de ese render.
  const current = useRef<string | null>(null)
  // La revisión del contenido es asíncrona: si la pantalla se desmonta mientras tanto, no se crea ninguna dirección.
  const alive = useRef(true)
  // Cada elección, quitar o descartar sube el contador: una lectura que termina tarde y ya no es la última se ignora.
  const generation = useRef(0)

  const release = useCallback(() => {
    if (current.current) URL.revokeObjectURL(current.current)
    current.current = null
  }, [])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      release()
    }
  }, [release])

  /**
   * Acepta el archivo si sirve y devuelve el nombre ya limpio para mostrar; si no, deja la imagen de antes y dice por
   * qué. Revisa el tipo y el tamaño, y luego la firma y los píxeles de la cabecera, antes de crear la dirección local.
   */
  const pick = useCallback(
    async (file: File | undefined): Promise<string | null> => {
      if (!file) return null
      const mine = ++generation.current
      const problem = imageProblem(file) ?? (await inspectImage(file))
      // La última elección gana; quitar la imagen o cambiar de decoración durante la lectura la cancela.
      if (!alive.current || mine !== generation.current) return null
      if (problem) {
        setError(imageProblemMessage(problem))
        return null
      }
      const name = displayFileName(file.name) ?? 'imagen'
      release()
      current.current = URL.createObjectURL(file)
      setImage({ name, url: current.current })
      setError(null)
      return name
    },
    [release],
  )

  const clear = useCallback(() => {
    generation.current++
    release()
    setImage(null)
    setError(null)
  }, [release])

  /** La miniatura no se pudo abrir (un archivo dañado que decía ser una imagen): se descarta y se pide otra. */
  const onUnreadable = useCallback(() => {
    generation.current++
    release()
    setImage(null)
    setError('No pudimos abrir esa imagen. Elige otra.')
  }, [release])

  return { image, error, pick, clear, onUnreadable }
}
