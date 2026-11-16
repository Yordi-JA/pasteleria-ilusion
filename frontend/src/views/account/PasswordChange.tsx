import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import PasswordField from '../../components/PasswordField.tsx'
import type { PasswordChangeView } from '../../viewmodels/useAccountDetails.ts'

/** El `<form>` vacío al que pertenecen los campos de la contraseña: no puede ir dentro del formulario de los datos. */
export const PASSWORD_FORM_ID = 'cambiar-contrasena-form'
const PANEL_ID = 'cambiar-contrasena'

/**
 * "Contraseña" dentro de "Datos personales" (CuentaDatos.dc.html): "Cambiar contraseña" abre aquí mismo la contraseña
 * actual y la nueva (D72). Los campos y su botón pertenecen a `PASSWORD_FORM_ID` (atributo `form`), así Enter en ellos
 * cambia la contraseña y no guarda los datos. La región `role="status"` queda siempre montada para anunciar el cambio.
 */
export default function PasswordChange({ password: viewModel }: { password: PasswordChangeView }) {
  // Las refs aparte, como en `Login.tsx`: el resto del view-model se lee al pintar.
  const { toggleRef, refs: { current: currentRef, next: nextRef }, ...password } = viewModel
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <p id="contrasena-titulo" className="text-etiqueta">
        Contraseña
      </p>
      {/* Sin separación entre el botón y el aviso: vacío no ocupa lugar, y sigue visible para que se anuncie. */}
      <div className="flex flex-col items-start">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={password.open}
          aria-controls={password.open ? PANEL_ID : undefined}
          onClick={password.toggle}
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm text-cuerpo font-semibold underline underline-offset-4 ${focusRing}`}
        >
          Cambiar contraseña
        </button>
        <p role="status" className="text-etiqueta text-mermelada">
          {password.statusText}
        </p>
      </div>
      {password.open && (
        <div id={PANEL_ID} role="group" aria-labelledby="contrasena-titulo" className="flex flex-col gap-4">
          <PasswordField
            ref={currentRef}
            form={PASSWORD_FORM_ID}
            label="Contraseña actual"
            autoComplete="current-password"
            maxLength={128}
            value={password.current.value}
            onChange={(event) => password.current.onChange(event.target.value)}
            error={password.current.error}
          />
          <PasswordField
            ref={nextRef}
            form={PASSWORD_FORM_ID}
            label="Contraseña nueva"
            autoComplete="new-password"
            maxLength={128}
            help={password.nextHelp}
            value={password.next.value}
            onChange={(event) => password.next.onChange(event.target.value)}
            error={password.next.error}
          />
          {password.notice && (
            <Notice tone="error" title={password.notice.title}>
              {password.notice.detail}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" form={PASSWORD_FORM_ID} variant="secondary" aria-disabled={password.submitting || undefined}>
              Guardar contraseña
            </Button>
            <button
              type="button"
              onClick={password.close}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm px-2 text-etiqueta underline underline-offset-4 ${focusRing}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
