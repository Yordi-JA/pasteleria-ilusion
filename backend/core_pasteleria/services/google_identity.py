"""Adapter de Google Identity Services: verifica el ID token y lo traduce a `GoogleIdentity`.

Es el único módulo que importa `google-auth` (D62). `verify_oauth2_token` revisa la
firma con las llaves públicas de Google, la audiencia (nuestro client ID), el emisor
(`accounts.google.com`) y la expiración. Aquí se exige además `email_verified`, y se
anota si Google es la autoridad del correo (Gmail o una cuenta de Workspace con `hd`):
solo entonces el sitio liga ese correo con una cuenta que ya existía.
"""
from dataclasses import dataclass

import google.auth.transport.requests
import requests
from google.auth import exceptions as google_exceptions
from google.oauth2 import id_token

from .text_rules import clean_name

# Un Google lento no debe ocupar un worker de gunicorn: el valor por omisión son 120 s.
GOOGLE_TIMEOUT_SECONDS = 5
# Tolerancia del reloj al revisar `iat` y `exp`.
CLOCK_SKEW_SECONDS = 10
# Dominios donde Google es la autoridad del correo aunque no traiga `hd`.
GOOGLE_MAIL_DOMAINS = ("gmail.com", "googlemail.com")


class GoogleSignInError(Exception):
    """El acceso con Google no se pudo completar. `status`, `code` y `message` los usa la API."""

    status = 400
    code = "google_invalid"
    message = "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo."


class GoogleSignInDisabled(GoogleSignInError):
    status = 503
    code = "google_disabled"
    message = "El acceso con Google no está disponible. Entra con tu correo."


class GoogleTokenInvalid(GoogleSignInError):
    pass


class GoogleEmailUnverified(GoogleSignInError):
    code = "google_email_unverified"
    message = "Tu correo de Google no está verificado. Verifícalo en Google o entra con tu correo."


class GoogleUnavailable(GoogleSignInError):
    status = 503
    code = "google_unavailable"
    message = "No pudimos conectar con Google. Inténtalo de nuevo en un momento."


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str
    # Google responde por el correo: Gmail, o Workspace (claim `hd`).
    authoritative: bool


class _TimeoutRequest(google.auth.transport.requests.Request):
    """Transporte de google-auth con tiempo límite y la sesión HTTP reutilizada."""

    def __init__(self, timeout: float):
        super().__init__(session=requests.Session())
        self.timeout = timeout

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
        return super().__call__(url, method=method, body=body, headers=headers, timeout=timeout or self.timeout, **kwargs)


_REQUEST = _TimeoutRequest(GOOGLE_TIMEOUT_SECONDS)


def verify_with_google(credential: str, client_id: str) -> dict:
    """Las claims del ID token ya verificado. Lanza `ValueError` si no vale."""
    return id_token.verify_oauth2_token(
        credential, _REQUEST, audience=client_id, clock_skew_in_seconds=CLOCK_SKEW_SECONDS
    )


def _is_authoritative(email: str, claims: dict) -> bool:
    """Gmail, o una cuenta de Workspace (`hd`) cuyo correo es de ese dominio o de un subdominio.

    `hd` solo dice a qué organización de Workspace pertenece la cuenta. Un correo de otro
    dominio en esa cuenta (un alias que la organización agregó) no lo verificó el dueño de
    ese otro dominio, así que no basta para ligar una cuenta existente.
    """
    domain = email.rsplit("@", 1)[-1]
    if domain in GOOGLE_MAIL_DOMAINS:
        return True
    hosted = claims.get("hd")
    if not isinstance(hosted, str) or not hosted:
        return False
    hosted = hosted.strip().lower()
    return domain == hosted or domain.endswith(f".{hosted}")


def verify_credential(credential: str, *, client_id: str) -> GoogleIdentity:
    """Verifica el `credential` de Google Identity Services y devuelve quién es."""
    if not client_id:
        raise GoogleSignInDisabled
    try:
        claims = verify_with_google(credential, client_id)
    except google_exceptions.TransportError as error:
        raise GoogleUnavailable from error
    except (ValueError, google_exceptions.GoogleAuthError) as error:
        raise GoogleTokenInvalid from error

    sub, email = claims.get("sub"), claims.get("email")
    if not isinstance(sub, str) or not sub or not isinstance(email, str) or "@" not in email:
        raise GoogleTokenInvalid
    # Solo el booleano `true`: nunca el texto "true" ni un valor que falte.
    if claims.get("email_verified") is not True:
        raise GoogleEmailUnverified
    email = email.strip().lower()
    name = claims.get("name")
    return GoogleIdentity(
        sub=sub,
        email=email,
        name=clean_name(name)[:150] if isinstance(name, str) else "",
        authoritative=_is_authoritative(email, claims),
    )
