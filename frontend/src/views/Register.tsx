import { Link, Navigate } from 'react-router'
import Button from '../components/Button.tsx'
import { focusRingWithin, inlineLink } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import PasswordField from '../components/PasswordField.tsx'
import TextField from '../components/TextField.tsx'
import { useAccessReturn } from '../viewmodels/useAccessReturn.ts'
import { useGoToVerification } from '../viewmodels/useEmailVerification.ts'
import { useGoogleSignIn } from '../viewmodels/useGoogleSignIn.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { PASSWORD_HELP, useRegister } from '../viewmodels/useRegister.ts'
import { useSession } from '../viewmodels/useSession.ts'
import AccessCard from './access/AccessCard.tsx'
import AccessLayout from './access/AccessLayout.tsx'
import LegalLinks from './access/LegalLinks.tsx'

const TITLE = 'Crea tu cuenta'

const BENEFITS = [
  { title: 'Sigue tu pedido', detail: 'Te avisamos cada vez que cambia de estado.' },
  { title: 'Controla tus bases', detail: 'Ve qué bases tienes en préstamo y cuándo se libera tu depósito.' },
  { title: 'Repite lo que te gustó', detail: 'Tus pedidos anteriores quedan guardados.' },
]

/** La flama de la vela de la marca, como viñeta de la lista (Registro.dc.html). */
function Flame() {
  return (
    <svg width="14" height="22" viewBox="0 0 14 22" aria-hidden="true" className="mt-[3px] shrink-0 fill-frambuesa">
      <path
        fillRule="evenodd"
        d="M7 21C2 21 1 16 3.5 12.5 5 10.5 7.5 8 9.5 1 10.5 6 13.5 9.5 12.5 14.5 12 18 10 21 7 21ZM7.2 18.5C9 18.5 9.5 16.6 8.8 15 8.3 14 7.6 13.2 7.3 11.8 6.6 13.4 5.4 14.3 5.4 16 5.4 17.4 6 18.5 7.2 18.5Z"
      />
    </svg>
  )
}

function Benefits() {
  return (
    <ul className="flex max-w-[440px] flex-col gap-[18px]">
      {BENEFITS.map(({ title, detail }) => (
        <li key={title} className="flex gap-3.5">
          <Flame />
          <span>
            <strong className="font-semibold">{title}</strong>
            <br />
            <span className="text-mermelada-suave">{detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * `/registro` (Registro.dc.html y RegistroError.dc.html): nombre, correo, teléfono opcional, contraseña y la
 * aceptación de los términos. Un correo que ya tiene cuenta lo dice con los enlaces para entrar y para recuperar la
 * contraseña (D61, D76). Crear la cuenta no abre sesión (D76): lleva a `/verificar`, que dice a qué correo fue el
 * enlace para confirmarla. Google sí abre la sesión y vuelve a `?volver=` sin tocar el carrito.
 */
export default function Register() {
  usePageTitle(TITLE)
  const session = useSession()
  const access = useAccessReturn()
  const goToVerification = useGoToVerification()
  const {
    refs: { fullName: fullNameRef, email: emailRef, phone: phoneRef, password: passwordRef, acceptsTerms: termsRef },
    ...form
  } = useRegister(goToVerification)
  const google = useGoogleSignIn('signup', access.goToReturn)

  if (session.status === 'authenticated' && !google.linked && !form.submitting && !google.submitting) {
    return <Navigate to={access.returnTo} replace />
  }

  const emailError = form.emailTaken ? (
    <>
      {form.email.error}{' '}
      <Link to={access.loginLink} className={inlineLink}>
        Inicia sesión
      </Link>{' '}
      o{' '}
      <Link to="/recuperar" className={inlineLink}>
        recupera tu contraseña
      </Link>
      .
    </>
  ) : (
    form.email.error
  )

  return (
    <AccessLayout slogan="Una cuenta para todos tus pedidos." aside={<Benefits />}>
      <AccessCard
        title={TITLE}
        subtitle={{ withGoogle: 'Regístrate con Google o con tu correo.', emailOnly: 'Regístrate con tu correo.' }}
        google={google}
        footer={
          <p className="text-center">
            ¿Ya tienes cuenta?{' '}
            <Link to={access.loginLink} className={`font-semibold ${inlineLink}`}>
              Inicia sesión
            </Link>
          </p>
        }
      >
        <form noValidate onSubmit={form.submit} aria-label="Crear cuenta con correo" className="flex flex-col gap-4">
          {form.notice && (
            <Notice tone="error" title={form.notice.title}>
              {form.notice.detail}
            </Notice>
          )}
          <TextField
            ref={fullNameRef}
            label="Nombre completo"
            autoComplete="name"
            placeholder="Ej. Ana López García"
            maxLength={150}
            value={form.fullName.value}
            onChange={(event) => form.fullName.onChange(event.target.value)}
            error={form.fullName.error}
          />
          <TextField
            ref={emailRef}
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nombre@correo.com"
            help="Aquí te avisamos los cambios de estado de tu pedido."
            value={form.email.value}
            onChange={(event) => form.email.onChange(event.target.value)}
            error={emailError}
          />
          <TextField
            ref={phoneRef}
            label="Teléfono o WhatsApp"
            labelNote="(opcional)"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            placeholder="Ej. 55 1234 5678"
            help="10 dígitos. Lo usamos si hay algún detalle con tu pedido."
            maxLength={20}
            value={form.phone.value}
            onChange={(event) => form.phone.onChange(event.target.value)}
            error={form.phone.error}
          />
          <PasswordField
            ref={passwordRef}
            label="Contraseña"
            autoComplete="new-password"
            placeholder="Crea una contraseña"
            help={PASSWORD_HELP}
            value={form.password.value}
            onChange={(event) => form.password.onChange(event.target.value)}
            error={form.password.error}
          />
          <div className="flex flex-col gap-1.5">
            <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm text-[15px] leading-[1.5] ${focusRingWithin}`}>
              <input
                ref={termsRef}
                type="checkbox"
                checked={form.acceptsTerms.value}
                onChange={(event) => form.acceptsTerms.onChange(event.target.checked)}
                aria-invalid={form.acceptsTerms.error ? true : undefined}
                aria-describedby={form.acceptsTerms.error ? 'terminos-error' : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-mermelada"
              />
              <span>
                Acepto <LegalLinks />.
              </span>
            </label>
            {form.acceptsTerms.error && (
              <p id="terminos-error" className="text-nota font-semibold text-error">
                {form.acceptsTerms.error}
              </p>
            )}
          </div>
          <Button type="submit" disabled={form.submitting} className="w-full">
            {form.submitting ? 'Creando tu cuenta…' : 'Crear cuenta'}
          </Button>
        </form>
      </AccessCard>
    </AccessLayout>
  )
}
