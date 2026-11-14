"""Límites de tasa propios de la API.

La subida de imágenes y la creación de pedidos cuentan por usuario y, aparte, por IP (auditorías de D53, D55 y D63):
con varias cuentas desde una misma conexión no se multiplica el cupo. `ScopedRateThrottle` solo lleva un alcance por
vista, por eso son dos clases por cada uno.
"""
from rest_framework.throttling import SimpleRateThrottle


class CustomerImageUserThrottle(SimpleRateThrottle):
    scope = "customer_images_user"
    # Sin valor: se lee de `DEFAULT_THROTTLE_RATES` (las pruebas lo fijan).
    rate = None

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class CustomerImageIPThrottle(SimpleRateThrottle):
    scope = "customer_images_ip"
    rate = None

    def get_cache_key(self, request, view):
        # La IP sale de `NUM_PROXIES`, igual que en el resto del throttling (un X-Forwarded-For falso no la cambia).
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class OrderCreateUserThrottle(CustomerImageUserThrottle):
    """Crear pedidos, por cuenta (`orders_create`, 10 por hora): cada pedido aparta lapso y existencias."""

    scope = "orders_create"
    cache_format = "throttle_%(scope)s_user_%(ident)s"


class OrderCreateIPThrottle(CustomerImageIPThrottle):
    """Crear pedidos, por IP, con la misma tasa que por cuenta."""

    scope = "orders_create"
    cache_format = "throttle_%(scope)s_ip_%(ident)s"
