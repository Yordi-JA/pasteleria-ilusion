"""Oblea y mensaje del paso 7 de "Diseña tu pastel": su acomodo sobre la tapa del último piso.

El acomodo no cambia el precio (la oblea cuesta lo mismo en cualquier forma y el mensaje no cuesta), pero se guarda
con el pedido y se imprime; por eso las cotas se revisan aquí, con lo que fija la pastelería en la base de datos.
Las posiciones (`x`, `y`) van relativas al radio de la parte plana de la tapa del último piso, que es el del piso sin
su canto redondeado (unos 0.88 cm): 1 es el borde de esa parte plana, no el del piso. En un piso rectangular, el radio
es la mitad del ancho. El eje `y` va hacia arriba en la vista superior. Las medidas de la oblea van en centímetros.

Límite carta (decisión D55): la hoja carta no tiene orientación, así que una forma cabe si cabe en la hoja puesta
a lo largo o a lo ancho: el lado más largo no pasa del alto carta y el más corto, del ancho carta. Un círculo cabe
si su diámetro no pasa del lado corto. Que la forma no se salga de la tapa lo revisa la vista previa (que conoce el
molde y su giro); aquí solo se acotan los números.
"""
import re
import unicodedata
from dataclasses import dataclass, replace

from ..models import MessageArrangement, MessageColorMode, WaferShape
from ..repositories.records import CakeDesignSettingsRecord
from .errors import DomainValidationError
from .text_rules import has_excess_combining_marks

# Cotas técnicas del acomodo, contra números absurdos; no son reglas de negocio.
MIN_WAFER_CM = 2.0
MAX_RELATIVE_POSITION = 10.0
MAX_ROTATION_DEG = 180.0
MIN_IMAGE_ZOOM = 1.0
MAX_IMAGE_ZOOM = 4.0
MAX_MESSAGE_LENGTH = 80
MIN_MESSAGE_SCALE = 0.05
MAX_MESSAGE_SCALE = 1.5
MIN_ARC_CURVE = 0.05
# Renglones del mensaje (tanda 4): hasta 3, separados solo por `\n`. Es una cota del acomodo, como los 80 caracteres: el
# bloque se apila sobre la tapa. `LINE_BOX_EM` es el alto de un renglón y `LINE_HEIGHT_EM` la distancia entre las líneas
# base de dos renglones, en em (1 em es el alto de la letra); son los mismos `LINE_BOX` y `LINE_HEIGHT` de
# `frontend/src/viewmodels/messageGeometry.ts`, y una prueba lo revisa.
MAX_MESSAGE_LINES = 3
LINE_BREAK = "\n"
LINE_BOX_EM = 1.05
LINE_HEIGHT_EM = 1.15
TOO_MANY_LINES_MESSAGE = f"El mensaje lleva hasta {MAX_MESSAGE_LINES} renglones."
EMPTY_LINE_MESSAGE = "El mensaje no lleva renglones vacíos."
BLOCK_TOO_BIG_MESSAGE = "Tu mensaje no cabe en el pastel: haz la letra más chica."
# Un color libre es siempre `#RRGGBB`: seis dígitos hexadecimales ASCII, sin forma corta, sin alfa y sin nombres CSS.
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}")
# Colores de la tapa en "Colores que combinan": uno más oscuro y uno más claro del de la cobertura.
TONE_VALUES = ("deep", "light")

# Categorías Unicode que no se imprimen o que cambian cómo se ve el texto: control (Cc), formato (Cf: ZWJ, U+202E, U+00AD,
# etiquetas), sustitutos (Cs), uso privado (Co), sin asignar (Cn) y separadores de línea y de párrafo (Zl, Zp).
UNSAFE_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})
# Caracteres que se ven como un espacio en blanco o que no pintan nada: los rellenos de hangul (U+3164, U+115F, U+1160, U+FFA0),
# el patrón braille vacío (U+2800), la junta de grafemas (U+034F), las vocales inherentes del jemer (U+17B4 y U+17B5) y los
# selectores de variación mongoles (U+180B a U+180F).
BLANK_FILLERS = frozenset({"\u3164", "\u115f", "\u1160", "\uffa0", "\u2800", "\u034f", "\u17b4", "\u17b5", "\u180b", "\u180c", "\u180d", "\u180e", "\u180f"})


@dataclass(frozen=True)
class WaferLayout:
    shape: str
    # En un círculo, los dos son el diámetro.
    width_cm: float
    height_cm: float
    rotation_deg: float
    x: float
    y: float
    # Encuadre de la imagen: 1 la cubre justo; más acerca. `image_x` e `image_y` la mueven de -1 a 1.
    image_zoom: float
    image_x: float
    image_y: float


