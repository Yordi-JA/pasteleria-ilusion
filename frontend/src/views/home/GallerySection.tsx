import type { CSSProperties } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import Reveal from '../../components/Reveal.tsx'
import type { GalleryPhoto } from '../../viewmodels/homeGallery.ts'
import { useHomeGallery } from '../../viewmodels/useHomeGallery.ts'
import { Field, sectionColumn } from './sectionLayout.tsx'

/** Una foto con su alto, su desnivel y su inclinación; la caja guarda la proporción real de la foto. */
function Photo({ photo, decorative }: { photo: GalleryPhoto; decorative: boolean }) {
  const style: CSSProperties = {
    height: `calc(var(--foto-alto) * ${photo.heightUnits})`,
    aspectRatio: `${photo.width} / ${photo.height}`,
    marginTop: `calc(var(--foto-alto) * ${photo.offsetUnits})`,
    transform: `rotate(${photo.tilt}deg)`,
  }
  return (
    <li style={style} className="shrink-0 overflow-hidden rounded-md border-2 border-betun bg-betun">
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

// El alto base de las fotos; la banda mide una vez y media ese alto para dar espacio al desnivel y a la inclinación.
const bandSize = '[--foto-alto:340px] max-[600px]:[--foto-alto:230px] h-[calc(var(--foto-alto)*1.5+2rem)] py-4'

/**
 * "Hechos en la casa", sobre `fresa` (la portada alterna nata, mermelada, fresa y nata): una banda de fotos de pasteles
 * que se desliza sola en bucle, con cada foto a su altura y ligeramente inclinada. La copia que cierra el bucle va oculta
 * a los lectores de pantalla; el hover, el foco y el botón la pausan, y con "reducir movimiento" es una fila que se recorre.
 */
export default function GallerySection() {
  const gallery = useHomeGallery()
  return (
    <Field field="fresa" labelledBy="galeria-titulo" className="bg-fresa">
      <div className={`${sectionColumn} pb-6 pt-20 max-[600px]:pt-14`}>
        <Reveal className="mb-8 flex items-end justify-between gap-6 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="galeria-titulo" className="font-display text-titulo-1">
              Hechos en la casa
            </h2>
            <p className="text-cuerpo text-mermelada-suave">Algunos de los pasteles que han salido de nuestra cocina.</p>
          </div>
          {!gallery.reduced && (
            <Button variant="secondary" onClick={gallery.togglePause} className="shrink-0 gap-2">
              {gallery.paused ? <Play size={20} weight="bold" aria-hidden="true" /> : <Pause size={20} weight="bold" aria-hidden="true" />}
              {gallery.paused ? 'Reanudar las fotos' : 'Pausar las fotos'}
            </Button>
          )}
        </Reveal>
      </div>
      {gallery.reduced ? (
        <div
          role="region"
          aria-label="Fotos de pasteles hechos en la casa"
          tabIndex={0}
          data-testid="galeria-banda"
          className={`${bandSize} overflow-x-auto pl-6 max-[600px]:pl-4 ${focusRing}`}
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
          className={`galeria ${bandSize} overflow-hidden ${focusRing}`}
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
