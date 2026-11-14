"""Imágenes de clientes (oblea y "Otra decoración"): se validan con Pillow y se guardan sin metadatos en PostgreSQL.

Requisitos de la auditoría de D53 (punto 10) y de D55 (punto 6): abrir con Pillow, tope de píxeles con
`DecompressionBombWarning` como error, volver a codificar sin EXIF, id `uuid4` y nombre original limpio.
"""
import io
import struct
import uuid

import pytest
from PIL import Image

from core_pasteleria.models import CustomerImage, UploadSettings
from core_pasteleria.services import customer_image_service as service
from core_pasteleria.services.errors import DomainValidationError

pytestmark = pytest.mark.django_db


def image_bytes(fmt="JPEG", size=(20, 10), mode="RGB", **save):
    buffer = io.BytesIO()
    # Con transparencia de verdad: WebP descarta un canal alfa que es opaco en toda la imagen.
    color = (255, 0, 0, 128) if mode == "RGBA" else "white"
    Image.new(mode, size, color).save(buffer, format=fmt, **save)
    return buffer.getvalue()


def jpeg_with_exif():
    exif = Image.Exif()
    exif[0x010F] = "Cámara del cliente"  # Make
    exif[0x0112] = 6  # Orientation: girar 90°
    return image_bytes(exif=exif.tobytes())


def store(customer_user, data, name="foto.jpg", purpose="wafer"):
    return service.store_image(customer_user.pk, data, name, purpose)


def test_a_jpeg_is_reencoded_without_exif_and_upright(customer_user):
    record = store(customer_user, jpeg_with_exif())
    assert isinstance(record.id, uuid.UUID) and record.id.version == 4
    saved = CustomerImage.objects.get(pk=record.id)
    reopened = Image.open(io.BytesIO(bytes(saved.content)))
    assert reopened.format == "JPEG"
    assert dict(reopened.getexif()) == {}
    # La orientación de EXIF se aplicó antes de quitarla: la foto queda derecha.
    assert reopened.size == (10, 20) == (record.width, record.height)
    assert (saved.content_type, saved.size_bytes) == ("image/jpeg", len(bytes(saved.content)))


@pytest.mark.parametrize("fmt, content_type", [("PNG", "image/png"), ("WEBP", "image/webp")])
def test_png_and_webp_keep_their_format(customer_user, fmt, content_type):
    record = store(customer_user, image_bytes(fmt, mode="RGBA"), name="x.png")
    assert record.content_type == content_type
    reopened = Image.open(io.BytesIO(bytes(CustomerImage.objects.get(pk=record.id).content)))
    assert reopened.format == fmt and reopened.mode == "RGBA"


@pytest.mark.parametrize(
    "data",
    [b"no soy una imagen", image_bytes("GIF", mode="P"), image_bytes()[:60]],
    ids=["texto", "gif", "jpeg-cortado"],
)
def test_anything_that_is_not_a_whole_jpeg_png_or_webp_is_refused(customer_user, data):
    with pytest.raises(DomainValidationError) as error:
        store(customer_user, data)
    assert "image" in error.value.errors
    assert not CustomerImage.objects.exists()


def test_more_megapixels_than_the_admin_allows_are_refused(customer_user):
    # 12 megapíxeles al inicio (propuesto, D63); la pastelería lo ajusta en el admin.
    assert UploadSettings.objects.get().max_image_megapixels == 12
    UploadSettings.objects.update(max_image_megapixels=1)
    with pytest.raises(DomainValidationError) as error:
        store(customer_user, image_bytes(size=(1001, 1000)))
    assert "1 megapíxel" in error.value.errors["image"][0]
    assert store(customer_user, image_bytes(size=(1000, 1000))).width == 1000


def test_pillow_decompression_bomb_warning_is_an_error(customer_user, monkeypatch):
    # Entre el tope de Pillow y el doble, Pillow solo avisa: el servicio lo trata como error.
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 150)
    with pytest.raises(DomainValidationError):
        store(customer_user, image_bytes(size=(20, 10)))