@dataclass(frozen=True)
class MessageLayout:
    text: str
    color_mode: str
    # `auto`: nada. `tones`: `deep` o `light`. `custom`: un color `#RRGGBB`, en minúsculas.
    color: str | None
    arrangement: str
    # Con `arc`, de -1 a 1: positivo, el texto sube en el centro (como un arco); negativo, baja. Ignorada con `straight`.
    curve: float
    # Tamaño de la letra respecto al radio de la parte plana de la tapa.
    scale: float
    rotation_deg: float
    x: float
    y: float


def has_unsafe_characters(text: str) -> bool:
    """Si el texto lleva algo que no se imprime bien: por categoría Unicode, no por una lista de rangos.

    Rechaza las categorías de `UNSAFE_CATEGORIES`, los rellenos que se ven en blanco y más de `text_rules.MAX_COMBINING_RUN`
    marcas combinantes seguidas. El frontend (`cleanMessageText`) aplica el mismo criterio. El salto de renglón (`\\n`) es
    lo único de control que pasa; `\\r` llega ya cambiado por `normalize_message_text`, y los demás separadores (U+2028,
    U+2029, U+0085, U+000B, U+000C, U+001C a U+001E) siguen fuera.
    """
    unsafe = (char for char in text if char != LINE_BREAK)
    if any(unicodedata.category(char) in UNSAFE_CATEGORIES or char in BLANK_FILLERS for char in unsafe):
        return True
    return has_excess_combining_marks(text)


def check_wafer_layout(layout: WaferLayout, wafer: bool, limits: CakeDesignSettingsRecord) -> None:
    """Rechaza un acomodo de oblea sin oblea, o con una forma que pasa de la hoja carta."""
    if not wafer:
        raise DomainValidationError({"wafer_layout": ["Elige la oblea para acomodarla."]})
    short = float(min(limits.wafer_max_width_cm, limits.wafer_max_height_cm))
    long = float(max(limits.wafer_max_width_cm, limits.wafer_max_height_cm))
    sides = (layout.width_cm, layout.height_cm)
    if layout.shape == WaferShape.CIRCLE and layout.width_cm != layout.height_cm:
        raise DomainValidationError({"wafer_layout": ["El círculo lleva un solo diámetro."]})
    if min(sides) < MIN_WAFER_CM:
        raise DomainValidationError({"wafer_layout": [f"La oblea mide al menos {MIN_WAFER_CM:g} cm por lado."]})
    # Un círculo cabe por su diámetro; una hoja, a lo largo o a lo ancho de la carta.
    too_big = max(sides) > short if layout.shape == WaferShape.CIRCLE else max(sides) > long or min(sides) > short
    if too_big:
        raise DomainValidationError(
            {"wafer_layout": [f"La oblea no puede pasar de la hoja carta ({short:g} × {long:g} cm)."]}
        )


# Holgura de la letra mínima: el editor redondea la escala, así que una centésima de milímetro no es un rechazo.
LETTER_TOLERANCE_CM = 0.001


def check_message_letter(layout: MessageLayout, lid_radius_cm: float, min_letter_cm) -> None:
    """La letra del mensaje no baja del mínimo de la pastelería (`CakeDesignSettings.message_min_letter_cm`).

    El alto de la letra es `scale` por el radio de la parte plana de la tapa, como en la vista previa
    (`messageGeometry.ts`). Si ni con la escala más grande del editor se alcanza el mínimo, en esa tapa no cabe ningún
    mensaje. El ancho del texto depende de la tipografía, que el servidor no mide: que quepa a lo ancho lo revisa el
    editor, y por eso el mensaje dice qué hacer si con el mínimo ya no cabe.
    """
    minimum = float(min_letter_cm)
    if minimum / lid_radius_cm > MAX_MESSAGE_SCALE + 1e-9:
        raise DomainValidationError(
            {"message_layout": [f"En este pastel no cabe un mensaje con letra de al menos {minimum:g} cm."]}
        )
    if layout.scale * lid_radius_cm + LETTER_TOLERANCE_CM < minimum:
        raise DomainValidationError(
            {
                "message_layout": [
                    f"La letra del mensaje mide al menos {minimum:g} cm de alto: hazla más grande. "
                    "Si así no cabe en el pastel, acorta el mensaje."
                ]
            }
        )


def normalize_hex_color(value: object) -> str | None:
    """El color `#RRGGBB` en minúsculas, o `None` si no es exactamente eso (`fullmatch`: ni un salto de línea de más)."""
    if isinstance(value, str) and HEX_COLOR.fullmatch(value):
        return value.lower()
    return None


