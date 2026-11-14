"""Caracteres que no van en un nombre de persona (registro y cuenta de Google, D62)."""
import unicodedata

# Control, formato (por ejemplo, el cambio de dirección U+202E), separadores de línea y
# de párrafo, sustitutos, uso privado y sin asignar.
FORBIDDEN_NAME_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp", "Cs", "Co", "Cn"})


def has_forbidden_name_characters(text: str) -> bool:
    return any(unicodedata.category(char) in FORBIDDEN_NAME_CATEGORIES for char in text)


def clean_name(text: str) -> str:
    """El nombre sin esos caracteres y con los espacios juntos (para un nombre que no se puede rechazar)."""
    kept = "".join(char for char in text if unicodedata.category(char) not in FORBIDDEN_NAME_CATEGORIES)
    return " ".join(kept.split())
