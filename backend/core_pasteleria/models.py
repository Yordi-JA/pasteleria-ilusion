"""Tablas y relaciones del dominio (ORM sobre PostgreSQL)."""
import unicodedata

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import ArrayField, IntegerRangeField, RangeOperators
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Func, Q, Value
from django.db.models.functions import Lower
from django.utils import timezone


class UserManager(BaseUserManager):
    """Crea usuarios identificados por correo, sin username."""

    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email):
        """Quita espacios y pasa todo el correo a minúsculas.

        Django solo pasa el dominio a minúsculas; aquí también la parte local,
        para que `Ana@x.com` y `ana@x.com` sean la misma cuenta.
        """
        return super().normalize_email((email or "").strip()).lower()

    def get_by_natural_key(self, email):
        # Es lo que usa el inicio de sesión: debe normalizar igual que al guardar.
        return super().get_by_natural_key(self.normalize_email(email))

    def _create(self, email, password, **extra_fields):
        email = self.normalize_email(email)
        if not email:
            raise ValueError("El correo es obligatorio.")
        user = self.model(email=email, **extra_fields)
        # Con password=None queda sin contraseña usable (cuentas de Google).
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields["is_staff"] is not True:
            raise ValueError("Un superusuario debe tener is_staff=True.")
        if extra_fields["is_superuser"] is not True:
            raise ValueError("Un superusuario debe tener is_superuser=True.")
        return self._create(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Cuenta del cliente (Google o correo y contraseña) y del personal.

    El correo único es el identificador; no hay username. Las cuentas de
    Google pueden no tener contraseña usable.
    """

    email = models.EmailField("correo", unique=True)
    is_active = models.BooleanField("activo", default=True)
    is_staff = models.BooleanField("es personal", default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        constraints = [
            # Última defensa en la base: vale aunque se salte save()
            # (bulk_create, update, SQL directo).
            models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
        ]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # Antes de validate_unique, para que el admin detecte duplicados que
        # solo difieren en mayúsculas.
        self.email = type(self).objects.normalize_email(self.email)

    def save(self, *args, **kwargs):
        self.email = type(self).objects.normalize_email(self.email)
        super().save(*args, **kwargs)


# --- Opciones fijas en código ---
# Solo lo que el código necesita conocer (geometría 3D, flujo o estados).
# Sabores, panes y productos son filas editables, no van aquí (D32).


class CakeType(models.TextChoices):
    """Tipo de pastel. Excepción de D29: los códigos van en español."""

    TRES_LECHES = "tres_leches", "Tres leches"
    SECO = "seco", "Seco"
    ENVINADO = "envinado", "Envinado"


class CakeShape(models.TextChoices):
    """Forma del molde; la geometría 3D depende de ella."""

    ROUND = "round", "Redondo"
    RECTANGULAR = "rectangular", "Rectangular"


class ProductCategory(models.TextChoices):
    """Filtros fijos del catálogo (Todo, Pasteles, Postres)."""

    CAKE = "cake", "Pastel"
    DESSERT = "dessert", "Postre"


class SalesChannel(models.TextChoices):
    """Por dónde se vende un producto; cada valor activa una validación."""

    SHOWCASE_AND_ORDER = "showcase_and_order", "Vitrina y por encargo"
    ORDER_ONLY = "order_only", "Solo por encargo"
    SHOWCASE_ONLY = "showcase_only", "Solo en vitrina"


class Presentation(models.TextChoices):
    """Presentación a la venta; decide en qué pantalla aparece."""

    WHOLE = "whole", "Completo"
    LARGE = "large", "Grande"
    MINI = "mini", "Mini"
    SLICE = "slice", "Rebanada"
    INDIVIDUAL = "individual", "Individual"
    CUP = "cup", "Vaso"


class FillingPreviewStyle(models.TextChoices):
    """Cómo se ve un sabor de relleno en la vista previa de "Diseña tu pastel"."""

    SMOOTH = "smooth", "Liso (mermelada o crema)"
    FRUIT_SLICES = "fruit_slices", "Rebanadas de fruta"
    COOKIE_CHUNKS = "cookie_chunks", "Trozos de galleta"
    SPRINKLES = "sprinkles", "Granillo"


class BreadPricingMode(models.TextChoices):
    """Cómo se cobra un pan; elige la estrategia de precio sin `if/elif`."""

    EXTRA_PER_KG = "extra_per_kg", "Incremento por kilo"
    FULL_PRICE_PER_KG = (
        "full_price_per_kg",
        "Precio completo por kilo (relleno incluido)",
    )


class DecorationPricing(models.TextChoices):
    """Cómo se cobra una decoración; elige la estrategia y el paso a `awaiting_quote`."""

    INCLUDED = "included", "Incluido"
    FIXED = "fixed", "Precio fijo"
    QUOTE = "quote", "Por cotizar"


class StandOrigin(models.TextChoices):
    """De dónde sale el depósito de una base; solo `bakery` se muestra en `/bases`."""

    BAKERY = "bakery", "Pastelería"
    APPROVED = "approved", "Aprobada"


class InventoryKind(models.TextChoices):
    """Los dos usos de `Inventory`."""

    SHOWCASE = "showcase", "Existencia de vitrina"
    BREAD = "bread", "Pan para encargos de hoy"


# --- Clases base ---


class OrderedOption(models.Model):
    """Opción editable que el admin ordena y puede desactivar."""

    sort_order = models.PositiveSmallIntegerField("orden", default=0)
    is_active = models.BooleanField("activo", default=True)

    class Meta:
        abstract = True


class SingletonSettings(models.Model):
    """Configuración de una sola fila (pk=1).

    La migración de datos crea la fila y el admin no deja agregar otra ni
    borrarla. La restricción de la base impide una segunda fila aunque se
    salte `save()`.
    """

    class Meta:
        abstract = True
        constraints = [
            models.CheckConstraint(
                condition=Q(pk=1), name="%(app_label)s_%(class)s_singleton"
            ),
        ]

    def __str__(self):
        return self._meta.verbose_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)


# WhatsApp en formato internacional E.164 sin "+": la lada del país (nunca
# empieza con 0) y el número, de 8 a 15 dígitos en total. Así sirve tal cual
# para un enlace https://wa.me/<número>.
WHATSAPP_MIN_DIGITS = 8
WHATSAPP_MAX_DIGITS = 15
_WHATSAPP_BODY = f"[1-9][0-9]{{{WHATSAPP_MIN_DIGITS - 1},{WHATSAPP_MAX_DIGITS - 1}}}"
WHATSAPP_PATTERN_SQL = f"^{_WHATSAPP_BODY}$"
WHATSAPP_FORMAT_MESSAGE = (
    f"Escribe el WhatsApp con solo dígitos, de {WHATSAPP_MIN_DIGITS} a "
    f"{WHATSAPP_MAX_DIGITS}: la lada del país y el número, sin +, espacios ni "
    "guiones. En México: 52 y los 10 dígitos."
)
# `\Z` y no `$`: en Python `$` acepta un salto de línea al final. `[0-9]` y no
# `\d`, que también acepta dígitos de otras escrituras.
whatsapp_validator = RegexValidator(rf"^{_WHATSAPP_BODY}\Z", WHATSAPP_FORMAT_MESSAGE)

# Texto de una línea que se muestra en el sitio: sin caracteres de control
# (Cc: C0, DEL, C1 como NEL), de formato (Cf: bidi, ancho cero, LRM/RLM, FEFF)
# ni separadores de línea o párrafo (Zl, Zp), que no se ven y pueden alterar
# cómo se muestra. Acentos, ñ y signos de puntuación sí se aceptan.
# Sin CheckConstraint en la base, por decisión: React la muestra como texto,
# así que es un problema de presentación y no de seguridad, y no duplicamos
# la regla en SQL.
ADDRESS_FORMAT_MESSAGE = (
    "La dirección va en una sola línea, sin saltos de línea, tabuladores ni "
    "caracteres invisibles de control o de dirección del texto."
)
_FORBIDDEN_ADDRESS_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})


def validate_address_characters(value):
    """Rechaza la dirección si lleva un carácter de control, de formato o un separador de línea."""
    if any(unicodedata.category(character) in _FORBIDDEN_ADDRESS_CATEGORIES for character in value):
        raise ValidationError(ADDRESS_FORMAT_MESSAGE, code="invalid")


class StoreSettings(SingletonSettings):
    """Horarios de la pastelería, reglas de las entregas y los datos del negocio del pie (dirección y WhatsApp)."""

    store_opens_at = models.TimeField("abre")
    store_closes_at = models.TimeField(
        "cierra",
        help_text="También es la hora límite del pago en efectivo.",
    )
    first_slot_starts_at = models.TimeField("primer horario de entrega")
    last_slot_starts_at = models.TimeField(
        "último horario de entrega",
        help_text="Hora en que empieza el último lapso.",
    )
    slot_minutes = models.PositiveSmallIntegerField("minutos por lapso")
    max_orders_per_slot = models.PositiveSmallIntegerField("pedidos activos por lapso")
    custom_lead_days = models.PositiveSmallIntegerField(
        "días de anticipación de un pedido"
    )
    same_day_showcase_lead_hours = models.PositiveSmallIntegerField(
        "horas de anticipación de un encargo de vitrina para hoy"
    )
    free_delivery_from_kg = models.PositiveSmallIntegerField("envío gratis desde (kg)")
    # Datos del negocio del pie y la franja superior (reglas de negocio, sección 13).
    address = models.CharField(
        "dirección",
        max_length=255,
        blank=True,
        validators=[validate_address_characters],
        help_text=(
            "PENDIENTE: la pastelería aún no la define. Déjala vacía; no pongas un "
            "valor supuesto. Se muestra en el pie del sitio."
        ),
    )
    whatsapp = models.CharField(
        "WhatsApp",
        max_length=WHATSAPP_MAX_DIGITS,
        blank=True,
        validators=[whatsapp_validator],
        help_text=(
            "PENDIENTE: la pastelería aún no lo define. Déjalo vacío; no pongas un "
            "valor supuesto. Escribe solo dígitos, con la lada del país y sin + ni "
            f"espacios ni guiones, de {WHATSAPP_MIN_DIGITS} a {WHATSAPP_MAX_DIGITS} "
            "dígitos. En México: 52 y los 10 dígitos del número."
        ),
    )

    class Meta(SingletonSettings.Meta):
        verbose_name = "horarios y entregas"
        verbose_name_plural = "horarios y entregas"
        constraints = [
            *SingletonSettings.Meta.constraints,
            models.CheckConstraint(
                condition=Q(store_opens_at__lt=F("store_closes_at")),
                name="storesettings_opens_before_closes",
                violation_error_message="La pastelería debe abrir antes de cerrar.",
            ),
            models.CheckConstraint(
                condition=Q(first_slot_starts_at__gte=F("store_opens_at")),
                name="storesettings_first_slot_after_opening",
                violation_error_message=(
                    "El primer horario de entrega no puede ser antes de la apertura."
                ),
            ),
            models.CheckConstraint(
                condition=Q(last_slot_starts_at__gte=F("first_slot_starts_at")),
                name="storesettings_last_slot_after_first",
                violation_error_message=(
                    "El último horario de entrega no puede ser antes del primero."
                ),
            ),
            models.CheckConstraint(
                condition=Q(last_slot_starts_at__lt=F("store_closes_at")),
                name="storesettings_last_slot_before_closing",
                violation_error_message=(
                    "El último horario de entrega debe empezar antes del cierre."
                ),
            ),
            models.CheckConstraint(
                condition=Q(slot_minutes__gt=0),
                name="storesettings_slot_minutes_positive",
                violation_error_message="Los minutos por lapso deben ser mayores que 0.",
            ),
            models.CheckConstraint(
                condition=Q(max_orders_per_slot__gt=0),
                name="storesettings_max_orders_positive",
                violation_error_message=(
                    "Los pedidos activos por lapso deben ser mayores que 0."
                ),
            ),
            # Mismo formato que `whatsapp_validator`, también para lo que se
            # guarde sin pasar por el formulario. En PostgreSQL `$` es el fin
            # del texto (no acepta un salto de línea final).
            models.CheckConstraint(
                condition=Q(whatsapp="") | Q(whatsapp__regex=WHATSAPP_PATTERN_SQL),
                name="storesettings_whatsapp_digits",
                violation_error_message=WHATSAPP_FORMAT_MESSAGE,
            ),
        ]


class CakeDesignSettings(SingletonSettings):
    """Límites y precios fijos de "Diseña tu pastel"."""

    people_per_kg = models.PositiveSmallIntegerField("personas por kilo")
    min_custom_kg = models.PositiveSmallIntegerField("kilos mínimos de un pedido")
    max_online_kg = models.PositiveSmallIntegerField(
        "kilos máximos en línea",
        help_text="PROPUESTA: falta que la pastelería lo valide.",
    )
    wafer_price = models.DecimalField(
        "precio de la oblea", max_digits=8, decimal_places=2
    )
    wafer_max_width_cm = models.DecimalField(
        "ancho máximo de la oblea (cm)", max_digits=4, decimal_places=1
    )
    wafer_max_height_cm = models.DecimalField(
        "alto máximo de la oblea (cm)", max_digits=4, decimal_places=1
    )
    message_suggested_max_words = models.PositiveSmallIntegerField(
        "palabras sugeridas para el mensaje",
        help_text="Es una sugerencia: no bloquea el pedido.",
    )

    class Meta(SingletonSettings.Meta):
        verbose_name = "Diseña tu pastel"
        verbose_name_plural = "Diseña tu pastel"
        constraints = [
            *SingletonSettings.Meta.constraints,
            models.CheckConstraint(
                condition=Q(people_per_kg__gt=0),
                name="cakedesignsettings_people_per_kg_positive",
                violation_error_message="Las personas por kilo deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(min_custom_kg__gt=0),
                name="cakedesignsettings_min_kg_positive",
                violation_error_message="Los kilos mínimos deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(max_online_kg__gt=0),
                name="cakedesignsettings_max_kg_positive",
                violation_error_message="Los kilos máximos deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(max_online_kg__gte=F("min_custom_kg")),
                name="cakedesignsettings_max_kg_gte_min",
                violation_error_message=(
                    "Los kilos máximos en línea no pueden ser menos que los mínimos."
                ),
            ),
            models.CheckConstraint(
                condition=Q(wafer_price__gte=0),
                name="cakedesignsettings_wafer_price_non_negative",
                violation_error_message="El precio de la oblea no puede ser negativo.",
            ),
            models.CheckConstraint(
                condition=Q(wafer_max_width_cm__gt=0),
                name="cakedesignsettings_wafer_width_positive",
                violation_error_message="El ancho de la oblea debe ser mayor que 0.",
            ),
            models.CheckConstraint(
                condition=Q(wafer_max_height_cm__gt=0),
                name="cakedesignsettings_wafer_height_positive",
                violation_error_message="El alto de la oblea debe ser mayor que 0.",
            ),
            models.CheckConstraint(
                condition=Q(message_suggested_max_words__gt=0),
                name="cakedesignsettings_message_words_positive",
                violation_error_message="Las palabras sugeridas deben ser más de 0.",
            ),
        ]

    def clean(self):
        super().clean()
        if self.max_online_kg is None:
            return
        saved = type(self).objects.filter(pk=self.pk).values_list("max_online_kg", flat=True).first()
        # Solo si el campo cambia (o en el alta): editar otro campo, como el
        # precio de la oblea, no queda bloqueado por el estado de las bases.
        if saved == self.max_online_kg:
            return
        # Un pedido de los kilos máximos en línea debe tener base (regla 7).
        largest = (
            CakeStand.objects.filter(is_active=True).order_by("-max_kg").values_list("max_kg", flat=True).first()
        )
        if largest is None:
            raise ValidationError(
                {"max_online_kg": "No hay bases activas: activa al menos una antes de fijar los kilos máximos en línea."}
            )
        if self.max_online_kg > largest:
            raise ValidationError(
                {
                    "max_online_kg": (
                        f"La base activa más grande llega a {largest} kg: los kilos máximos en línea "
                        "no pueden pasar de ahí. Agrega o activa una base más grande primero."
                    )
                }
            )


class PolicySettings(SingletonSettings):
    """Políticas de la pastelería que el admin puede editar."""

    stand_return_days = models.PositiveSmallIntegerField("días para devolver la base")
    damaged_stand_policy = models.TextField(
        "qué pasa si la base regresa dañada",
        blank=True,
        help_text=(
            "PENDIENTE: la pastelería aún no lo define. Déjalo vacío; "
            "no pongas un valor supuesto."
        ),
    )

    class Meta(SingletonSettings.Meta):
        verbose_name = "políticas"
        verbose_name_plural = "políticas"
        constraints = [
            *SingletonSettings.Meta.constraints,
            models.CheckConstraint(
                condition=Q(stand_return_days__gt=0),
                name="policysettings_return_days_positive",
                violation_error_message="Los días para devolver la base deben ser más de 0.",
            ),
        ]


class UploadSettings(SingletonSettings):
    """Límites de las imágenes que suben los clientes (D31)."""

    max_upload_mb = models.PositiveSmallIntegerField(
        "tamaño máximo por imagen (MB)",
        validators=[
            MinValueValidator(1),
            MaxValueValidator(settings.UPLOAD_HARD_LIMIT_MB),
        ],
        help_text=(
            f"No puede pasar de {settings.UPLOAD_HARD_LIMIT_MB} MB, "
            "el tope duro del sitio."
        ),
    )
    max_reference_images = models.PositiveSmallIntegerField(
        "imágenes por envío de referencia",
        validators=[
            MinValueValidator(1),
            MaxValueValidator(settings.UPLOAD_HARD_LIMIT_IMAGES),
        ],
        help_text=(
            f"No puede pasar de {settings.UPLOAD_HARD_LIMIT_IMAGES}, "
            "el tope duro del sitio."
        ),
    )

    class Meta(SingletonSettings.Meta):
        verbose_name = "subidas"
        verbose_name_plural = "subidas"
        constraints = [
            *SingletonSettings.Meta.constraints,
            models.CheckConstraint(
                condition=Q(max_upload_mb__gte=1)
                & Q(max_upload_mb__lte=settings.UPLOAD_HARD_LIMIT_MB),
                name="uploadsettings_max_upload_mb_range",
                violation_error_message=(
                    "El tamaño máximo por imagen debe estar entre 1 MB y "
                    f"{settings.UPLOAD_HARD_LIMIT_MB} MB."
                ),
            ),
            models.CheckConstraint(
                condition=Q(max_reference_images__gte=1)
                & Q(max_reference_images__lte=settings.UPLOAD_HARD_LIMIT_IMAGES),
                name="uploadsettings_max_reference_images_range",
                violation_error_message=(
                    "Las imágenes por envío de referencia deben estar entre 1 y "
                    f"{settings.UPLOAD_HARD_LIMIT_IMAGES}."
                ),
            ),
        ]


# --- Opciones y precios de "Diseña tu pastel" ---

hex_color_validator = RegexValidator(
    r"^#[0-9A-Fa-f]{6}$", "Escribe el color como #RRGGBB, por ejemplo #F0CE8A."
)


# Nombre de un archivo estático del frontend: nunca una URL ni una ruta.
photo_file_validator = RegexValidator(
    r"^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|avif)\Z",
    "Escribe solo el nombre del archivo, en minúsculas y con extensión "
    "webp, jpg, jpeg, png o avif, por ejemplo tres-leches-durazno.webp. "
    "No pongas direcciones ni carpetas.",
)


def all_cake_types():
    """Valor inicial de `allowed_cake_types`: la opción se ofrece en los tres tipos."""
    return list(CakeType.values)


def cake_types_field():
    """Campo de los tipos de pastel en que se ofrece una opción (`Bread`, `FillingFlavor`)."""
    return ArrayField(
        models.CharField(max_length=20, choices=CakeType.choices),
        verbose_name="tipos de pastel en que se ofrece",
        default=all_cake_types,
    )


def cake_types_constraints(prefix):
    """Restricciones de `allowed_cake_types`: no vacío y solo tipos conocidos."""
    return [
        models.CheckConstraint(
            condition=Q(allowed_cake_types__len__gt=0),
            name=f"{prefix}_cake_types_not_empty",
            violation_error_message="Elige al menos un tipo de pastel.",
        ),
        models.CheckConstraint(
            condition=Q(allowed_cake_types__contained_by=list(CakeType.values)),
            name=f"{prefix}_cake_types_known",
            violation_error_message="Hay un tipo de pastel que no existe.",
        ),
    ]


class Bread(OrderedOption):
    """Pan del pastel (paso 3 de "Diseña tu pastel")."""

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="Lo usa la vista previa. No se cambia después de crearlo.",
    )
    description = models.CharField("descripción", max_length=120, blank=True)
    pricing_mode = models.CharField(
        "cómo se cobra", max_length=20, choices=BreadPricingMode.choices
    )
    price_per_kg = models.DecimalField(
        "precio por kilo",
        max_digits=8,
        decimal_places=2,
        help_text="Incremento o precio completo, según cómo se cobra.",
    )
    included_filling = models.CharField(
        "relleno incluido",
        max_length=120,
        blank=True,
        help_text="Solo para los panes de precio completo, por ejemplo la crema de chocolate.",
    )
    allowed_cake_types = cake_types_field()
    preview_color = models.CharField(
        "color en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Color del pan; en un pan de dos colores, la mitad de arriba de cada capa.",
    )
    preview_color_bottom = models.CharField(
        "color de abajo en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Solo para un pan de dos colores (choco-vainilla): la mitad de abajo de cada capa. Vacío: un solo color.",
    )

    class Meta:
        verbose_name = "pan"
        verbose_name_plural = "panes"
        ordering = ["sort_order", "name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(price_per_kg__gte=0),
                name="bread_price_non_negative",
                violation_error_message="El precio por kilo no puede ser negativo.",
            ),
            models.CheckConstraint(
                condition=~Q(pricing_mode=BreadPricingMode.FULL_PRICE_PER_KG)
                | (~Q(included_filling="") & Q(price_per_kg__gt=0)),
                name="bread_full_price_needs_filling_and_price",
                violation_error_message=(
                    "Un pan de precio completo lleva relleno incluido y un precio mayor que 0."
                ),
            ),
            models.CheckConstraint(
                condition=~Q(pricing_mode=BreadPricingMode.EXTRA_PER_KG)
                | Q(included_filling=""),
                name="bread_extra_price_has_no_filling",
                violation_error_message=(
                    "Un pan con incremento por kilo no lleva relleno incluido."
                ),
            ),
            *cake_types_constraints("bread"),
        ]

    def __str__(self):
        return self.name


class FillingBase(OrderedOption):
    """Base de relleno: Normal, Con queso o Con flan (paso 4)."""

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="Lo usa la vista previa. No se cambia después de crearlo.",
    )
    description = models.CharField("descripción", max_length=120, blank=True)
    preview_color = models.CharField(
        "color en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
    )
    max_flavors = models.PositiveSmallIntegerField(
        "máximo de sabores",
        help_text="La vista previa parte el pastel mitad y mitad: 1 o 2.",
    )
    combined_extra_per_kg = models.DecimalField(
        "cargo por relleno combinado, por kg",
        max_digits=8,
        decimal_places=2,
        help_text="Solo aplica si se elige más de un sabor.",
    )

    class Meta:
        verbose_name = "base de relleno"
        verbose_name_plural = "bases de relleno"
        ordering = ["sort_order", "name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(max_flavors__gte=1) & Q(max_flavors__lte=2),
                name="fillingbase_max_flavors_range",
                violation_error_message="El máximo de sabores es 1 o 2.",
            ),
            models.CheckConstraint(
                condition=Q(combined_extra_per_kg__gte=0),
                name="fillingbase_combined_extra_non_negative",
                violation_error_message="El cargo por combinado no puede ser negativo.",
            ),
            models.CheckConstraint(
                condition=~Q(max_flavors=1) | Q(combined_extra_per_kg=0),
                name="fillingbase_single_flavor_has_no_combined_extra",
                violation_error_message=(
                    "Una base de un solo sabor no puede cobrar relleno combinado."
                ),
            ),
        ]

    def __str__(self):
        return self.name


class FillingFlavor(OrderedOption):
    """Sabor de relleno (Durazno, Fresa, Nuez...)."""

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="Lo usa la vista previa. No se cambia después de crearlo.",
    )
    preview_color = models.CharField(
        "color en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
    )
    bases = models.ManyToManyField(
        FillingBase,
        related_name="flavors",
        verbose_name="bases en que se ofrece",
        help_text="Elige al menos una.",
    )
    is_combinable = models.BooleanField("se puede combinar", default=True)
    allowed_cake_types = cake_types_field()
    preview_style = models.CharField(
        "cómo se ve en la vista previa",
        max_length=20,
        choices=FillingPreviewStyle.choices,
        default=FillingPreviewStyle.SMOOTH,
        help_text="Liso, con rebanadas de fruta, con trozos de galleta o con granillo.",
    )
    preview_color_secondary = models.CharField(
        "color de los trozos en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Color de las rebanadas, los trozos o el granillo. Vacío en un relleno liso.",
    )

    class Meta:
        verbose_name = "sabor de relleno"
        verbose_name_plural = "sabores de relleno"
        ordering = ["sort_order", "name"]
        constraints = cake_types_constraints("fillingflavor")

    def __str__(self):
        return self.name


class FillingPrice(models.Model):
    """Precio por kilo del relleno, por tipo de pastel y base (tabla 4.5 de las reglas).

    Sin sabor es el precio general de la base; con sabor, ese sabor tiene
    precio propio (por ejemplo, Nuez o Fresa con yogurt en la base Normal).
    """

    cake_type = models.CharField("tipo de pastel", max_length=20, choices=CakeType.choices)
    base = models.ForeignKey(
        FillingBase,
        on_delete=models.PROTECT,
        related_name="prices",
        verbose_name="base de relleno",
    )
    flavor = models.ForeignKey(
        FillingFlavor,
        on_delete=models.PROTECT,
        related_name="prices",
        null=True,
        blank=True,
        verbose_name="sabor",
        help_text="Vacío: precio general de la base. Con sabor: ese sabor tiene precio propio.",
    )
    price_per_kg = models.DecimalField("precio por kilo", max_digits=8, decimal_places=2)

    class Meta:
        verbose_name = "precio del relleno por kilo"
        verbose_name_plural = "precios del relleno por kilo"
        ordering = ["base", "flavor", "cake_type"]
        constraints = [
            # Dos índices parciales en lugar de `nulls_distinct=False`, que exige
            # PostgreSQL 15 y se ignora en silencio en servidores anteriores.
            models.UniqueConstraint(
                fields=["cake_type", "base"],
                condition=Q(flavor__isnull=True),
                name="fillingprice_unique_general_price",
                violation_error_message=(
                    "Ya hay un precio general para ese tipo de pastel y esa base."
                ),
            ),
            models.UniqueConstraint(
                fields=["cake_type", "base", "flavor"],
                condition=Q(flavor__isnull=False),
                name="fillingprice_unique_flavor_price",
                violation_error_message=(
                    "Ya hay un precio para ese tipo de pastel, esa base y ese sabor."
                ),
            ),
            models.CheckConstraint(
                condition=Q(price_per_kg__gt=0),
                name="fillingprice_price_positive",
                violation_error_message="El precio por kilo debe ser mayor que 0.",
            ),
        ]

    def __str__(self):
        return f"{self.get_cake_type_display()}, {self.flavor or self.base}"

    def clean(self):
        super().clean()
        if self.base_id is None:
            return
        if self.flavor_id is not None:
            if not self.flavor.bases.filter(pk=self.base_id).exists():
                raise ValidationError({"flavor": "Ese sabor no se ofrece en esa base."})
            if self.cake_type and self.cake_type not in self.flavor.allowed_cake_types:
                raise ValidationError(
                    {"flavor": "Ese sabor no se ofrece en ese tipo de pastel."}
                )
        self._check_flavor_is_not_below_its_base()

    def _check_flavor_is_not_below_its_base(self):
        """Un sabor no se cobra por debajo de su base en el mismo tipo de pastel.

        Se revisa de los dos lados: un precio propio de sabor contra el precio
        general, y un precio general contra los propios que ya existen.
        """
        if not self.cake_type or self.price_per_kg is None:
            return
        same_type = type(self).objects.filter(cake_type=self.cake_type, base_id=self.base_id).exclude(pk=self.pk)
        type_name = CakeType(self.cake_type).label.lower()
        if self.flavor_id is not None:
            general = same_type.filter(flavor__isnull=True).values_list("price_per_kg", flat=True).first()
            if general is not None and self.price_per_kg < general:
                raise ValidationError(
                    {
                        "price_per_kg": (
                            "Un sabor no se cobra por debajo de su base: el precio general de "
                            f"{self.base} en {type_name} es ${general:,.2f}."
                        )
                    }
                )
            return
        cheaper = same_type.filter(flavor__isnull=False, price_per_kg__lt=self.price_per_kg).order_by(
            "flavor__name"
        )
        names = [price.flavor.name for price in cheaper.select_related("flavor")]
        if names:
            listed = " y ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 1 else names[0]
            verb, pronoun = ("cuestan", "les") if len(names) > 1 else ("cuesta", "le")
            raise ValidationError(
                {
                    "price_per_kg": (
                        f"Un sabor no se cobra por debajo de su base: {listed} {verb} menos "
                        f"en {type_name}. Súbe{pronoun} el precio primero."
                    )
                }
            )


class TierRecommendation(models.Model):
    """Kilos mínimos por número de pisos (regla 3.3, D50): un pastel con menos kilos no lleva esos pisos.

    El máximo de pisos del sitio es el `tiers` más alto de esta tabla. El
    modelo conserva su nombre y el de su campo de antes de D50 para no rehacer
    la tabla: `recommended_min_kg` es el mínimo que bloquea.
    """

    tiers = models.PositiveSmallIntegerField("pisos", unique=True)
    recommended_min_kg = models.PositiveSmallIntegerField(
        "kilos mínimos", help_text="Con menos kilos, el pastel no puede llevar estos pisos."
    )
    recommended_max_kg = models.PositiveSmallIntegerField(
        "hasta (referencia)",
        null=True,
        blank=True,
        help_text="Solo informativo; déjalo vacío si no hay un tope recomendado.",
    )

    class Meta:
        verbose_name = "mínimo de kilos por pisos"
        verbose_name_plural = "mínimos de kilos por pisos"
        ordering = ["tiers"]
        constraints = [
            models.CheckConstraint(
                condition=Q(tiers__gte=1),
                name="tierrecommendation_tiers_positive",
                violation_error_message="Los pisos deben ser 1 o más.",
            ),
            models.CheckConstraint(
                condition=Q(recommended_max_kg__isnull=True)
                | Q(recommended_max_kg__gte=F("recommended_min_kg")),
                name="tierrecommendation_max_gte_min",
                violation_error_message=(
                    "El tope de referencia no puede ser menor que los kilos recomendados."
                ),
            ),
        ]

    def __str__(self):
        return f"{self.tiers} pisos"

    def clean(self):
        super().clean()
        if self.tiers is None or self.recommended_min_kg is None:
            return
        others = type(self).objects.exclude(pk=self.pk)
        # Más pisos piden más kilos: ninguna fila con menos pisos pide igual o más.
        if (
            others.filter(
                tiers__lt=self.tiers, recommended_min_kg__gte=self.recommended_min_kg
            ).exists()
            or others.filter(
                tiers__gt=self.tiers, recommended_min_kg__lte=self.recommended_min_kg
            ).exists()
        ):
            raise ValidationError(
                {"recommended_min_kg": "Los kilos mínimos deben crecer con los pisos."}
            )


class CoverageColor(OrderedOption):
    """Color de la crema pastelera (paso 5). La cobertura es siempre crema pastelera."""

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="Lo usa la vista previa. No se cambia después de crearlo.",
    )
    preview_color = models.CharField(
        "color en la vista previa", max_length=7, validators=[hex_color_validator]
    )

    class Meta:
        verbose_name = "color de cobertura"
        verbose_name_plural = "colores de cobertura"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class DecorationOption(OrderedOption):
    """Decoración (paso 6).

    Solo la de precio fijo (`pricing="fixed"`) lleva precio: con el precio vacío
    es PENDIENTE y nunca se cobra como $0. "Incluido" y "Por cotizar" lo llevan
    vacío a propósito.
    """

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="La vista previa lo traduce a una forma. No se cambia después de crearlo.",
    )
    description = models.CharField("descripción", max_length=120)
    pricing = models.CharField(
        "cómo se cobra", max_length=10, choices=DecorationPricing.choices
    )
    price = models.DecimalField(
        "precio",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Solo para decoraciones de precio fijo. Si es de precio fijo y está "
            "vacío, es PENDIENTE: la pastelería aún no lo define. Déjalo vacío; "
            "no pongas un valor supuesto."
        ),
    )

    class Meta:
        verbose_name = "decoración"
        verbose_name_plural = "decoraciones"
        ordering = ["sort_order", "name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(pricing=DecorationPricing.FIXED) | Q(price__isnull=True),
                name="decorationoption_price_only_when_fixed",
                violation_error_message=(
                    "Solo una decoración de precio fijo lleva precio."
                ),
            ),
            models.CheckConstraint(
                condition=Q(price__isnull=True) | Q(price__gt=0),
                name="decorationoption_price_positive",
                violation_error_message="El precio debe ser mayor que 0.",
            ),
            models.UniqueConstraint(
                fields=["pricing"],
                condition=Q(pricing=DecorationPricing.INCLUDED),
                name="decorationoption_single_included",
                violation_error_message='Solo puede haber una decoración "Incluido".',
            ),
            models.UniqueConstraint(
                fields=["pricing"],
                condition=Q(pricing=DecorationPricing.QUOTE),
                name="decorationoption_single_quote",
                violation_error_message='Solo puede haber una decoración "Por cotizar".',
            ),
        ]

    def __str__(self):
        return self.name


# --- Bases y envío ---


class CakeStand(models.Model):
    """Tamaño de base con su depósito (no es cada base física).

    La regla de qué depósito toca vive en el servicio: el del tamaño activo con
    el `max_kg` más chico que sea mayor o igual a los kilos del pedido.
    """

    min_kg = models.PositiveSmallIntegerField("desde (kg)")
    max_kg = models.PositiveSmallIntegerField("hasta (kg)")
    deposit = models.DecimalField("depósito", max_digits=8, decimal_places=2)
    origin = models.CharField("origen", max_length=10, choices=StandOrigin.choices)
    description = models.CharField(
        "descripción", max_length=120, blank=True, help_text="Por ejemplo, madera forrada en aluminio."
    )
    is_active = models.BooleanField("activa", default=True)

    class Meta:
        verbose_name = "base"
        verbose_name_plural = "bases"
        ordering = ["max_kg"]
        constraints = [
            models.CheckConstraint(
                condition=Q(min_kg__lte=F("max_kg")),
                name="cakestand_min_lte_max",
                violation_error_message='"Desde" no puede ser mayor que "hasta".',
            ),
            models.CheckConstraint(
                condition=Q(deposit__gte=0),
                name="cakestand_deposit_non_negative",
                violation_error_message="El depósito no puede ser negativo.",
            ),
            models.UniqueConstraint(
                fields=["max_kg"],
                name="cakestand_unique_max_kg",
                violation_error_message="Ya hay una base que llega hasta esos kilos.",
            ),
            ExclusionConstraint(
                name="cakestand_no_overlapping_ranges",
                expressions=[
                    (
                        Func(
                            F("min_kg"),
                            F("max_kg"),
                            Value("[]"),
                            function="int4range",
                            output_field=IntegerRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
                violation_error_message="Los kilos de esta base se traslapan con los de otra.",
            ),
        ]

    def __str__(self):
        if self.min_kg == self.max_kg:
            return f"Base para {self.max_kg} kg"
        return f"Base para {self.min_kg} a {self.max_kg} kg"

    def clean(self):
        super().clean()
        # Con el rango al revés, `int4range` falla en la base: se rechaza antes de
        # validar las restricciones (el error por campo las salta).
        if self.min_kg is not None and self.max_kg is not None and self.min_kg > self.max_kg:
            raise ValidationError({"max_kg": '"Hasta" no puede ser menor que "desde".'})
        self._check_the_minimum_order_keeps_a_stand()

    def _check_the_minimum_order_keeps_a_stand(self):
        """El `min_kg` más chico de la tabla (activas o no) no pasa del pedido mínimo.

        Por debajo de ese `min_kg` no hay depósito (`warranty_service`): si
        empezara arriba del pedido mínimo, un pedido chico se quedaría sin base.
        """
        min_custom_kg = CakeDesignSettings.objects.values_list("min_custom_kg", flat=True).first()
        if self.min_kg is None or min_custom_kg is None:
            return
        others = type(self).objects.exclude(pk=self.pk).order_by("min_kg").values_list("min_kg", flat=True).first()
        smallest = min(self.min_kg, others) if others is not None else self.min_kg
        if smallest > min_custom_kg:
            raise ValidationError(
                {
                    "min_kg": (
                        f"La base más chica empezaría en {smallest} kg y el pedido mínimo es de "
                        f"{min_custom_kg} kg: un pedido de {min_custom_kg} kg se quedaría sin base. "
                        f"Deja una base que empiece en {min_custom_kg} kg o menos."
                    )
                }
            )


class DeliveryFeeBand(models.Model):
    """Tarifa de envío para pedidos de menos del peso de envío gratis.

    Más allá de la última banda no hay tarifa: se atiende por WhatsApp.
    """

    max_km = models.DecimalField(
        "hasta (km)", max_digits=5, decimal_places=1, unique=True
    )
    fee = models.DecimalField("costo de envío", max_digits=8, decimal_places=2)

    class Meta:
        verbose_name = "tarifa de envío por distancia"
        verbose_name_plural = "tarifas de envío por distancia"
        ordering = ["max_km"]
        constraints = [
            models.CheckConstraint(
                condition=Q(max_km__gt=0),
                name="deliveryfeeband_km_positive",
                violation_error_message="Los kilómetros deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(fee__gte=0),
                name="deliveryfeeband_fee_non_negative",
                violation_error_message="El costo de envío no puede ser negativo.",
            ),
        ]

    def __str__(self):
        return f"Hasta {self.max_km} km"


# --- Catálogo ---


class Product(OrderedOption):
    """Producto del catálogo: un pastel o postre por sabor (`/pasteles/:slug`).

    El precio no vive aquí: cada presentación a la venta (`ProductOffering`)
    apunta a un `CatalogPrice`, que se comparte por grupo de productos.
    """

    name = models.CharField("nombre", max_length=80, unique=True)
    slug = models.SlugField(
        "identificador en la dirección",
        max_length=80,
        unique=True,
        help_text="Forma la dirección del producto. No se cambia después de crearlo.",
    )
    category = models.CharField(
        "categoría", max_length=10, choices=ProductCategory.choices, db_index=True
    )
    sales_channel = models.CharField(
        "cómo se vende",
        max_length=20,
        choices=SalesChannel.choices,
        default=SalesChannel.SHOWCASE_AND_ORDER,
    )
    summary = models.CharField("descripción corta", max_length=160, help_text="La de la tarjeta.")
    description = models.TextField("descripción", blank=True, help_text="La de la ficha.")
    cake_type = models.CharField(
        "tipo de pastel", max_length=20, choices=CakeType.choices, null=True, blank=True
    )
    bread = models.ForeignKey(
        Bread,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="pan",
    )
    filling_base = models.ForeignKey(
        FillingBase,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="base de relleno",
    )
    filling_flavor = models.ForeignKey(
        FillingFlavor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="sabor de relleno",
    )
    storage_notes = models.TextField(
        "conservación",
        blank=True,
        help_text=(
            "PENDIENTE si está vacío: la pastelería aún no lo define. "
            "La ficha oculta la sección. No pongas un valor supuesto."
        ),
    )
    transport_notes = models.TextField(
        "transporte",
        blank=True,
        help_text=(
            "PENDIENTE si está vacío: la pastelería aún no lo define. "
            "La ficha oculta la sección. No pongas un valor supuesto."
        ),
    )
    photo = models.CharField(
        "archivo de la foto",
        max_length=120,
        blank=True,
        validators=[photo_file_validator],
        help_text=(
            "PENDIENTE si está vacío. Nombre del archivo estático del frontend, "
            "por ejemplo tres-leches-durazno.webp."
        ),
    )
    featured_on_home = models.BooleanField(
        "destacado en la portada",
        default=False,
        help_text=(
            "La pastelería elige qué productos salen en \"Pasteles de la casa\" de la portada. "
            "Salen hasta 4 de los marcados, en el orden de la lista. Si no marca ninguno, "
            "salen los primeros 4 pasteles del catálogo."
        ),
    )

    class Meta:
        verbose_name = "producto"
        verbose_name_plural = "productos"
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(
                fields=["category", "is_active", "sort_order"],
                name="product_category_active_order",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(category=ProductCategory.DESSERT)
                | (
                    Q(cake_type__isnull=True)
                    & Q(bread__isnull=True)
                    & Q(filling_base__isnull=True)
                    & Q(filling_flavor__isnull=True)
                ),
                name="product_dessert_has_no_cake_fields",
                violation_error_message=(
                    "Un postre no lleva tipo de pastel, pan, base ni sabor de relleno."
                ),
            ),
            models.CheckConstraint(
                condition=Q(filling_flavor__isnull=True) | Q(filling_base__isnull=False),
                name="product_flavor_needs_base",
                violation_error_message="Un sabor de relleno exige su base.",
            ),
            models.CheckConstraint(
                condition=Q(filling_base__isnull=True) | Q(cake_type__isnull=False),
                name="product_base_needs_cake_type",
                violation_error_message="Una base de relleno exige el tipo de pastel.",
            ),
            models.CheckConstraint(
                condition=Q(bread__isnull=True) | Q(cake_type__isnull=False),
                name="product_bread_needs_cake_type",
                violation_error_message="Un pan exige el tipo de pastel.",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        errors = {}
        flavor = self.filling_flavor if self.filling_flavor_id else None
        bread = self.bread if self.bread_id else None
        if flavor and self.filling_base_id and not flavor.bases.filter(pk=self.filling_base_id).exists():
            errors["filling_flavor"] = "Ese sabor no se ofrece en esa base."
        if self.cake_type:
            if bread and self.cake_type not in bread.allowed_cake_types:
                errors["bread"] = "Ese pan no se ofrece en ese tipo de pastel."
            if flavor and self.cake_type not in flavor.allowed_cake_types:
                errors.setdefault("filling_flavor", "Ese sabor no se ofrece en ese tipo de pastel.")
        if bread and self.filling_base_id and bread.pricing_mode == BreadPricingMode.FULL_PRICE_PER_KG:
            errors["filling_base"] = "Un pan de precio completo trae su relleno: no lleva base."
        if (
            self.pk
            and self.sales_channel == SalesChannel.ORDER_ONLY
            and Inventory.objects.filter(
                kind=InventoryKind.SHOWCASE,
                offering__product=self,
                stock_date__gte=timezone.localdate(),
            ).exists()
        ):
            errors["sales_channel"] = (
                "Un producto solo por encargo no puede tener existencias de vitrina; "
                "borra las de hoy y de los días que siguen."
            )
        if errors:
            raise ValidationError(errors)


class CatalogPrice(models.Model):
    """Precio de catálogo de un grupo de productos: una celda de la tabla 2 de las reglas.

    Varias presentaciones comparten un precio (por ejemplo, todos los pasteles
    de sabor normal), así subirlo es una sola edición.
    """

    name = models.CharField("nombre", max_length=80, unique=True)
    amount = models.DecimalField("precio", max_digits=8, decimal_places=2)
    approx_weight_kg = models.DecimalField(
        "peso aproximado (kg)",
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Vacío si aún no se define.",
    )
    servings = models.PositiveSmallIntegerField(
        "personas que rinde", null=True, blank=True, help_text="Vacío si aún no se define."
    )
    sort_order = models.PositiveSmallIntegerField("orden", default=0)

    class Meta:
        verbose_name = "precio de catálogo"
        verbose_name_plural = "precios de catálogo"
        ordering = ["sort_order", "name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="catalogprice_amount_positive",
                violation_error_message="El precio debe ser mayor que 0.",
            ),
        ]

    def __str__(self):
        return self.name


class ProductOffering(OrderedOption):
    """Presentación a la venta de un producto (completo, rebanada, mini...) con su precio."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="offerings",
        verbose_name="producto",
    )
    presentation = models.CharField(
        "presentación", max_length=12, choices=Presentation.choices
    )
    price = models.ForeignKey(
        CatalogPrice,
        on_delete=models.PROTECT,
        related_name="offerings",
        verbose_name="precio de catálogo",
    )
    photo = models.CharField(
        "archivo de la foto",
        max_length=120,
        blank=True,
        validators=[photo_file_validator],
        help_text=(
            "Si tiene valor, reemplaza la foto del producto en esta presentación. "
            "Nombre del archivo estático del frontend, por ejemplo tres-leches-durazno-rebanada.webp."
        ),
    )

    class Meta:
        verbose_name = "presentación a la venta"
        verbose_name_plural = "presentaciones a la venta"
        ordering = ["product", "sort_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "presentation"],
                name="productoffering_unique_product_presentation",
                violation_error_message="Ese producto ya tiene esa presentación.",
            ),
        ]

    def __str__(self):
        return f"{self.product}, {self.get_presentation_display().lower()}"


