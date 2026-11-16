"""Entrada y salida de "Datos y avisos" (D72): solo formato; la regla de WhatsApp vive en `account_service`."""
import re
from collections.abc import Mapping

from rest_framework import serializers

from ..services.text_rules import has_forbidden_name_characters
from .auth_serializers import MAX_PASSWORD_LENGTH, PHONE_ERROR, PHONE_SEPARATORS, StrictCharField

FULL_NAME_MAX_LENGTH = 150
READ_ONLY_FIELD = "Este dato no se cambia desde aquí."


class AccountSerializer(serializers.Serializer):
    """Lo que ve el cliente de su cuenta: sin id, permisos ni el identificador de Google."""

    email = serializers.EmailField(help_text="El correo con el que entra. No se cambia.")
    full_name = serializers.CharField()
    phone = serializers.SerializerMethodField(help_text="10 dígitos, o `null` sin teléfono.")
    has_password = serializers.BooleanField(help_text="Tiene contraseña: solo entonces puede cambiarla.")
    google_linked = serializers.BooleanField(help_text="La cuenta está ligada a Google.")
    notify_whatsapp = serializers.BooleanField(
        help_text="Quiere avisos por WhatsApp. El sitio no los manda: la pastelería escribe a mano."
    )

    def get_phone(self, account) -> str | None:
        return account.phone or None


class AccountUpdateSerializer(serializers.Serializer):
    """`PATCH account/`: cualquiera de los tres campos. Otro campo (el correo, `is_staff`...) es un error, no se ignora."""

    full_name = StrictCharField(
        required=False,
        max_length=FULL_NAME_MAX_LENGTH,
        help_text="Las mismas reglas que el nombre del registro. Se guarda con los espacios juntos.",
        error_messages={
            "blank": "Escribe tu nombre.",
            "max_length": f"Escribe tu nombre en {FULL_NAME_MAX_LENGTH} caracteres o menos.",
        },
    )
    phone = StrictCharField(
        required=False,
        allow_blank=True,
        max_length=20,
        help_text="10 dígitos; vacío lo quita. Los espacios, guiones, puntos y paréntesis se quitan.",
        error_messages={"max_length": PHONE_ERROR},
    )
    notify_whatsapp = serializers.BooleanField(required=False, error_messages={"invalid": "Elige sí o no."})

    def validate_full_name(self, value):
        if has_forbidden_name_characters(value):
            raise serializers.ValidationError("Escribe tu nombre solo con letras, espacios y signos comunes.")
        return " ".join(value.split())

    def validate_phone(self, value):
        digits = PHONE_SEPARATORS.sub("", value)
        if digits and not re.fullmatch(r"[0-9]{10}", digits):
            raise serializers.ValidationError(PHONE_ERROR)
        return digits

    def to_internal_value(self, data):
        # Antes de validar los campos conocidos: un 400 por el teléfono también dice que el correo no se cambia.
        unknown = sorted(set(data) - set(self.fields)) if isinstance(data, Mapping) else []
        read_only = {field: [READ_ONLY_FIELD] for field in unknown}
        try:
            value = super().to_internal_value(data)
        except serializers.ValidationError as error:
            if read_only and isinstance(error.detail, dict):
                raise serializers.ValidationError({**error.detail, **read_only}) from error
            raise
        if read_only:
            raise serializers.ValidationError(read_only)
        return value


class PasswordChangeRequestSerializer(serializers.Serializer):
    current_password = StrictCharField(
        max_length=MAX_PASSWORD_LENGTH,
        trim_whitespace=False,
        error_messages={
            "blank": "Escribe tu contraseña actual.",
            "required": "Escribe tu contraseña actual.",
            "max_length": f"Usa {MAX_PASSWORD_LENGTH} caracteres o menos.",
        },
    )
    new_password = StrictCharField(
        max_length=MAX_PASSWORD_LENGTH,
        trim_whitespace=False,
        error_messages={
            "blank": "Escribe la contraseña nueva.",
            "required": "Escribe la contraseña nueva.",
            "max_length": f"Usa {MAX_PASSWORD_LENGTH} caracteres o menos.",
        },
    )
