"""Imágenes de clientes guardadas en PostgreSQL: alta, entrega con permisos y uso en un pedido."""
from uuid import UUID

from ..models import CakeDesign, CustomerImage, CustomerImagePurpose
from .records import CustomerImageRecord, NewCustomerImage, StoredImageRecord


def _record(image) -> CustomerImageRecord:
    return CustomerImageRecord(
        id=image.id,
        owner_id=image.owner_id,
        purpose=image.purpose,
        content_type=image.content_type,
        width=image.width,
        height=image.height,
        size_bytes=image.size_bytes,
        original_name=image.original_name,
    )


def create_image(new: NewCustomerImage) -> CustomerImageRecord:
    image = CustomerImage.objects.create(
        owner_id=new.owner_id,
        purpose=new.purpose,
        content=new.content,
        content_type=new.content_type,
        width=new.width,
        height=new.height,
        size_bytes=len(new.content),
        original_name=new.original_name,
    )
    return _record(image)


def get_image_for_viewer(image_id: UUID, viewer_id: int, viewer_sees_all: bool) -> StoredImageRecord | None:
    """El contenido de la imagen si quien la pide es su dueño o puede ver todas; si no, `None` (la API responde 404)."""
    images = CustomerImage.objects.filter(pk=image_id)
    if not viewer_sees_all:
        images = images.filter(owner_id=viewer_id)
    row = images.values("id", "content", "content_type").first()
    if row is None:
        return None
    return StoredImageRecord(id=row["id"], content=bytes(row["content"]), content_type=row["content_type"])


def get_reference_photo(request_id: int, image_id: UUID) -> StoredImageRecord | None:
    """Una foto de referencia ligada a esa solicitud (D70); cualquier otra imagen, `None`. Sin filtrar por dueño: la usa
    el admin para el personal que cotiza, que ya pasó por el permiso."""
    row = (
        CustomerImage.objects.filter(pk=image_id, reference_request_id=request_id, purpose=CustomerImagePurpose.REFERENCE)
        .values("id", "content", "content_type")
        .first()
    )
    if row is None:
        return None
    return StoredImageRecord(id=row["id"], content=bytes(row["content"]), content_type=row["content_type"])


def _is_attached(image_id: UUID) -> bool:
    """Si la imagen ya está en un diseño o en un envío de referencia (D70)."""
    return (
        CakeDesign.objects.filter(decoration_image_id=image_id).exists()
        or CakeDesign.objects.filter(wafer_image_id=image_id).exists()
        or CustomerImage.objects.filter(pk=image_id, reference_request__isnull=False).exists()
    )


def count_pending_images(owner_id: int) -> int:
    """Las imágenes del cliente que todavía no están en un pedido ni en un envío de referencia."""
    return CustomerImage.objects.filter(
        owner_id=owner_id, decoration_design__isnull=True, wafer_design__isnull=True, reference_request__isnull=True
    ).count()


def is_attachable(image_id: UUID, owner_id: int, purpose: str, *, lock: bool = False) -> bool:
    """Si la imagen es de ese cliente, de ese uso y no está ya en otro pedido.

    Con `lock` (dentro de la transacción del pedido) bloquea la fila hasta el fin de la transacción: dos pedidos a
    la vez con la misma imagen se revisan uno tras otro.
    """
    images = CustomerImage.objects.filter(pk=image_id, owner_id=owner_id, purpose=purpose)
    if lock:
        images = images.select_for_update()
    return images.values_list("pk", flat=True).first() is not None and not _is_attached(image_id)
