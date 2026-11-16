"""Límites de tasa propios de la API.

Todos cuentan en la caché `security` y, por IP, una IPv6 cuenta por su /64 (`config.security.group_ip`, D62): así el
cull de la caché pública (`anon`, `store_info`, `catalog`) no reinicia un contador de abuso, y dentro de su /64 el
cliente no estrena contador con cada dirección.

- Acceso (D62): `SecurityScopedRateThrottle`, siempre por IP.
- Subida de imágenes y creación de pedidos (auditorías de D53, D55 y D63): por usuario y, aparte, por IP, para que
  varias cuentas desde una misma conexión no multipliquen el cupo. `ScopedRateThrottle` solo lleva un alcance por
  vista, por eso son dos clases por cada uno.
- Calendario de la entrega (D66): por usuario, aparte del cupo general `user`.
- Iniciar un pago (D68): por usuario; los webhooks de pago, por IP con `SecurityScopedRateThrottle`.
- Pedir un enlace por correo (D76: reenviar la confirmación, recuperar la contraseña): por el correo que se escribe y,
  aparte, por IP. Abrir un enlace: por IP, con `SecurityScopedRateThrottle`.
"""
import hashlib

from django.contrib.auth import get_user_model
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
    """Crear pedidos, por cuenta (`orders_create_user`, 10 por hora): cada pedido aparta lapso y existencias."""

    scope = "orders_create_user"


class OrderRetryUserThrottle(CustomerImageUserThrottle):
    """Reintentos con una llave que ya tiene pedido (`orders_retry_user`, 120 por minuto): no crean nada, pero tampoco
    salen sin límite."""

    scope = "orders_retry_user"


class DeliverySlotUserThrottle(CustomerImageUserThrottle):
    """El calendario de la entrega, por cuenta (`delivery_slots`, 30 por minuto, D66): cada consulta cuenta los pedidos
    de hasta 42 días, así que no comparte el cupo general de la cuenta."""

    scope = "delivery_slots"


class OrderCreateIPThrottle(CustomerImageIPThrottle):
    """Crear pedidos, por IP (`orders_create_ip`, 60 por hora): más holgada, porque varias personas comparten la red."""

    scope = "orders_create_ip"


class PaymentStartUserThrottle(CustomerImageUserThrottle):
    """Iniciar un pago, por cuenta (`payments_user`, 20 por minuto, D68): cada intento nuevo llama a una pasarela.
    Consultar el estado del pago usa el cupo general `user`."""

    scope = "payments_user"


class NoteVerificationThrottle(SecurityScopedRateThrottle):
    """La verificación pública de la nota (`note_verification`, D69), por IP: el token no se adivina, pero el cupo
    frena a quien pruebe tokens en masa."""


class ReferenceCreateUserThrottle(CustomerImageUserThrottle):
    """Enviar una referencia, por cuenta (`references_create_user`, 10 por hora, D70): cada una guarda fotos y le pide
    trabajo a la pastelería. Un reintento con la misma llave usa `orders_retry_user`."""

    scope = "references_create_user"


class ReferenceAcceptUserThrottle(CustomerImageUserThrottle):
    """Aceptar una cotización, por cuenta (`references_accept_user`, 20 por hora, D70): crea el pedido y aparta el
    lapso."""

    scope = "references_accept_user"


class OrderCancelUserThrottle(CustomerImageUserThrottle):
    """Cancelar un pedido desde la cuenta, por cuenta (`orders_cancel_user`, 20 por hora, D70)."""

    scope = "orders_cancel_user"


class PasswordChangeUserThrottle(CustomerImageUserThrottle):
    """Cambiar la contraseña, por cuenta (`password_change_user`, 10 por hora, D72): quien tenga un access robado no
    puede probar contraseñas actuales sin fin."""

    scope = "password_change_user"


class PasswordChangeIPThrottle(CustomerImageIPThrottle):
    """Cambiar la contraseña, por IP (`password_change_ip`, 30 por hora, D72), como el inicio de sesión: varias cuentas
    desde una conexión no suman cupo."""

    scope = "password_change_ip"


class RequestedEmailThrottle(SimpleRateThrottle):
    """Por el correo que trae el cuerpo (`email`), exista o no la cuenta: así el 429 no dice nada de ella (D76).

    El correo se normaliza como al guardarlo (mayúsculas y espacios no estrenan contador) y va en la llave como un
    SHA-256, para que la tabla de la caché no guarde correos. Sin un correo de texto no cuenta: el serializador
    responde el error de formato.
    """

    rate = None
    cache = SECURITY_CACHE

    def get_cache_key(self, request, view):
        email = request.data.get("email") if hasattr(request.data, "get") else None
        if not isinstance(email, str) or not email.strip():
            return None
        normalized = get_user_model().objects.normalize_email(email)
        return self.cache_format % {"scope": self.scope, "ident": hashlib.sha256(normalized.encode()).hexdigest()}


class VerificationResendEmailThrottle(RequestedEmailThrottle):
    """Reenviar la confirmación, por correo (`verify_resend_email`, 5 por hora): nadie llena el buzón de otra persona."""

    scope = "verify_resend_email"


class VerificationResendIPThrottle(CustomerImageIPThrottle):
    """Reenviar la confirmación, por IP (`verify_resend_ip`, 30 por hora): muchos correos desde una conexión."""

    scope = "verify_resend_ip"


class PasswordResetEmailThrottle(RequestedEmailThrottle):
    """Pedir el enlace de recuperación, por correo (`password_reset_email`, 5 por hora)."""

    scope = "password_reset_email"


class PasswordResetIPThrottle(CustomerImageIPThrottle):
    """Pedir el enlace de recuperación, por IP (`password_reset_ip`, 30 por hora)."""

    scope = "password_reset_ip"
