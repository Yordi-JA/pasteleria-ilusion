import { Link } from 'react-router'
import Button from '../components/Button.tsx'
import { inlineLink } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import PasswordField from '../components/PasswordField.tsx'
import TextField from '../components/TextField.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { usePasswordRecovery } from '../viewmodels/usePasswordRecovery.ts'
import { PASSWORD_HELP } from '../viewmodels/useRegister.ts'
import AccessLayout from './access/AccessLayout.tsx'
import AccessPanel, { AccessAside } from './access/AccessPanel.tsx'

const REQUEST_TITLE = 'Recupera tu contraseña'
const RESET_TITLE = 'Crea tu nueva contraseña'

type Recovery = Omit<ReturnType<typeof usePasswordRecovery>, 'refs'>
type FieldRef = ReturnType<typeof usePasswordRecovery>['refs']['email']

/** Recuperar.dc.html: el correo, "Enviar enlace", el mensaje neutro, la nota de Google y "Volver a iniciar sesión". */
function RequestForm({ recovery: { request, invalidLinkNotice }, emailRef }: { recovery: Recovery; emailRef: FieldRef }) {
  return (
    <>
      {invalidLinkNotice && (
        <Notice tone="error" title={invalidLinkNotice.title}>
          {invalidLinkNotice.detail}
        </Notice>
      )}
      <form noValidate onSubmit={request.submit} aria-label="Recuperar contraseña" className="flex flex-col gap-4">
        {request.notice && (
          <Notice tone="error" title={request.notice.title}>
            {request.notice.detail}
          </Notice>
        )}
        <TextField
          ref={emailRef}
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nombre@correo.com"
          value={request.email.value}
          onChange={(event) => request.email.onChange(event.target.value)}
          error={request.email.error}
        />
        <Button type="submit" disabled={request.submitting} className="w-full">
          {request.submitting ? 'Enviando…' : 'Enviar enlace'}
        </Button>
        {/* Siempre montada: el mensaje se anuncia una vez al llegar y dice lo mismo exista o no la cuenta. Vacía, no
            suma el espacio entre campos. */}
        <div role="status" className="empty:-mt-4">
          {request.sentText && (
            <Notice title="Revisa tu correo." live={false}>
              {request.sentText}
            </Notice>
          )}
        </div>
      </form>
      <AccessAside>
        <span>
          Si entras con Google no necesitas contraseña: usa <strong className="font-semibold">Continuar con Google</strong> al iniciar
          sesión.
        </span>
      </AccessAside>
      <p className="text-center">
        <Link to="/entrar" className={`font-semibold ${inlineLink}`}>
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  )
}

/** "Crea tu nueva contraseña" (no está en el mockup, D76): la misma tarjeta, con un campo y un botón. */
function NewPasswordForm({ recovery: { reset }, passwordRef }: { recovery: Recovery; passwordRef: FieldRef }) {
  return (
    <>
      <form noValidate onSubmit={reset.submit} aria-label="Crear contraseña nueva" className="flex flex-col gap-4">
        {reset.notice && (
          <Notice tone="error" title={reset.notice.title}>
            {reset.notice.detail}
          </Notice>
        )}
        <PasswordField
          ref={passwordRef}
          label="Contraseña nueva"
          autoComplete="new-password"
          placeholder="Crea una contraseña"
          help={PASSWORD_HELP}
          value={reset.password.value}
          onChange={(event) => reset.password.onChange(event.target.value)}
          error={reset.password.error}
        />
        <Button type="submit" disabled={reset.submitting} className="w-full">
          {reset.submitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
      <p className="text-center">
        <Link to="/entrar" className={`font-semibold ${inlineLink}`}>
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  )
}

/**
 * `/recuperar` (Recuperar.dc.html, D76). Sin token, pide el correo y responde siempre lo mismo. Con `#<token>`, el
 * enlace del correo: "Crea tu nueva contraseña", y al guardarla, la cuenta con la sesión nueva.
 */
export default function PasswordRecovery() {
  const {
    refs: { email: emailRef, password: passwordRef },
    ...recovery
  } = usePasswordRecovery()
  const resetting = recovery.mode === 'reset'
  const title = resetting ? RESET_TITLE : REQUEST_TITLE
  usePageTitle(title)

  return (
    <AccessLayout slogan="Te ayudamos a entrar de nuevo." cake="static">
      <AccessPanel
        title={title}
        intro={
          <p className="text-mermelada-suave">
            {resetting
              ? 'Escribe la contraseña con la que vas a entrar. Al guardarla cerramos tu sesión en todos tus dispositivos.'
              : 'Escribe el correo con el que te registraste y te enviamos un enlace para crear una nueva.'}
          </p>
        }
      >
        {resetting ? (
          <NewPasswordForm recovery={recovery} passwordRef={passwordRef} />
        ) : (
          <RequestForm recovery={recovery} emailRef={emailRef} />
        )}
      </AccessPanel>
    </AccessLayout>
  )
}
