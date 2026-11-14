"""Límites de tasa propios de la API.

Todos cuentan en la caché `security` y, por IP, una IPv6 cuenta por su /64 (`config.security.group_ip`, D62): así el
cull de la caché pública (`anon`, `store_info`, `catalog`) no reinicia un contador de abuso, y dentro de su /64 el
cliente no estrena contador con cada dirección.

- Acceso (D62): `SecurityScopedRateThrottle`, siempre por IP.
- Subida de imágenes y creación de pedidos (auditorías de D53, D55 y D63): por usuario y, aparte, por IP, para que
  varias cuentas desde una misma conexión no multipliquen el cupo. `ScopedRateThrottle` solo lleva un alcance por
  vista, por eso son dos clases por cada uno.
"""
from django.core.cache import caches
from django.utils.connection import ConnectionProxy
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

from config.security import group_ip

# `ConnectionProxy` resuelve el alias en cada uso, como `django.core.cache.cache`, así que respeta un `CACHES`
# cambiado en pruebas.
SECURITY_CACHE = ConnectionProxy(caches, "security")


class SecurityScopedRateThrottle(ScopedRateThrottle):
    """`ScopedRateThrottle` con sus contadores en la caché `security`.

    Así el cull de la caché pública (`anon`, `store_info`, `catalog`) no reinicia un
    contador del inicio de sesión. Las vistas del acceso no autentican: el contador
    siempre es por IP (`NUM_PROXIES`), y una IPv6 cuenta por su /64, porque dentro
    de ella el cliente elige la dirección.
    """

    cache = SECURITY_CACHE

    def get_ident(self, request):
        return group_ip(super().get_ident(request))


class CustomerImageUserThrottle(SimpleRateThrottle):
    scope = "customer_images_user"
    # Sin valor: se lee de `DEFAULT_THROTTLE_RATES` (las pruebas lo fijan).
    rate = None
    cache = SECURITY_CACHE

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class CustomerImageIPThrottle(SimpleRateThrottle):
    scope = "customer_images_ip"
    rate = None
    cache = SECURITY_CACHE

    def get_ident(self, request):
        # La IP sale de `NUM_PROXIES`, igual que en el resto del throttling (un X-Forwarded-For falso no la cambia).
        return group_ip(super().get_ident(request))

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class OrderCreateUserThrottle(CustomerImageUserThrottle):
    """Crear pedidos, por cuenta (`orders_create`, 10 por hora): cada pedido aparta lapso y existencias."""

    scope = "orders_create"
    cache_format = "throttle_%(scope)s_user_%(ident)s"


class OrderCreateIPThrottle(CustomerImageIPThrottle):
    """Crear pedidos, por IP, con la misma tasa que por cuenta."""

    scope = "orders_create"
    cache_format = "throttle_%(scope)s_ip_%(ident)s"
