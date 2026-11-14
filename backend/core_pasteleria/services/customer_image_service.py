"""Imágenes de clientes: la oblea y "Otra decoración" (y, después, el envío de referencia).

Se guardan en PostgreSQL (`CustomerImage`), no en el disco, que Heroku borra en cada reinicio. Lo que llega del navegador
no se guarda tal cual (auditorías de D53 y D55):
- se abre con Pillow (no por la extensión ni por el `Content-Type`) y solo se aceptan JPEG, PNG y WebP completos;
- pasa de `UploadSettings.max_image_megapixels` (12 propuestos, D63) o de 12 000 px por lado: se rechaza. Este módulo
  fija `Image.MAX_IMAGE_PIXELS` para todo el proceso en el tope duro (`UPLOAD_HARD_LIMIT_MEGAPIXELS`, 40), y
  `DecompressionBombWarning` es un error;
- un JPEG se decodifica con `draft` y la imagen se gira en su lugar y se convierte solo si cambia el modo, para no
  tener varias copias en memoria;
- se vuelve a codificar en su formato (un MPO de varias fotos, como JPEG), derecha (se aplica la orientación de EXIF;
  un EXIF dañado es un 400) y sin metadatos (EXIF, XMP, ICC ni textos de PNG): solo la primera imagen de una
  animación. Si al volver a codificarla pasa del tamaño máximo, se rechaza;
- un cliente tiene como mucho `UploadSettings.max_pending_images` imágenes que aún no están en un pedido (10
  propuestos);
- el id es un `uuid4` y el nombre original se guarda limpio, solo para mostrarlo.
La imagen se entrega solo a su dueño y al superusuario.
El tamaño máximo es el de `UploadSettings.max_upload_mb` (admin, D31), nunca más que `UPLOAD_HARD_LIMIT_MB`; la API lo
revisa antes de leer el cuerpo.
"""
import io
import struct
import unicodedata
import warnings
from uuid import UUID

from django.conf import settings as django_settings
from PIL import Image, ImageOps, UnidentifiedImageError

from ..repositories import customer_image_repo, settings_repo
from ..repositories.records import CustomerImageRecord, NewCustomerImage, StoredImageRecord
from .errors import DomainValidationError

HARD_MAX_IMAGE_PIXELS = django_settings.UPLOAD_HARD_LIMIT_MEGAPIXELS * 1_000_000
MAX_SIDE_PX = 12_000
# Tope de Pillow para todo el proceso (no solo para estas imágenes): más píxeles que esto avisa y más del doble falla
# al abrir. El tope de cada subida, más bajo, es el del admin (`max_image_pixels`).
Image.MAX_IMAGE_PIXELS = HARD_MAX_IMAGE_PIXELS

MEGABYTE = 1024 * 1024
MAX_NAME_LENGTH = 120
# Formato de Pillow -> (tipo que se guarda, opciones al volver a codificar).
FORMATS = {
    "JPEG": ("image/jpeg", {"quality": 90}),
    "PNG": ("image/png", {}),
    "WEBP": ("image/webp", {"quality": 90}),
}
# Pillow abre con el lector de JPEG las fotos MPO (varias imágenes, de algunas cámaras): se guardan como JPEG.
FORMAT_ALIASES = {"MPO": "JPEG"}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

INVALID_MESSAGE = "No pudimos abrir esa imagen. Usa una foto JPG, PNG o WebP."


def too_many_pixels_message(megapixels: int) -> str:
    unit = "megapíxel" if megapixels == 1 else "megapíxeles"
    return f"La imagen es demasiado grande: usa una de hasta {megapixels} {unit} y 12 000 px por lado."


def max_image_pixels(settings=settings_repo) -> int:
    """Los píxeles de una subida: los del admin, sin pasar del tope duro."""
    megapixels = min(settings.get_upload_settings().max_image_megapixels, django_settings.UPLOAD_HARD_LIMIT_MEGAPIXELS)
    return megapixels * 1_000_000


def too_many_pending_message(limit: int) -> str:
    return f"Ya tienes {limit} imágenes que no están en un pedido. Haz tu pedido con ellas antes de subir otra."
# Caracteres que no se muestran o cambian cómo se ve el nombre: control, formato (salvo U+200D, que une emojis),
# sustitutos, uso privado, sin asignar y separadores de línea. El mismo criterio que `displayFileName` del frontend.
_UNSAFE_NAME_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})
_ZERO_WIDTH_JOINER = "‍"


class InvalidImageError(DomainValidationError):
    """La imagen no se pudo abrir o pasa de los topes: 400 en el campo `image`."""


class ImageTooLargeError(DomainValidationError):
    """El archivo pasa del tamaño máximo: la API responde 413."""


