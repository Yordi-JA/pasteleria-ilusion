"""Vistas del sitio: respaldo de la SPA de React y 404 de la API."""
from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_safe
from django.views.defaults import page_not_found


@require_safe
def spa_index(request, path=""):
    """Devuelve `index.html` del build para que el router de React resuelva la ruta.

    `config/urls.py` ya deja fuera `/api/`, `/admin/`, `/static/` y `/media/`.
    Aquí se responde 404 a lo que parece un archivo (`/assets/falta.js`,
    `/sitemap.xml`): devolver HTML con 200 ahí escondería los errores.
    `/robots.txt` y los favicon existen en el build y WhiteNoise los sirve antes.
    """
    looks_like_file = "." in path.rsplit("/", 1)[-1]
    index = settings.FRONTEND_DIST / "index.html"
    if looks_like_file or not index.is_file():
        raise Http404
    response = FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")
    # El index referencia archivos con hash nuevo en cada despliegue.
    response["Cache-Control"] = "no-cache"
    return response


def not_found(request, exception):
    """404 en JSON para la API (como los de DRF); HTML estándar para el resto."""
    if request.path == "/api" or request.path.startswith("/api/"):
        return JsonResponse({"detail": "No encontrado."}, status=404)
    return page_not_found(request, exception)
