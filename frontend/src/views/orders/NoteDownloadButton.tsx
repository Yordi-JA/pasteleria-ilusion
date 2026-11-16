import { inlineLink } from '../../components/focus.ts'
import type { NoteDownloadState } from '../../viewmodels/useNoteDownload.ts'

type NoteDownloadButtonProps = { state: NoteDownloadState; onDownload: () => void; className?: string }

/**
 * "Descargar nota (PDF)" como enlace de texto (mockups `Confirmacion` y `DetallePedido`). Es un botón porque la nota se
 * pide con la sesión (`useNoteDownload`). Mientras llega dice "Descargando nota…" y la región de estado lo anuncia; si
 * falla, el error va en texto (`role="alert"`).
 */
export default function NoteDownloadButton({ state, onDownload, className = '' }: NoteDownloadButtonProps) {
  const downloading = state === 'downloading'
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={onDownload}
        // `aria-disabled` y no `disabled`: un botón desactivado pierde el foco del teclado a media descarga.
        aria-disabled={downloading || undefined}
        className={`inline-flex min-h-11 cursor-pointer items-center font-semibold aria-disabled:cursor-wait ${inlineLink}`}
      >
        {downloading ? 'Descargando nota…' : 'Descargar nota (PDF)'}
      </button>
      <span role="status" className="sr-only">
        {downloading ? 'Descargando tu nota' : ''}
      </span>
      {state === 'error' && (
        <span role="alert" className="text-nota text-error">
          No pudimos descargar tu nota. Vuelve a intentarlo en un momento.
        </span>
      )}
    </span>
  )
}
