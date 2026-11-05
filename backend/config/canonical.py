"""Redirección de `www.<dominio canónico>` al dominio canónico."""
from django.conf import settings
from django.http import HttpResponsePermanentRedirect
from django.http.request import split_domain_port


class WwwRedirectMiddleware:
    """Responde 301 a `https://<CANONICAL_HOST><ruta>` si el host es `www.<CANONICAL_HOST>`.

    Sin `CANONICAL_HOST` no hace nada. Cualquier otro host (incluido el de
    herokuapp.com) pasa sin cambios. El destino sale solo de la configuración,
    nunca del host de la petición, así que no abre una redirección a sitios
    ajenos. `get_host()` valida antes contra `ALLOWED_HOSTS`.

    Redirige cualquier método. Un 301 puede convertir un POST en GET; no afecta
    al sitio porque el frontend se carga desde el dominio canónico y llama a
    `/api` con rutas relativas.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        canonical = settings.CANONICAL_HOST
        self.www_host = f"www.{canonical}" if canonical else None
        self.target = f"https://{canonical}" if canonical else None

    def __call__(self, request):
        # `get_host()` valida contra ALLOWED_HOSTS; se compara solo el dominio,
        # sin puerto y en minúsculas.
        domain, _ = split_domain_port(request.get_host())
        if self.www_host and domain == self.www_host:
            return HttpResponsePermanentRedirect(self.target + request.get_full_path())
        return self.get_response(request)
