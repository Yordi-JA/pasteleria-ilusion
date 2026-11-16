import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import Button from '../../components/Button.tsx'
import { buttonClasses } from '../../components/buttonStyles.ts'
import Notice from '../../components/Notice.tsx'
import type { useOrderCancellation } from '../../viewmodels/useOrderCancellation.ts'

type CancelOrderProps = { cancel: ReturnType<typeof useOrderCancellation> }

const FOCUSABLE = 'a[href], button:not([disabled])'

/**
 * "Cancelar pedido" del detalle (D70; ningún mockup lo trae, se arma con el botón, el aviso y el `<dialog>` del
 * proyecto). Muestra el aviso de éxito, el de un 409, el motivo por el que ya no se puede o el botón con su diálogo de
 * confirmación. El `<dialog>` es modal: Esc lo cierra (no mientras envía) y el foco vuelve al botón.
 */
export default function CancelOrder({ cancel }: CancelOrderProps) {
  const { open, sending, error, dialogText } = cancel
  const opener = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const showDialog = cancel.cancellable && dialogText !== null

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open, showDialog])

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {cancel.doneText && (
        <Notice tone="success" title="Pedido cancelado">
          <p>{cancel.doneText}</p>
        </Notice>
      )}
      {cancel.conflict && (
        <Notice tone="error" title="No se pudo cancelar">
          <p>{cancel.conflict}</p>
        </Notice>
      )}
      {cancel.reasonText && <p className="text-cuerpo text-mermelada-suave">{cancel.reasonText}</p>}
      {showDialog && (
        <>
          <button ref={opener} type="button" aria-haspopup="dialog" onClick={cancel.openDialog} className={`${buttonClasses('secondary')} self-start`}>
            Cancelar pedido
          </button>
          <dialog
            ref={dialog}
            aria-labelledby="cancelar-pedido-titulo"
            onKeyDown={trapFocus}
            onCancel={(event) => {
              if (sending) event.preventDefault()
            }}
            onClose={() => {
              cancel.closeDialog()
              opener.current?.focus()
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg bg-betun p-6 text-mermelada shadow-flotante backdrop:bg-mermelada/45 max-[600px]:p-4"
          >
            {open && (
              <div className="flex flex-col gap-4">
                <h2 id="cancelar-pedido-titulo" className="font-display text-titulo-2">
                  Cancelar pedido
                </h2>
                <div className="flex flex-col gap-2 text-cuerpo">
                  <p className="font-semibold">{dialogText.headline}</p>
                  {dialogText.detail && <p className="text-mermelada-suave">{dialogText.detail}</p>}
                  <p className="text-mermelada-suave">Esta acción no se puede deshacer.</p>
                </div>
                {error && (
                  <Notice tone="error" title="No se pudo cancelar">
                    <p>{error}</p>
                  </Notice>
                )}
                <div className="flex flex-wrap gap-3 max-[600px]:flex-col">
                  <Button variant="secondary" onClick={cancel.closeDialog} disabled={sending}>
                    Conservar mi pedido
                  </Button>
                  <Button onClick={cancel.confirm} disabled={sending}>
                    {sending ? 'Cancelando…' : 'Sí, cancelar mi pedido'}
                  </Button>
                </div>
              </div>
            )}
          </dialog>
        </>
      )}
    </>
  )
}
