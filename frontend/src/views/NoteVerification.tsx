import { Check } from '@phosphor-icons/react'
import Button from '../components/Button.tsx'
import Card from '../components/Card.tsx'
import FactTable from '../components/FactTable.tsx'
import type { Fact } from '../components/FactTable.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { useNoteVerification } from '../viewmodels/useNoteVerification.ts'
import type { NoteView } from '../viewmodels/useNoteVerification.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Verificación de nota'

function factsOf(note: NoteView): Fact[] {
  const facts: Fact[] = [
    { label: 'Cliente', value: note.customer },
    { label: 'Entrega', value: note.delivery, note: note.fulfillment },
  ]
  for (const stand of note.stands) {
    facts.push(
      { label: stand.title, value: stand.statusLabel },
      { label: stand.dateLabel, value: stand.date },
      { label: 'Depósito', value: stand.deposit },
    )
  }
  return facts
}

function ValidNote({ note }: { note: NoteView }) {
  return (
    <Card as="section" large aria-labelledby="nota-valida" className="flex w-full max-w-[432px] flex-col gap-3">
      <div className="flex items-center gap-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-exito text-sobre-color" aria-hidden="true">
          <Check size={22} weight="bold" />
        </span>
        <div className="flex flex-col">
          <h2 id="nota-valida" className="font-display text-titulo-3">
            Nota válida
          </h2>
          <p className="text-nota text-mermelada-suave">{note.heading}</p>
        </div>
      </div>
      <FactTable caption="Datos de la nota" facts={factsOf(note)} />
    </Card>
  )
}

function NoteSkeleton() {
  return (
    <div className="flex w-full max-w-[432px] flex-col gap-4">
      <Skeleton radius="md" className="h-72 w-full" />
    </div>
  )
}

/**
 * `/nota/:token` (D69, mockup `NotaVerificada`): la página pública que abre el QR de la nota. Sin sesión y sin el
 * encabezado de la compra. Solo muestra lo que la API da para verificarla: nunca teléfono, correo ni dirección. La
 * devolución de la base la registra la pastelería (D64): aquí no hay botón.
 */
export default function NoteVerification() {
  usePageTitle(TITLE)
  const note = useNoteVerification()
  return (
    <>
      <PageHeader title={TITLE}>
        <p className="text-cuerpo text-mermelada-suave">Esta nota la emitió Pastelería Ilusión.</p>
      </PageHeader>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center px-6 py-12 max-[600px]:px-4">
        <LoadingRegion loading={note.status === 'loading'} label="Verificando la nota" skeleton={<NoteSkeleton />} className="flex w-full justify-center">
          {note.view && <ValidNote note={note.view} />}
          {note.failure === 'invalid' && (
            <Notice tone="error" title="Esta nota no es válida" className="max-w-[432px]">
              No encontramos una nota con este código. Revisa que el código QR esté completo o pide tu nota en la pastelería.
            </Notice>
          )}
          {note.failure === 'throttled' && (
            <Notice tone="attention" title="Demasiadas consultas" className="max-w-[432px]">
              <div className="flex flex-col items-start gap-3">
                <p>Espera un minuto y vuelve a intentarlo.</p>
                <Button variant="secondary" onClick={note.retry}>
                  Volver a intentar
                </Button>
              </div>
            </Notice>
          )}
          {note.failure === 'unavailable' && (
            <Notice tone="error" title="No se pudo verificar la nota" className="max-w-[432px]">
              <div className="flex flex-col items-start gap-3">
                <p>Revisa tu conexión y vuelve a intentarlo.</p>
                <Button variant="secondary" onClick={note.retry}>
                  Volver a intentar
                </Button>
              </div>
            </Notice>
          )}
        </LoadingRegion>
      </div>
    </>
  )
}