def test_a_side_longer_than_the_cap_is_refused(customer_user):
    with pytest.raises(DomainValidationError):
        store(customer_user, image_bytes("PNG", size=(service.MAX_SIDE_PX + 1, 1), mode="L"))


def test_pillow_keeps_the_hard_cap_for_the_whole_process(settings):
    # El admin no puede pasar del tope duro, que también es el de Pillow para todo el proceso.
    assert service.HARD_MAX_IMAGE_PIXELS == settings.UPLOAD_HARD_LIMIT_MEGAPIXELS * 1_000_000 == 40_000_000
    assert Image.MAX_IMAGE_PIXELS == service.HARD_MAX_IMAGE_PIXELS
    UploadSettings.objects.update(max_image_megapixels=40)
    settings.UPLOAD_HARD_LIMIT_MEGAPIXELS = 12
    assert service.max_image_pixels() == 12_000_000


def test_an_mpo_photo_is_stored_as_jpeg(customer_user):
    buffer = io.BytesIO()
    first, second = Image.new("RGB", (30, 20), "red"), Image.new("RGB", (30, 20), "blue")
    first.save(buffer, format="MPO", save_all=True, append_images=[second])
    assert Image.open(io.BytesIO(buffer.getvalue())).format == "MPO"
    record = store(customer_user, buffer.getvalue())
    reopened = Image.open(io.BytesIO(bytes(CustomerImage.objects.get(pk=record.id).content)))
    assert (record.content_type, reopened.format, getattr(reopened, "n_frames", 1)) == ("image/jpeg", "JPEG", 1)


@pytest.mark.parametrize("error", [struct.error("EXIF dañado"), TypeError("EXIF"), KeyError(274)])
def test_a_broken_exif_is_a_400(customer_user, monkeypatch, error):
    def broken(image, **kwargs):
        raise error

    monkeypatch.setattr(service.ImageOps, "exif_transpose", broken)
    with pytest.raises(DomainValidationError) as refused:
        store(customer_user, jpeg_with_exif())
    assert "image" in refused.value.errors


def test_an_image_that_grows_past_the_limit_when_reencoded_is_refused(customer_user):
    # Ruido guardado con calidad baja: pesa poco al subir y mucho al volver a codificarlo con calidad 90.
    UploadSettings.objects.update(max_upload_mb=1)
    noise = Image.merge("RGB", [Image.effect_noise((2000, 2000), 90) for _ in range(3)])
    buffer = io.BytesIO()
    noise.save(buffer, format="JPEG", quality=15)
    assert len(buffer.getvalue()) < 1024 * 1024
    with pytest.raises(DomainValidationError) as error:
        store(customer_user, buffer.getvalue())
    assert "1 MB" in error.value.errors["image"][0]
    assert not CustomerImage.objects.exists()


def test_a_customer_keeps_at_most_ten_images_without_an_order(customer_user):
    assert UploadSettings.objects.get().max_pending_images == 10
    UploadSettings.objects.update(max_pending_images=2)
    store(customer_user, image_bytes())
    store(customer_user, image_bytes())
    with pytest.raises(DomainValidationError) as error:
        store(customer_user, image_bytes())
    assert "2 imágenes" in error.value.errors["image"][0]


@pytest.mark.parametrize(
    "name, cleaned",
    [
        ("C:\\fakepath\\mi foto.jpg", "mi foto.jpg"),
        ("../../etc/passwd", "passwd"),
        ("foto\u202eGPJ.exe", "fotoGPJ.exe"),
        ("línea\nnueva.png", "líneanueva.png"),
        ("\u200d", ""),
        ("a" * 200, "a" * 120),
    ],
)
def test_the_original_name_is_kept_clean_only_as_metadata(name, cleaned):
    assert service.clean_file_name(name) == cleaned


def test_the_upload_limit_comes_from_the_admin_and_never_passes_the_hard_cap(settings):
    from core_pasteleria.models import UploadSettings

    UploadSettings.objects.update(max_upload_mb=5)
    assert service.max_upload_bytes() == 5 * 1024 * 1024
    settings.UPLOAD_HARD_LIMIT_MB = 3
    assert service.max_upload_bytes() == 3 * 1024 * 1024
