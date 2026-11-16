/**
 * Google Identity Services (D62): carga la librería de Google y dibuja su botón oficial, con sus colores (libro de
 * marca, "Inicio de sesión y pagos"). El botón entrega un `credential` (ID token) que verifica el backend; aquí no se
 * lee ni se confía en nada de lo que trae.
 */
const SCRIPT_URL = 'https://accounts.google.com/gsi/client'
/**
 * La hoja de estilos del botón. La librería la pide sola, pero dibuja el botón antes de que llegue: su logo es un SVG sin
 * tamaño propio y, sin la hoja, ocupa todo el ancho por un momento (el "logo gigante" al abrir el acceso, tanda 1). Por eso
 * se carga aquí y se espera antes de dibujar. Está permitida en la CSP (`style-src`, `backend/config/csp.py`).
 */
const STYLE_URL = 'https://accounts.google.com/gsi/style'

/** El ancho que acepta el botón de Google, en píxeles. */
const MIN_WIDTH = 200
const MAX_WIDTH = 400

type CredentialResponse = { credential?: string }

type GoogleIdApi = {
  initialize(config: {
    client_id: string
    callback: (response: CredentialResponse) => void
    ux_mode: 'popup'
    auto_select: boolean
    context: 'signin' | 'signup'
    itp_support: boolean
    use_fedcm_for_button: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with' | 'signup_with'; shape: 'pill'; logo_alignment: 'center'; width: number; locale: string },
  ): void
}

function googleIdApi(): GoogleIdApi | null {
  const google: unknown = Reflect.get(globalThis, 'google')
  const accounts: unknown = google && typeof google === 'object' ? Reflect.get(google, 'accounts') : null
  const id: unknown = accounts && typeof accounts === 'object' ? Reflect.get(accounts, 'id') : null
  return id && typeof id === 'object' && typeof Reflect.get(id, 'renderButton') === 'function' ? (id as GoogleIdApi) : null
}

/**
 * El client ID público (`VITE_GOOGLE_CLIENT_ID`). Vacío: no hay botón de Google. En desarrollo, las pruebas E2E lo
 * fijan con la variable global `__googleClientId` (también `''`), para no depender del `.env.local` de quien las corre.
 */
export function googleClientId(): string {
  if (import.meta.env.DEV) {
    const override: unknown = Reflect.get(globalThis, '__googleClientId')
    if (typeof override === 'string') return override.trim()
  }
  const value: unknown = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return typeof value === 'string' ? value.trim() : ''
}

let loading: Promise<GoogleIdApi> | null = null
let styling: Promise<void> | null = null

/** Pide la hoja de estilos de Google una sola vez y espera a que llegue. Si falla, sigue: el contenedor del botón ya reserva su alto. */
function loadGoogleStyles(): Promise<void> {
  styling ??= new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${STYLE_URL}"]`)
    if (existing?.sheet) return resolve()
    const link = existing ?? document.createElement('link')
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
    if (!existing) {
      link.rel = 'stylesheet'
      link.href = STYLE_URL
      document.head.append(link)
    }
  })
  return styling
}

/** Carga la librería una sola vez; un fallo (red, bloqueador) deja intentar otra vez en la próxima pantalla. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  const ready = googleIdApi()
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      const api = googleIdApi()
      if (api) resolve(api)
      else reject(new Error('Google Identity Services no quedó disponible.'))
    }
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'))
    document.head.append(script)
  }).catch((error: unknown) => {
    loading = null
    document.querySelector(`script[src="${SCRIPT_URL}"]`)?.remove()
    throw error
  })
  return loading
}

export type GoogleButtonPurpose = 'signin' | 'signup'

/** Dibuja el botón oficial dentro de `parent`, a lo ancho de su contenedor (de 200 a 400 px). */
export async function renderGoogleButton(
  parent: HTMLElement,
  { clientId, purpose, onCredential }: { clientId: string; purpose: GoogleButtonPurpose; onCredential: (credential: string) => void },
): Promise<void> {
  const [api] = await Promise.all([loadGoogleIdentity(), loadGoogleStyles()])
  api.initialize({
    client_id: clientId,
    callback: (response) => {
      if (typeof response.credential === 'string' && response.credential) onCredential(response.credential)
    },
    ux_mode: 'popup',
    auto_select: false,
    context: purpose,
    itp_support: true,
    use_fedcm_for_button: true,
  })
  parent.replaceChildren()
  api.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: purpose === 'signup' ? 'signup_with' : 'continue_with',
    shape: 'pill',
    logo_alignment: 'center',
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parent.clientWidth))),
    locale: 'es-419',
  })
}
