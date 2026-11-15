"""Caracteres que no van en un texto de persona: el nombre del registro, el de la cuenta de Google y el de quien recoge
(D62, D66), y el mensaje sobre el pastel (`design_layout`)."""
import unicodedata

# Control, formato (por ejemplo, el cambio de dirección U+202E), separadores de línea y
# de párrafo, sustitutos, uso privado y sin asignar.
FORBIDDEN_NAME_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp", "Cs", "Co", "Cn"})
# Marcas combinantes (Mn y Me) seguidas: un acento o dos caben; más apilan el texto sobre las líneas de arriba y de abajo.
COMBINING_CATEGORIES = frozenset({"Mn", "Me"})
MAX_COMBINING_RUN = 2


def has_excess_combining_marks(text: str) -> bool:
    """Si el texto lleva más de `MAX_COMBINING_RUN` marcas combinantes seguidas."""
    run = 0
    for char in text:
        run = run + 1 if unicodedata.category(char) in COMBINING_CATEGORIES else 0
        if run > MAX_COMBINING_RUN:
            return True
    return False


def has_forbidden_name_characters(text: str) -> bool:
    return any(unicodedata.category(char) in FORBIDDEN_NAME_CATEGORIES for char in text) or has_excess_combining_marks(text)


def clean_name(text: str) -> str:
    """El nombre sin esos caracteres, con a lo más `MAX_COMBINING_RUN` marcas combinantes seguidas y con los espacios
    juntos (para un nombre que no se puede rechazar, como el de Google)."""
    kept, run = [], 0
    for char in text:
        category = unicodedata.category(char)
        if category in FORBIDDEN_NAME_CATEGORIES:
            continue
        run = run + 1 if category in COMBINING_CATEGORIES else 0
        if run <= MAX_COMBINING_RUN:
            kept.append(char)
    return " ".join("".join(kept).split())
