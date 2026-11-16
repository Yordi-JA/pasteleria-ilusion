import { LockSimple, UploadSimple } from '@phosphor-icons/react'
import { useId, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import Button from '../components/Button.tsx'
import Card from '../components/Card.tsx'
import { focusRing, focusRingWithin } from '../components/focus.ts'
import IllustratedHeader from '../components/IllustratedHeader.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Notice from '../components/Notice.tsx'
import Skeleton from '../components/Skeleton.tsx'
import TextField from '../components/TextField.tsx'
import { OCCASIONS } from '../models/occasion.ts'
import { REFERENCE_DESCRIPTION_MAX_LENGTH, REFERENCE_MAX_PHOTOS } from '../models/referenceRequests.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { REFERENCE_PHOTO_MAX_MB, useReferenceUpload } from '../viewmodels/useReferenceUpload.ts'
import type { ReferencePhoto } from '../viewmodels/useReferenceUpload.ts'
import type { useReferenceFlavor } from '../viewmodels/useReferenceFlavor.ts'
import { BreadStep, CakeTypeStep, FillingStep } from './cakeDesigner/ChoiceSteps.tsx'
import { HowItWorks, sectionTitle, twoColumns } from './reference/ReferenceParts.tsx'

const TITLE = 'Envía tu referencia'

const fieldBox =
  'w-full rounded-sm border border-mermelada-suave bg-harina px-[14px] font-sans text-cuerpo text-mermelada ' +
  'placeholder:text-mermelada-suave placeholder:opacity-100 hover:border-mermelada ' +
  `aria-[invalid=true]:border-2 aria-[invalid=true]:border-error aria-[invalid=true]:px-[13px] ${focusRing}`

const ACCEPT = 'image/jpeg,image/png,image/webp'

type FieldFrameProps = { id: string; label: string; note?: string; error?: string; children: ReactNode }

/** Etiqueta, control y error, como `TextField`, para el área de texto y la lista de ocasiones. */
function FieldFrame({ id, label, note, error, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-etiqueta text-mermelada">
        {label}
        {note && <span className="font-normal text-mermelada-suave"> {note}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-nota font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-nota font-semibold text-error">
      {message}
    </p>
  ) : null
}

type FlavorProps = {
  flavor: ReturnType<typeof useReferenceFlavor>
  errors: { cakeType?: string; bread?: string; filling?: string }
}

/**
 * El sabor (segunda ronda de D70): el tipo de pastel, el pan y el relleno con las opciones y los componentes de los pasos
 * 2 a 4 de "Diseña tu pastel". Cada error va bajo su grupo y lo describe.
 */
function FlavorFields({ flavor, errors }: FlavorProps) {
  const base = useId()
  const ids = { cakeType: `${base}-tipo`, bread: `${base}-pan`, filling: `${base}-relleno` }
  const described = (field: keyof typeof ids) => (errors[field] ? ids[field] : undefined)
  const view = flavor.view
  return (
    <section aria-labelledby={`${base}-titulo`} className="flex flex-col gap-5 border-t border-relieve pt-5">
      <div className="flex flex-col gap-1">
        <h3 id={`${base}-titulo`} className="font-display text-titulo-3">
          Sabor
        </h3>
        <p className="text-nota text-mermelada-suave">Con las personas y el sabor preparamos tu cotización.</p>
      </div>
      {flavor.status === 'error' ? (
        <LoadErrorNotice title="No pudimos cargar los sabores" onRetry={flavor.retry} />
      ) : !view ? (
        <div aria-busy="true" className="flex flex-col gap-2.5">
          <span className="sr-only">Cargando los sabores…</span>
          <Skeleton className="h-4 w-48" />
          <Skeleton radius="md" className="h-14 w-full" />
          <Skeleton radius="md" className="h-14 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <CakeTypeStep choices={view.cakeTypes} conflict={null} onChoose={flavor.chooseType} describedBy={described('cakeType')} />
            <FieldError id={ids.cakeType} message={errors.cakeType} />
          </div>
          <div className="flex flex-col gap-2.5">
            <BreadStep groups={view.breads} onChoose={flavor.chooseBread} describedBy={described('bread')} />
            <FieldError id={ids.bread} message={errors.bread} />
          </div>
          {view.includedFilling ? (
            <p className="flex items-start gap-2.5 rounded-md bg-harina px-4 py-3 text-nota">
              <LockSimple size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                Tu pan <strong className="font-semibold">{view.includedFilling.bread}</strong> ya trae su relleno
                {view.includedFilling.filling ? ` de ${view.includedFilling.filling}` : ''}, así que no eliges otro.
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <FillingStep view={view.filling} onBase={flavor.chooseBase} onCount={flavor.chooseCount} onFlavor={flavor.chooseFlavor} describedBy={described('filling')} />
              <FieldError id={ids.filling} message={errors.filling} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

const STATUS_WORDS: Record<ReferencePhoto['status'], string | null> = { ready: null, uploading: 'Subiendo…', uploaded: 'Subida', error: null }

function PhotoRow({ photo, onRemove, onUnreadable }: { photo: ReferencePhoto; onRemove: () => void; onUnreadable: () => void }) {
  const failed = photo.status === 'error'
  return (
    <li className={`flex items-center gap-3 rounded-md bg-betun p-2 pr-3 ${failed ? 'border-2 border-error' : 'border border-relieve'}`}>
      {photo.url ? (
        <img src={photo.url} alt={`Vista previa de ${photo.name}`} onError={onUnreadable} className="h-12 w-12 shrink-0 rounded-sm object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-harina text-nota text-mermelada-suave">
          Foto
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-all text-cuerpo">{photo.name}</span>
        {failed && photo.error && <span className="text-nota font-semibold text-error">{photo.error}</span>}
        {STATUS_WORDS[photo.status] && <span className="text-nota text-mermelada-suave">{STATUS_WORDS[photo.status]}</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${photo.name}`}
        className={`min-h-11 shrink-0 rounded-sm px-2 text-etiqueta font-semibold underline underline-offset-4 ${focusRing}`}
      >
        Quitar
      </button>
    </li>
  )
}

/**
 * `/pedido/referencia` (D70, mockups `Referencia` y `ReferenciaError`): las fotos con su vista previa y sus errores, qué
 * tomar de ellas, la ocasión, las personas, la fecha del evento y el presupuesto. "Enviar solicitud" sube las fotos y
 * manda la solicitud; no se cobra nada. Pide sesión.
 */
export default function ReferenceUpload() {
  usePageTitle(TITLE)
  const alertRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const focus = useMemo(() => ({ alert: alertRef, picker: inputRef }), [])
  const form = useReferenceUpload(focus)
  const ids = { description: useId(), occasion: useId(), help: useId(), photosError: useId() }
  const busy = form.status !== 'idle'
  const errors = form.fieldErrors
  const statusText =
    form.status === 'sending' ? 'Enviando tu solicitud…' : form.progress ? `Subiendo tus fotos (${form.progress.done + 1} de ${form.progress.total})…` : ''

  return (
    <>
      <IllustratedHeader
        title={TITLE}
        titleId="referencia-titulo"
        drawing="toldo"
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Realizar pedido', to: '/pedido' }, { label: TITLE }]}
      >
        <p className="text-cuerpo text-mermelada-suave">Mándanos fotos de lo que tienes en mente y te cotizamos.</p>
      </IllustratedHeader>
      <div className={twoColumns}>
        <section aria-labelledby="referencia-tuya" className="flex min-w-0 flex-col gap-4">
          <h2 id="referencia-tuya" className={sectionTitle}>
            Tu referencia
          </h2>
          <Card large>
            <form
              noValidate
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                void form.submit()
              }}
            >
              <fieldset className="flex flex-col gap-2" aria-describedby={errors.photos ? ids.photosError : undefined}>
                <legend className="mb-1.5 text-etiqueta">Fotos de referencia</legend>
                <label
                  className={`flex flex-col items-center gap-1.5 rounded-md border-[1.5px] border-dashed px-4 py-6 text-center ${
                    form.full ? 'cursor-not-allowed border-relieve bg-nata text-mermelada-suave' : 'cursor-pointer border-mermelada bg-harina hover:bg-betun'
                  } ${focusRingWithin}`}
                  onDragOver={(event) => {
                    if (!form.full) event.preventDefault()
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!form.full) void form.pick(Array.from(event.dataTransfer.files))
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    disabled={form.full || busy}
                    aria-describedby={ids.help}
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      // Se vacía para que elegir otra vez el mismo archivo vuelva a avisar.
                      event.target.value = ''
                      void form.pick(files)
                    }}
                  />
                  <UploadSimple size={22} aria-hidden="true" />
                  <span className="text-etiqueta font-semibold">
                    {form.full ? `Ya tienes ${REFERENCE_MAX_PHOTOS} fotos, el máximo. Quita una para cambiarla.` : 'Arrastra tus fotos o elígelas de tu equipo'}
                  </span>
                  <span id={ids.help} className="text-nota text-mermelada-suave">
                    Hasta {REFERENCE_MAX_PHOTOS} fotos, JPG, PNG o WebP de hasta {REFERENCE_PHOTO_MAX_MB} MB cada una
                  </span>
                </label>
                {form.photos.length > 0 && (
                  <ul aria-label="Fotos elegidas" className="flex flex-col gap-2">
                    {form.photos.map((photo) => (
                      <PhotoRow key={photo.id} photo={photo} onRemove={() => form.remove(photo.id)} onUnreadable={() => form.unreadable(photo.id)} />
                    ))}
                  </ul>
                )}
                {form.overflow && <p className="text-nota font-semibold text-mermelada">{form.overflow}</p>}
                {errors.photos && (
                  <p id={ids.photosError} className="text-nota font-semibold text-error">
                    {errors.photos}
                  </p>
                )}
              </fieldset>

              <FieldFrame id={ids.description} label="¿Qué quieres que tomemos de la foto?" error={errors.description}>
                <textarea
                  id={ids.description}
                  rows={4}
                  maxLength={REFERENCE_DESCRIPTION_MAX_LENGTH}
                  placeholder="Ej. La decoración de flores, pero en tonos durazno y de 2 pisos"
                  value={form.description}
                  onChange={(event) => form.edit.description(event.target.value)}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? `${ids.description}-error` : undefined}
                  className={`${fieldBox} min-h-28 py-3`}
                />
              </FieldFrame>

              <div className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
                <TextField
                  label="¿Para cuántas personas?"
                  placeholder="Ej. 40"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={form.people}
                  onChange={(event) => form.edit.people(event.target.value)}
                  error={errors.people}
                />
                <FieldFrame id={ids.occasion} label="¿Para qué ocasión es?" note="(opcional)" error={errors.occasion}>
                  <select
                    id={ids.occasion}
                    value={form.occasion}
                    onChange={(event) => form.edit.occasion(event.target.value)}
                    aria-invalid={errors.occasion ? true : undefined}
                    aria-describedby={errors.occasion ? `${ids.occasion}-error` : undefined}
                    className={`${fieldBox} h-12 cursor-pointer`}
                  >
                    <option value="">Elige una ocasión</option>
                    {OCCASIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldFrame>
              </div>

              <FlavorFields flavor={form.flavor} errors={errors} />

              <div className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
                <TextField
                  label="Fecha del evento"
                  type="date"
                  min={form.minEventDate}
                  value={form.eventDate}
                  onChange={(event) => form.edit.eventDate(event.target.value)}
                  help={
                    form.leadDays
                      ? `Los pedidos se hacen con al menos ${form.leadDays} ${form.leadDays === 1 ? 'día' : 'días'} de anticipación.`
                      : 'Revisamos la anticipación al enviar tu solicitud.'
                  }
                  error={errors.eventDate}
                />
              </div>

              <TextField
                label="Presupuesto aproximado"
                labelNote="(opcional)"
                placeholder="Ej. $1,500"
                inputMode="decimal"
                autoComplete="off"
                maxLength={14}
                value={form.budget}
                onChange={(event) => form.edit.budget(event.target.value)}
                error={errors.budget}
              />

              {form.errors && (
                <div ref={alertRef} tabIndex={-1} data-testid="referencia-aviso" className={`rounded-md ${focusRing}`}>
                  <Notice tone="error" title={form.errors.title}>
                    <ul className="flex flex-col gap-1">
                      {form.errors.messages.map((message, index) => (
                        // Dos campos pueden traer el mismo mensaje: la llave es su lugar en la lista, que no cambia.
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  </Notice>
                </div>
              )}

              <Button type="submit" disabled={busy} className="w-full">
                Enviar solicitud
              </Button>
              <p role="status" className="text-nota text-mermelada-suave">
                {statusText}
              </p>
              <p className="text-nota text-mermelada-suave">No se cobra nada hasta que aceptes la cotización.</p>
            </form>
          </Card>
        </section>
        <HowItWorks store={form.store} />
      </div>
    </>
  )
}