# --- Inventario ---


class Inventory(models.Model):
    """Existencias por día: vitrina (por presentación) o pan para encargos de hoy.

    Es una sola tabla porque las reglas nombran así los dos usos. Lo que no se
    cargó para hoy no aparece en vitrina ni en rebanadas. El descuento es
    atómico, con `filter(pk=..., quantity__gte=n).update(quantity=F("quantity") - n)`:
    si no actualiza ninguna fila, está agotado.
    """

    # Los proxies del admin fijan el tipo; en `Inventory` queda sin fijar.
    forced_kind = None

    kind = models.CharField("tipo", max_length=10, choices=InventoryKind.choices)
    offering = models.ForeignKey(
        ProductOffering,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_rows",
        verbose_name="presentación",
    )
    bread = models.ForeignKey(
        Bread,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_rows",
        verbose_name="pan",
    )
    stock_date = models.DateField("día", default=timezone.localdate)
    quantity = models.PositiveIntegerField("cantidad")
    updated_at = models.DateTimeField("última actualización", auto_now=True)

    class Meta:
        verbose_name = "inventario"
        verbose_name_plural = "inventario"
        ordering = ["-stock_date", "id"]
        indexes = [
            models.Index(fields=["stock_date", "kind"], name="inventory_date_kind"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(kind=InventoryKind.SHOWCASE)
                    & Q(offering__isnull=False)
                    & Q(bread__isnull=True)
                )
                | (
                    Q(kind=InventoryKind.BREAD)
                    & Q(bread__isnull=False)
                    & Q(offering__isnull=True)
                ),
                name="inventory_showcase_or_bread",
                violation_error_message=(
                    "Una existencia es de vitrina (con presentación) o de pan (con pan), no de ambas."
                ),
            ),
            models.UniqueConstraint(
                fields=["offering", "stock_date"],
                condition=Q(offering__isnull=False),
                name="inventory_unique_offering_per_day",
                violation_error_message="Esa presentación ya tiene existencias para ese día.",
            ),
            models.UniqueConstraint(
                fields=["bread", "stock_date"],
                condition=Q(bread__isnull=False),
                name="inventory_unique_bread_per_day",
                violation_error_message="Ese pan ya tiene existencias para ese día.",
            ),
        ]

    def __str__(self):
        subject = self.offering if self.kind == InventoryKind.SHOWCASE else self.bread
        return f"{subject}, {self.stock_date:%d/%m/%Y}: {self.quantity}"

    def clean(self):
        super().clean()
        if self.forced_kind:
            self.kind = self.forced_kind
        errors = {}
        if self.kind == InventoryKind.SHOWCASE:
            if not self.offering_id:
                errors["offering"] = "Elige la presentación."
            elif self.offering.product.sales_channel == SalesChannel.ORDER_ONLY:
                errors["offering"] = "Un producto solo por encargo no tiene existencias de vitrina."
            if self.bread_id:
                errors["bread"] = "Las existencias de vitrina no llevan pan."
        elif self.kind == InventoryKind.BREAD:
            if not self.bread_id:
                errors["bread"] = "Elige el pan."
            if self.offering_id:
                errors["offering"] = "El pan de hoy no lleva presentación."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.forced_kind:
            self.kind = self.forced_kind
        super().save(*args, **kwargs)


class ShowcaseInventoryManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(kind=InventoryKind.SHOWCASE)


class BreadInventoryManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(kind=InventoryKind.BREAD)


class ShowcaseInventory(Inventory):
    """Existencias de vitrina: la vista del admin para el mostrador."""

    forced_kind = InventoryKind.SHOWCASE
    objects = ShowcaseInventoryManager()

    class Meta:
        proxy = True
        verbose_name = "vitrina de hoy"
        verbose_name_plural = "vitrina de hoy"


class BreadInventory(Inventory):
    """Pan disponible para encargos de vitrina del mismo día."""

    forced_kind = InventoryKind.BREAD
    objects = BreadInventoryManager()

    class Meta:
        proxy = True
        verbose_name = "pan de hoy"
        verbose_name_plural = "pan de hoy"
