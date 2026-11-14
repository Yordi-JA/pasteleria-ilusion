"""Identidad del cliente para el bloqueo de inicio de sesión (django-axes) y los throttles."""
from ipaddress import IPv6Address, ip_address, ip_network

from django.contrib.auth import get_user_model
from rest_framework.throttling import BaseThrottle

# Un proveedor entrega a cada cliente IPv6 al menos una /64: dentro de ella, la
# persona elige la dirección. Contar por dirección dejaría estrenar un contador
# en cada intento (D62).
IPV6_GROUP_PREFIX = 64


def group_ip(value: str) -> str:
    """La identidad de una IP para contar intentos: IPv4 tal cual; IPv6, su /64.

    Devuelve la dirección de red (por ejemplo `2001:db8:1:2::`), que sigue siendo
    una IP válida para el campo de django-axes. Una IPv4 escrita como IPv6
    (`::ffff:10.0.0.7`) cuenta como la IPv4. Lo que no es IP se devuelve igual:
    quien llama decide qué hacer con ello. Reutilizable por otros throttles.
    """
    try:
        address = ip_address(value)
    except ValueError:
        return value
    if isinstance(address, IPv6Address):
        if address.ipv4_mapped:
            return str(address.ipv4_mapped)
        return str(ip_network(f"{address}/{IPV6_GROUP_PREFIX}", strict=False).network_address)
    return str(address)


def client_ip(request):
    """IP del cliente con la misma regla que el throttling de DRF, con IPv6 por /64.

    Usa `NUM_PROXIES`: con 0 ignora `X-Forwarded-For` y toma la dirección de la
    conexión; con N toma la que agregó el proxy de confianza. Así un
    `X-Forwarded-For` falso no reinicia el contador de intentos.

    Si el valor no es una IP (por ejemplo, con `NUM_PROXIES` mal configurado o
    un encabezado alterado), regresa a la dirección de la conexión: guardarlo
    tal cual rompería el campo de IP de la base con un error 500.
    """
    ident = BaseThrottle().get_ident(request)
    try:
        ip_address(ident)
    except ValueError:
        ident = request.META.get("REMOTE_ADDR")
    return group_ip(ident) if ident else ident


def normalized_username(request, credentials):
    """Correo normalizado como lo guarda el modelo, o `None` si no hay.

    Lee el campo de usuario del modelo (`email`, como en `authenticate(email=...)`),
    luego `username` (el formulario del admin) y por último el POST. Sin esto,
    `Ana@x.com` y `ana@x.com` serían dos contadores distintos, y un inicio de
    sesión sin `username` compartiría un contador vacío con todos los demás.
    """
    credentials = credentials or {}
    field = get_user_model().USERNAME_FIELD
    username = (
        credentials.get(field)
        or credentials.get("username")
        or request.POST.get("username")
        or ""
    )
    if not isinstance(username, str):
        # Un entero o una lista no son un correo: sin correo, no se normaliza.
        return None
    return get_user_model().objects.normalize_email(username) or None


# Ruta del inicio de sesión de clientes por la API (`core_pasteleria.api.urls`).
API_LOGIN_PATH = "/api/v1/auth/login/"

# Admin (y cualquier otra ruta que llame a `authenticate()`): IP + correo, y la IP
# sola contra el rociado de contraseñas (D34).
STRICT_LOCKOUT = [["ip_address", "username"], "ip_address"]
# Clientes por la API (D61, D62): solo IP + correo. Con la IP sola, 5 fallos de
# cualquiera detrás de una IP compartida (CGNAT de los operadores móviles)
# bloquearían una hora a todos sus clientes; el ataque a muchos correos desde una
# IP lo frena el throttle `login`.
API_LOCKOUT = [["ip_address", "username"]]


def _path(request_or_attempt):
    # axes pasa la petición o, al limpiar, un `AccessAttempt` (que guarda `path_info`).
    return getattr(request_or_attempt, "path", None) or getattr(request_or_attempt, "path_info", "") or ""


def lockout_parameters(request_or_attempt, credentials=None):
    """`AXES_LOCKOUT_PARAMETERS`: qué combinación bloquea según la ruta.

    Solo el inicio de sesión de clientes es más laxo; toda otra ruta, conocida o
    no, lleva el bloqueo estricto. Los fallos de la API sí cuentan para la IP sola
    del admin: 5 fallos de clientes desde una IP bloquean el admin desde esa IP.
    """
    return API_LOCKOUT if _path(request_or_attempt) == API_LOGIN_PATH else STRICT_LOCKOUT


def login_allowed(request, credentials) -> bool:
    """Si django-axes deja intentar ahora; si no, marca la petición como bloqueada (429).

    Para los intentos que no pasan por `authenticate()` (una cuenta del personal en la
    API de clientes), con la misma revisión que hace `AxesStandaloneBackend`.
    """
    from axes.handlers.proxy import AxesProxyHandler

    if AxesProxyHandler.is_allowed(request, credentials):
        return True
    request.axes_locked_out = True
    return False


def record_failed_login(request, credentials) -> None:
    """Cuenta un intento como fallido, igual que una contraseña equivocada.

    Emite `user_login_failed`, la señal que escucha django-axes: suma el fallo y, si
    con él se llega al límite, marca `request.axes_locked_out`. `credentials` va sin
    contraseña.
    """
    from django.contrib.auth.signals import user_login_failed

    user_login_failed.send(sender=__name__, credentials=credentials, request=request)


def lockout_response(request, original_response=None, credentials=None):
    """`AXES_LOCKOUT_CALLABLE`: el 429 en JSON para la API y en texto para el admin.

    Las dos llevan `Retry-After` con el enfriamiento completo, como antes (D34).

    Ojo: django-axes 9 llama primero con tres argumentos y, si eso lanza `TypeError`,
    vuelve a llamar con dos (`request, credentials`) por compatibilidad. Un
    `TypeError` de adentro de esta función acabaría en esa segunda llamada, con las
    credenciales en el lugar de `original_response`: no debe lanzar ninguno.
    """
    from axes.helpers import get_lockout_message, set_retry_after_header
    from django.conf import settings
    from django.http import HttpResponse, JsonResponse

    message = get_lockout_message()
    if _path(request).startswith("/api/"):
        response = JsonResponse(
            {"detail": message, "code": "locked_out"}, status=settings.AXES_HTTP_RESPONSE_CODE
        )
    else:
        response = HttpResponse(message, status=settings.AXES_HTTP_RESPONSE_CODE)
    set_retry_after_header(request, response)
    return response
