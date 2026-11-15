"""Content-Security-Policy del sitio y de la API (D62).

El sitio es el build de Vite: solo carga scripts y estilos de su origen, sin código
en línea ni `eval`. Las excepciones son las que pide Google Identity Services (su
script, su hoja de estilos, el iframe del botón y sus peticiones) y lo que la vista
previa de "Diseña tu pastel" usa: imágenes locales (`blob:`) que también se leen con
`fetch`, y los SVG de la duya en `data:`. El 3D dibuja en un canvas sin workers ni
texturas remotas, así que no pide nada más.

En desarrollo el HTML lo sirve Vite, no Django, así que esta política no aplica ahí
y no necesita `'unsafe-inline'` ni `ws:` para Vite.

La API devuelve JSON: su política no deja cargar nada (`default-src 'none'`), por si
un navegador llegara a interpretar una respuesta como documento.

El pago con tarjeta (D68) usa Stripe.js: su script, sus iframes (los campos de la
tarjeta y la verificación 3D Secure de `hooks.stripe.com`) y su API. Es la lista de
Stripe para Stripe.js (https://docs.stripe.com/security/guide), sin Google Maps, que
solo pide su Address Element y aquí no se usa. Mercado Pago es una redirección a
Checkout Pro y no necesita nada.

El admin y Swagger UI quedan fuera: traen código en línea y necesitan su propia
política (pendiente en `docs/proyecto/decisiones.md`).
"""

GOOGLE_IDENTITY = "https://accounts.google.com/gsi/"
STRIPE_JS = ["https://js.stripe.com", "https://*.js.stripe.com"]
STRIPE_HOOKS = "https://hooks.stripe.com"
STRIPE_API = "https://api.stripe.com"


def _policy(directives: dict[str, list[str]]) -> str:
    return "; ".join(f"{name} {' '.join(sources)}" for name, sources in directives.items())


SITE_POLICY = _policy(
    {
        "default-src": ["'self'"],
        "script-src": ["'self'", f"{GOOGLE_IDENTITY}client", *STRIPE_JS],
        "style-src": ["'self'", f"{GOOGLE_IDENTITY}style"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'"],
        "connect-src": ["'self'", "blob:", GOOGLE_IDENTITY, STRIPE_API],
        "frame-src": [GOOGLE_IDENTITY, *STRIPE_JS, STRIPE_HOOKS],
        "object-src": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
    }
)

API_POLICY = _policy({"default-src": ["'none'"], "frame-ancestors": ["'none'"]})

# Traen código en línea: sin política hasta que tengan una propia.
EXEMPT_PREFIXES = ("/admin/", "/api/v1/docs/")


def policy_for(path: str) -> str | None:
    """La política que corresponde a una ruta, o `None` si va sin ella."""
    if path.startswith(EXEMPT_PREFIXES):
        return None
    if path == "/api" or path.startswith("/api/"):
        return API_POLICY
    return SITE_POLICY


def add_whitenoise_csp(headers, path, url) -> None:
    """Para `WHITENOISE_ADD_HEADERS_FUNCTION`: los HTML que sirve WhiteNoise (`/index.html`).

    WhiteNoise corta la petición antes de los middleware, así que este es el único
    lugar donde ese HTML recibe la política. Los JS, CSS e imágenes no la necesitan.
    """
    if url.endswith(".html"):
        headers["Content-Security-Policy"] = SITE_POLICY


class ContentSecurityPolicyMiddleware:
    """Pone la política según la ruta, salvo que la vista ya haya puesto una."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        policy = policy_for(request.path)
        if policy and "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = policy
        return response
