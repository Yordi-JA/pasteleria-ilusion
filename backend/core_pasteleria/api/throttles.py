"""Throttles del acceso: por IP (IPv6 por /64) y en la caché `security` (D62)."""
from django.core.cache import caches
from django.utils.connection import ConnectionProxy
from rest_framework.throttling import ScopedRateThrottle

from config.security import group_ip


class SecurityScopedRateThrottle(ScopedRateThrottle):
    """`ScopedRateThrottle` con sus contadores en la caché `security`.

    Así el cull de la caché pública (`anon`, `store_info`, `catalog`) no reinicia un
    contador del inicio de sesión. `ConnectionProxy` resuelve el alias en cada uso,
    como `django.core.cache.cache`, así que respeta un `CACHES` cambiado en pruebas.
    Las vistas del acceso no autentican: el contador siempre es por IP (`NUM_PROXIES`),
    y una IPv6 cuenta por su /64, porque dentro de ella el cliente elige la dirección.
    """

    cache = ConnectionProxy(caches, "security")

    def get_ident(self, request):
        return group_ip(super().get_ident(request))
