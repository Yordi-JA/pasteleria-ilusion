import { useEffect, useState } from 'react'
import type { LoadedImage } from './cakeLid.ts'

/**
 * La imagen de una dirección local (`blob:`) ya decodificada y con su tamaño en píxeles, para encuadrarla en el editor y
 * dibujarla en la vista previa. `null` mientras carga, sin dirección o si el navegador no puede abrirla. El tamaño es el del
 * navegador: ya con el giro que diga la foto (EXIF), el mismo con el que la dibuja el 3D.
 */
export function useLoadedImage(url: string | null): LoadedImage | null {
  const [loaded, setLoaded] = useState<{ url: string; image: LoadedImage } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const element = new Image()
    element.src = url
    element.decode().then(
      () => alive && setLoaded({ url, image: { element, width: element.naturalWidth, height: element.naturalHeight } }),
      () => alive && setLoaded(null),
    )
    return () => {
      alive = false
    }
  }, [url])
  return loaded && loaded.url === url ? loaded.image : null
}