def max_upload_bytes(settings=settings_repo) -> int:
    """El tamaño máximo de una imagen en bytes: el del admin, sin pasar del tope duro del sitio."""
    limit_mb = min(settings.get_upload_settings().max_upload_mb, django_settings.UPLOAD_HARD_LIMIT_MB)
    return limit_mb * MEGABYTE


def too_large_message(settings=settings_repo) -> str:
    return f"La imagen pasa de {max_upload_bytes(settings) // MEGABYTE} MB. Usa una más ligera."


def clean_file_name(name: str) -> str:
    """El nombre del archivo sin carpetas ni caracteres que no se muestran, de hasta 120 caracteres."""
    base = name.replace("\\", "/").rsplit("/", 1)[-1][:MAX_NAME_LENGTH]
    cleaned = "".join(
        char for char in base if char == _ZERO_WIDTH_JOINER or unicodedata.category(char) not in _UNSAFE_NAME_CATEGORIES
    ).strip()
    return "" if not cleaned.replace(_ZERO_WIDTH_JOINER, "") else cleaned


def _invalid(message: str = INVALID_MESSAGE) -> InvalidImageError:
    return InvalidImageError({"image": [message]})


def _reencode(image: Image.Image, fmt: str) -> tuple[bytes, str, int, int]:
    """La imagen derecha y sin metadatos, en su formato. Devuelve el contenido, el tipo y el tamaño en píxeles."""
    content_type, options = FORMATS[fmt]
    ImageOps.exif_transpose(image, in_place=True)
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)
    mode = "RGBA" if has_alpha and fmt != "JPEG" else "RGB"
    clean = image if image.mode == mode else image.convert(mode)
    # Sin `info`, ningún formato copia EXIF, XMP, ICC ni textos al guardar.
    clean.info = {}
    buffer = io.BytesIO()
    clean.save(buffer, format=fmt, **options)
    return buffer.getvalue(), content_type, clean.width, clean.height


def _decode(data: bytes, max_pixels: int) -> tuple[bytes, str, int, int]:
    too_big = _invalid(too_many_pixels_message(max_pixels // 1_000_000))
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(io.BytesIO(data), formats=list(FORMATS)) as image:
                fmt = FORMAT_ALIASES.get(image.format, image.format)
                if fmt not in FORMATS:
                    raise _invalid()
                width, height = image.size
                if width * height > max_pixels or max(width, height) > MAX_SIDE_PX:
                    raise too_big
                if fmt == "JPEG":
                    # Decodifica directo en RGB, sin una copia aparte en otro modo.
                    image.draft("RGB", image.size)
                image.load()
                return _reencode(image, fmt)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
            raise too_big from error
        # Una imagen dañada o con un EXIF roto (Pillow lanza `struct.error`, `TypeError` o `KeyError`) no se abre.
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, struct.error, TypeError, KeyError) as error:
            raise _invalid() from error


def store_image(
    owner_id: int,
    data: bytes,
    original_name: str,
    purpose: str,
    settings=settings_repo,
    images=customer_image_repo,
) -> CustomerImageRecord:
    """Valida, vuelve a codificar y guarda la imagen de un cliente."""
    limit = max_upload_bytes(settings)
    if len(data) > limit:
        raise ImageTooLargeError({"image": [too_large_message(settings)]})
    pending_limit = settings.get_upload_settings().max_pending_images
    if images.count_pending_images(owner_id) >= pending_limit:
        raise InvalidImageError({"image": [too_many_pending_message(pending_limit)]})
    content, content_type, width, height = _decode(data, max_image_pixels(settings))
    if len(content) > limit:
        raise InvalidImageError({"image": [too_large_message(settings)]})
    return images.create_image(
        NewCustomerImage(
            owner_id=owner_id,
            purpose=purpose,
            content=content,
            content_type=content_type,
            width=width,
            height=height,
            original_name=clean_file_name(original_name),
        )
    )


def get_image(image_id: UUID, viewer_id: int, viewer_is_superuser: bool, images=customer_image_repo) -> StoredImageRecord | None:
    """La imagen para su dueño o para el superusuario (desde el admin); para cualquier otro, `None`.

    Sin vistas nuevas para el personal (decisión del usuario del 14 de noviembre, D63): el personal que no es
    superusuario no la ve por aquí.
    """
    return images.get_image_for_viewer(image_id, viewer_id, viewer_is_superuser)


def file_name(image: StoredImageRecord) -> str:
    """El nombre con que se entrega: el id, nunca el nombre que mandó el cliente."""
    return f"{image.id}.{EXTENSIONS[image.content_type]}"
