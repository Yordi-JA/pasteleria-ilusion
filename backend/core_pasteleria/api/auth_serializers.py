"""Entrada y salida del acceso (D62): solo formato; las reglas viven en `auth_service`."""
import re

from rest_framework import serializers

from ..services.account_tokens import MAX_TOKEN_LENGTH
from ..services.text_rules import has_forbidden_name_characters

# Correo y contraseña razonables: un tope evita que Argon2 trabaje con textos enormes.
MAX_EMAIL_LENGTH = 254
MAX_PASSWORD_LENGTH = 128
# Un ID token de Google mide alrededor de 1 KB.
MAX_CREDENTIAL_LENGTH = 4096
# Separadores que la gente escribe en un teléfono ("55 1234 5678", "55-1234-5678").
PHONE_SEPARATORS = re.compile(r"[\s().-]")
PHONE_ERROR = "Escribe 10 dígitos, por ejemplo 55 1234 5678."


class StrictCharField(serializers.CharField):
    """`CharField` que rechaza números, listas y demás: DRF convertiría `123` en `"123"`."""

    default_error_messages = {"invalid": "Escribe un texto."}

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class LoginRequestSerializer(serializers.Serializer):
    email = StrictCharField(max_length=MAX_EMAIL_LENGTH, error_messages={"blank": "Escribe tu correo."})
    password = StrictCharField(
        max_length=MAX_PASSWORD_LENGTH, trim_whitespace=False, error_messages={"blank": "Escribe tu contraseña."}
    )


class RegisterRequestSerializer(serializers.Serializer):
    full_name = StrictCharField(
        max_length=150,
        error_messages={
            "blank": "Escribe tu nombre.",
            "required": "Escribe tu nombre.",
            "max_length": "Escribe tu nombre en 150 caracteres o menos.",
        },
    )
    email = serializers.EmailField(
        max_length=MAX_EMAIL_LENGTH,
        error_messages={
            "invalid": "Escribe un correo válido, por ejemplo nombre@correo.com.",
            "blank": "Escribe tu correo.",
            "required": "Escribe tu correo.",
        },
    )
    phone = StrictCharField(max_length=20, required=False, allow_blank=True, default="")
    password = StrictCharField(
        max_length=MAX_PASSWORD_LENGTH,
        trim_whitespace=False,
        error_messages={"blank": "Crea una contraseña.", "required": "Crea una contraseña."},
    )
    accepts_terms = serializers.BooleanField()

    def validate_full_name(self, value):
        if has_forbidden_name_characters(value):
            raise serializers.ValidationError("Escribe tu nombre solo con letras, espacios y signos comunes.")
        return value

    def validate_phone(self, value):
        digits = PHONE_SEPARATORS.sub("", value)
        if digits and not re.fullmatch(r"[0-9]{10}", digits):
            raise serializers.ValidationError(PHONE_ERROR)
        return digits

    def validate_accepts_terms(self, value):
        if value is not True:
            raise serializers.ValidationError("Acepta los términos y el aviso de privacidad para crear tu cuenta.")
        return value


class GoogleLoginRequestSerializer(serializers.Serializer):
    credential = StrictCharField(max_length=MAX_CREDENTIAL_LENGTH)


class SessionUserSerializer(serializers.Serializer):
    """Lo que el navegador sabe de la cuenta: sin id, permisos ni datos de Google."""

    email = serializers.EmailField()
    full_name = serializers.CharField()
    phone = serializers.SerializerMethodField()

    def get_phone(self, user) -> str | None:
        return user.phone or None


class SessionSerializer(serializers.Serializer):
    access = serializers.CharField()
    access_expires_in = serializers.IntegerField(help_text="Segundos de vida del access token.")
    user = SessionUserSerializer()


class GoogleSessionSerializer(SessionSerializer):
    password_removed = serializers.BooleanField(
        help_text="La cuenta ya tenía contraseña y dejó de servir al ligarla con Google."
    )


class AuthErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()


# --- Enlaces por correo (D76) ---

EMAIL_ERRORS = {
    "invalid": "Escribe un correo válido, por ejemplo nombre@correo.com.",
    "blank": "Escribe tu correo.",
    "required": "Escribe tu correo.",
}


class RegistrationSerializer(serializers.Serializer):
    """Lo que `/verificar` dice después de registrarse: a qué correo fue el enlace y en cuántas horas vence."""

    email = serializers.EmailField()
    expires_in_hours = serializers.IntegerField(help_text="Horas que vale el enlace para confirmar la cuenta.")


class EmailRequestSerializer(serializers.Serializer):
    """Pedir un enlace: reenviar la confirmación o recuperar la contraseña."""

    email = serializers.EmailField(max_length=MAX_EMAIL_LENGTH, error_messages=EMAIL_ERRORS)


class LinkSentSerializer(serializers.Serializer):
    """La misma respuesta exista o no la cuenta."""

    detail = serializers.CharField()
    expires_in_hours = serializers.IntegerField(help_text="Horas que vale el enlace, si llegó.")


class EmailVerifiedSerializer(serializers.Serializer):
    """Confirmar la cuenta no abre sesión: solo dice que quedó confirmada."""

    email_verified = serializers.BooleanField()


class LinkTokenField(StrictCharField):
    def __init__(self, **kwargs):
        super().__init__(
            max_length=MAX_TOKEN_LENGTH,
            error_messages={"blank": "Falta el enlace.", "required": "Falta el enlace.", "max_length": "El enlace no es válido."},
            **kwargs,
        )


class VerifyEmailRequestSerializer(serializers.Serializer):
    token = LinkTokenField()


class PasswordResetConfirmRequestSerializer(serializers.Serializer):
    token = LinkTokenField()
    new_password = StrictCharField(
        max_length=MAX_PASSWORD_LENGTH,
        trim_whitespace=False,
        error_messages={
            "blank": "Escribe la contraseña nueva.",
            "required": "Escribe la contraseña nueva.",
            "max_length": "Usa 128 caracteres o menos.",
        },
    )
