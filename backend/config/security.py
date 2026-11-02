"""Identidad del cliente para el bloqueo de inicio de sesión (django-axes)."""
from ipaddress import ip_address

from django.contrib.auth import get_user_model
from rest_framework.throttling import BaseThrottle


def client_ip(request):
    """IP del cliente con la misma regla que el throttling de DRF.

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
        return request.META.get("REMOTE_ADDR")
    return ident


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
