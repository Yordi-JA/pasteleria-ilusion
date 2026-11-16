"""Los tokens de los enlaces de la cuenta (D76): confirmar el correo y recuperar la contraseña.

Son los de `PasswordResetTokenGenerator` de Django: un HMAC con la llave del sitio sobre el estado de la cuenta y la
hora de emisión. No se guardan en la base. Un token deja de servir cuando cambia el estado que firma (por eso es de un
solo uso) o cuando pasa su plazo, que cada generador lee de su propio ajuste. Cada uno firma con su propia sal: un
token de un tipo no sirve en lugar del otro.

El token que viaja en el enlace es `<id de la cuenta en base 36>.<token de Django>`; el punto no aparece en ninguna de
las dos partes. Va en el fragmento de la URL (`/verificar#...`), que el navegador no manda al servidor ni en el Referer.
"""
from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.crypto import constant_time_compare
from django.utils.http import base36_to_int, int_to_base36

SEPARATOR = "."
# Un id en base 36, el token de Django (6 + 1 + 32 caracteres) y holgura: lo que pase de esto no es un token.
MAX_TOKEN_LENGTH = 128
# El id más grande de `BigAutoField`: uno mayor no es una cuenta (y PostgreSQL rechazaría la consulta).
MAX_USER_ID = 2**63 - 1


class AccountLinkTokens(PasswordResetTokenGenerator):
    """`PasswordResetTokenGenerator` con plazo propio (`timeout_setting`, en segundos) y el id de la cuenta adentro."""

    timeout_setting = ""

    @property
    def timeout(self) -> int:
        return int(getattr(settings, self.timeout_setting))

    @property
    def hours(self) -> int:
        """El plazo en horas enteras, para los textos ("Vence en 24 horas")."""
        return max(1, self.timeout // 3600)

    def make(self, user) -> str:
        return f"{int_to_base36(user.pk)}{SEPARATOR}{self.make_token(user)}"

    @staticmethod
    def user_id(token: str) -> int | None:
        """El id de la cuenta que dice el token, sin verificar nada; `None` si no tiene la forma."""
        if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH or token.count(SEPARATOR) != 1:
            return None
        encoded_id = token.split(SEPARATOR)[0]
        try:
            user_id = base36_to_int(encoded_id) if encoded_id else None
        except ValueError:
            return None
        return user_id if user_id is not None and 0 < user_id <= MAX_USER_ID else None

    def check(self, user, token: str) -> bool:
        """El token es de esta cuenta, la firma coincide con su estado de ahora y no pasó su plazo."""
        if user is None or self.user_id(token) != user.pk:
            return False
        return self.check_token(user, token.split(SEPARATOR)[1])

    def check_token(self, user, token) -> bool:
        """El de Django, con `self.timeout` en lugar de `settings.PASSWORD_RESET_TIMEOUT`."""
        if not (user and token):
            return False
        try:
            ts_b36, _ = token.split("-")
            ts = base36_to_int(ts_b36)
        except ValueError:
            return False
        for secret in [self.secret, *self.secret_fallbacks]:
            if constant_time_compare(self._make_token_with_timestamp(user, ts, secret), token):
                break
        else:
            return False
        return 0 <= self._num_seconds(self._now()) - ts <= self.timeout


class EmailVerificationTokens(AccountLinkTokens):
    """Confirmar el correo: firma `email_verified_at`, así el enlace deja de servir en cuanto confirma."""

    key_salt = "core_pasteleria.services.account_tokens.EmailVerificationTokens"
    timeout_setting = "EMAIL_VERIFICATION_TIMEOUT"

    def _make_hash_value(self, user, timestamp):
        verified_at = "" if user.email_verified_at is None else user.email_verified_at.replace(microsecond=0, tzinfo=None)
        return f"{user.pk}{user.email}{verified_at}{user.is_active}{timestamp}"


class PasswordResetTokens(AccountLinkTokens):
    """Recuperar la contraseña: firma el hash de la contraseña (y el último acceso y el correo, como Django).

    Al guardar la contraseña nueva el hash cambia y el enlace deja de servir.
    """

    key_salt = "core_pasteleria.services.account_tokens.PasswordResetTokens"
    timeout_setting = "PASSWORD_RESET_TIMEOUT"


email_verification_tokens = EmailVerificationTokens()
password_reset_tokens = PasswordResetTokens()