def check_message_layout(layout: MessageLayout) -> MessageLayout:
    """Rechaza un mensaje con renglones de más o vacíos, o con un color que no corresponde a su modo; si no, lo devuelve
    con el color en minúsculas. El serializador ya revisa los renglones; esto cubre a quien arme el acomodo sin él."""
    problem = message_text_problem(layout.text)
    if problem:
        raise DomainValidationError({"message_layout": [problem]})
    if layout.color_mode == MessageColorMode.AUTO and layout.color is not None:
        raise DomainValidationError({"message_layout": ["El color automático no lleva un color elegido."]})
    if layout.color_mode == MessageColorMode.TONES and layout.color not in TONE_VALUES:
        raise DomainValidationError({"message_layout": ["Elige el tono más oscuro o el más claro de la cobertura."]})
    custom = normalize_hex_color(layout.color) if layout.color_mode == MessageColorMode.CUSTOM else None
    if layout.color_mode == MessageColorMode.CUSTOM and custom is None:
        raise DomainValidationError({"message_layout": ["Escribe el color como #RRGGBB, por ejemplo #F0CE8A."]})
    if layout.arrangement == MessageArrangement.ARC and abs(layout.curve) < MIN_ARC_CURVE:
        raise DomainValidationError({"message_layout": ["Un mensaje en arco necesita algo de curva."]})
    return replace(layout, color=custom) if custom is not None else layout


def _trim_spaces(line: str) -> str:
    """El renglón sin los espacios (categoría Zs) de sus orillas; un tabulador u otro control se queda y se rechaza."""
    start, end = 0, len(line)
    while start < end and unicodedata.category(line[start]) == "Zs":
        start += 1
    while end > start and unicodedata.category(line[end - 1]) == "Zs":
        end -= 1
    return line[start:end]


def normalize_message_text(text: str) -> str:
    """El texto con `\\r\\n` y `\\r` cambiados por `\\n`, sin los espacios junto a cada salto y sin saltos al principio
    ni al final: como DRF ya recortaba los espacios de las orillas, ahora también los de cada renglón. Un renglón vacío
    en medio no se quita: `message_text_problem` lo rechaza."""
    unified = text.replace("\r\n", LINE_BREAK).replace("\r", LINE_BREAK)
    return LINE_BREAK.join(_trim_spaces(line) for line in unified.split(LINE_BREAK)).strip(LINE_BREAK)


def message_lines(text: str) -> list[str]:
    """Los renglones del mensaje ya normalizado: solo `\\n` los separa."""
    return text.split(LINE_BREAK)


def message_text_problem(text: str) -> str | None:
    """Por qué los renglones del mensaje no sirven (más de `MAX_MESSAGE_LINES` o uno vacío), o `None`."""
    lines = message_lines(text)
    if len(lines) > MAX_MESSAGE_LINES:
        return TOO_MANY_LINES_MESSAGE
    if any(not _trim_spaces(line) for line in lines):
        return EMPTY_LINE_MESSAGE
    return None


def _block_em(layout: MessageLayout) -> float:
    return LINE_BOX_EM + (len(message_lines(layout.text)) - 1) * LINE_HEIGHT_EM


def message_block_cm(layout: MessageLayout, lid_radius_cm: float) -> float:
    """El alto del bloque de renglones con su letra, en cm: un renglón entero más una distancia entre líneas por cada
    renglón de más. Recto o en arco mide lo mismo: los arcos son paralelos y comparten su centro."""
    return layout.scale * lid_radius_cm * _block_em(layout)


# Holgura del bloque: una décima de milímetro absorbe el redondeo del editor, como `cake_lid.TOLERANCE_CM`.
BLOCK_TOLERANCE_CM = 0.01


def check_message_block(layout: MessageLayout, lid_radius_cm: float, room_cm: float, min_letter_cm=None) -> None:
    """El bloque de renglones cabe en la tapa: su alto no pasa de `room_cm`, lo más largo que cabe en la tapa en la
    dirección de los renglones (`cake_lid.message_room_cm`).

    El servidor no mide el ancho de las letras, pero el alto del bloque no depende de la tipografía: es el mínimo que
    el contorno del editor (`messageGeometry.ts`) tiene que dejar dentro de la tapa, recto o en arco. Si ni con la letra
    mínima cabe, el mensaje pide acortarlo (menos renglones), con la misma frase del editor.
    """
    if message_block_cm(layout, lid_radius_cm) <= room_cm + BLOCK_TOLERANCE_CM:
        return
    if min_letter_cm is not None and float(min_letter_cm) * _block_em(layout) > room_cm + BLOCK_TOLERANCE_CM:
        minimum = float(min_letter_cm)
        raise DomainValidationError(
            {"message_layout": [f"Acorta tu mensaje: con letra de al menos {minimum:g} cm no cabe en el pastel."]}
        )
    raise DomainValidationError({"message_layout": [BLOCK_TOO_BIG_MESSAGE]})
