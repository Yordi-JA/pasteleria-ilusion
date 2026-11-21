import type { CSSProperties } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { focusRing } from '../../components/focus.ts'
import Reveal from '../../components/Reveal.tsx'
import type { GalleryPhoto } from '../../viewmodels/homeGallery.ts'
import { useHomeGallery } from '../../viewmodels/useHomeGallery.ts'
import { Field, sectionColumn } from './sectionLayout.tsx'

/**
 * Una foto a su alto y a su desnivel, sin marco ni inclinación: la foto real con el radio de las tarjetas. La caja guarda
 * la proporción del archivo, así nada se recorta; `fresa-claro` es el hueco mientras la foto llega.
 */
function Photo({ photo, decorative }: { photo: GalleryPhoto; decorative: boolean }) {
  const style: CSSProperties = {
    height: `calc(var(--foto-alto) * ${photo.heightUnits})`,
    aspectRatio: `${photo.width} / ${photo.height}`,
    marginTop: `calc(var(--foto-alto) * ${photo.offsetUnits})`,
  }
  return (
    <li style={style} className="shrink-0 overflow-hidden rounded-md bg-fresa-claro">
      <img
        src={photo.src}
        alt={decorative ? '' : photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block h-full w-full object-cover"
      />
    </li>
  )
}

function PhotoList({ photos, decorative }: { photos: readonly GalleryPhoto[]; decorative: boolean }) {
  return (
    <ul aria-hidden={decorative || undefined} className="flex shrink-0 items-start gap-6 pr-6 max-[600px]:gap-4 max-[600px]:pr-4">
      {photos.map((photo) => (
        <Photo key={photo.id} photo={photo} decorative={decorative} />
      ))}
    </ul>
  )
}

// El alto base de las fotos. La banda mide lo que ocupa la foto que más baja, sin espacio sobrante, más 12 px arriba y
// abajo para el anillo de foco, que va por dentro porque la banda llega a los dos bordes de la ventana.
const bandSize = '[--foto-alto:340px] max-[600px]:[--foto-alto:230px] py-3'
const bandFocus = `${focusRing} focus-visible:outline-offset-[-6px]`

/** El control de pausa: solo el ícono, del tamaño de los íconos de la barra (44 px), con su nombre para lectores de pantalla. */
const pauseControl = `ml-auto inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-mermelada hover:bg-fresa-claro motion-safe:transition-colors ${focusRing}`

/**
 * "Hechos en la casa", sobre `fresa` (la portada alterna nata, mermelada, fresa y nata): una banda de fotos de pasteles
 * que se desliza sola en bucle, colgadas como la guirnalda (`viewmodels/homeGallery.ts`). La copia que cierra el bucle va
 * oculta a los lectores de pantalla. La pausan el mouse encima, el foco en la banda y el control junto al título (WCAG
 * 2.2.2); con "reducir movimiento" es una fila quieta que se recorre.
 */
export default function GallerySection() {
  const gallery = useHomeGallery()
  return (
    <Field field="fresa" labelledBy="galeria-titulo" className="bg-fresa pb-14 max-[600px]:pb-10">
      <div className={`${sectionColumn} pb-5 pt-20 max-[600px]:pb-3 max-[600px]:pt-14`}>
        <Reveal className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <h2 id="galeria-titulo" className="font-display text-titulo-1">
            Hechos en la casa
          </h2>
          {!gallery.reduced && (
            <button type="button" onClick={gallery.togglePause} aria-label={gallery.paused ? 'Reanudar las fotos' : 'Pausar las fotos'} className={pauseControl}>
              {gallery.paused ? <Play size={22} weight="regular" aria-hidden="true" /> : <Pause size={22} weight="regular" aria-hidden="true" />}
            </button>
          )}
        </Reveal>
      </div>
      {gallery.reduced ? (
        <div
          role="region"
          aria-label="Fotos de pasteles hechos en la casa"
          tabIndex={0}
          data-testid="galeria-banda"
          className={`${bandSize} overflow-x-auto overflow-y-hidden pl-6 max-[600px]:pl-4 ${bandFocus}`}
        >
          <div className="flex w-max">
            <PhotoList photos={gallery.photos} decorative={false} />
          </div>
        </div>
      ) : (
        <div
          role="group"
          aria-label="Fotos de pasteles hechos en la casa"
          tabIndex={0}
          data-testid="galeria-banda"
          data-pausada={gallery.paused ? 'si' : 'no'}
          className={`galeria ${bandSize} overflow-hidden ${bandFocus}`}
        >
          <div
            data-testid="galeria-pista"
            style={{ '--galeria-duracion': `${gallery.duration}s` } as CSSProperties}
            className="galeria-pista flex w-max animate-galeria"
          >
            <PhotoList photos={gallery.photos} decorative={false} />
            <PhotoList photos={gallery.photos} decorative />
          </div>
        </div>
      )}
    </Field>
  )
}
