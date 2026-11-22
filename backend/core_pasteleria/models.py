"""Tablas y relaciones del dominio (ORM sobre PostgreSQL)."""
import secrets
import unicodedata
import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import ArrayField, IntegerRangeField, RangeOperators
from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models, transaction
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


# Lo dicen el modelo y la API de la cuenta (D72) con las mismas palabras.
WHATSAPP_NEEDS_PHONE = "Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales."


class User(AbstractBaseUser, PermissionsMixin):
    """Cuenta del cliente (Google o correo y contraseña) y del personal.

    El correo único es el identificador; no hay username. Las cuentas de
    Google pueden no tener contraseña usable.
    """

    email = models.EmailField("correo", unique=True)
    is_active = models.BooleanField("activo", default=True)
    is_staff = models.BooleanField("es personal", default=False)
    # Datos del registro (D62). El nombre es obligatorio al registrarse con correo;
    # con Google sale de la cuenta de Google y puede quedar vacío.
    full_name = models.CharField("nombre completo", max_length=150, blank=True)
    phone = models.CharField(
        "teléfono o WhatsApp",
        max_length=10,
        blank=True,
        validators=[RegexValidator(r"^[0-9]{10}$", "Escribe 10 dígitos.")],
        help_text="10 dígitos, sin lada del país. Opcional.",
    )
    # Identificador estable de la cuenta de Google (`sub` del ID token). El correo de
    # Google puede cambiar; `sub`, no. Vacío (null) si nunca entró con Google.
    google_sub = models.CharField("cuenta de Google", max_length=255, null=True, blank=True, unique=True, editable=False)
    # Preferencia de "Datos y avisos" (D72): el sitio no manda WhatsApp; la pastelería escribe a mano al teléfono de
    # la cuenta. Sin teléfono no se puede marcar (restricción `user_whatsapp_needs_phone`).
    notify_whatsapp = models.BooleanField(
        "avisos por WhatsApp",
        default=False,
        help_text="El cliente pidió que también le avisen por WhatsApp, al teléfono de su cuenta.",
    )
    # Confirmación del correo (D76): vacío mientras la cuenta de correo y contraseña no abre el enlace que le llegó.
    # Sin confirmar no entra con su contraseña. Las de Google nacen confirmadas; las de antes de D76, también.
    email_verified_at = models.DateTimeField(
        "correo confirmado",
        null=True,
        blank=True,
        editable=False,
        help_text="Cuándo confirmó su correo con el enlace que le enviamos, o al entrar con Google.",
    )

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
            models.CheckConstraint(
                condition=Q(phone="") | Q(phone__regex=r"^[0-9]{10}$"),
                name="user_phone_ten_digits",
            ),
            models.CheckConstraint(
                condition=Q(notify_whatsapp=False) | ~Q(phone=""),
                name="user_whatsapp_needs_phone",
            ),
        ]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # Antes de validate_unique, para que el admin detecte duplicados que
        # solo difieren en mayúsculas.
        self.email = type(self).objects.normalize_email(self.email)
        if self.notify_whatsapp and not self.phone:
            raise ValidationError({"notify_whatsapp": WHATSAPP_NEEDS_PHONE})

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


class CakeDesignSize(models.TextChoices):
    """Tamaño de un pastel de "Diseña tu pastel" (tanda 2 de correcciones): por kilos (desde el mínimo de pedido), de
    vitrina o mini. Cada uno se cobra con su estrategia (`pricing_service.SIZE_PRICING_STRATEGIES`)."""

    BY_WEIGHT = "by_weight", "Por kilos"
    SHOWCASE = "showcase", "Pastel de vitrina"
    MINI = "mini", "Pastel mini"


class WaferShape(models.TextChoices):
    """Forma de la oblea del paso 7: una hoja (con ancho y alto propios) o un círculo."""

    SHEET = "sheet", "Hoja"
    CIRCLE = "circle", "Círculo"


class MessageArrangement(models.TextChoices):
    """Cómo se escribe el mensaje sobre la tapa: en línea recta o siguiendo un arco."""

    STRAIGHT = "straight", "Recto"
    ARC = "arc", "En arco"


class MessageColorMode(models.TextChoices):
    """De dónde sale el color del mensaje: negro, un tono de la cobertura o cualquier color que elija el cliente."""

    AUTO = "auto", "Automático"
    TONES = "tones", "Colores que combinan"
    CUSTOM = "custom", "Elegir un color"


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

    SMOOTH = "smooth", "Liso (crema)"
    JAM = "jam", "Mermelada (brillante, con semillas)"
    CARAMEL = "caramel", "Cajeta o caramelo (brillante y lisa)"
    FRUIT_SLICES = "fruit_slices", "Rebanadas de fruta"
    FRUIT_CHUNKS = "fruit_chunks", "Trozos de fruta"
    COOKIE_CHUNKS = "cookie_chunks", "Trozos de galleta"
    SPRINKLES = "sprinkles", "Granillo"
    CRUMBLES = "crumbles", "Grumitos"
    NUT_PIECES = "nut_pieces", "Trozos de nuez"
    ROUND_CHIPS = "round_chips", "Chispas redondas"


# Los estilos sin trozos: no piden el color de los trozos (liso, mermelada y cajeta).
PIECELESS_PREVIEW_STYLES = frozenset(
    {FillingPreviewStyle.SMOOTH, FillingPreviewStyle.JAM, FillingPreviewStyle.CARAMEL}
)


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


class FruitLayout(models.TextChoices):
    """Cómo va la fruta fresca en la tapa de la muestra del modelo (D86). Solo la dibuja la imagen del catálogo."""

    MOUND = "mound", "Montón al centro"
    RING = "ring", "Anillo junto a la orilla"
    ROWS = "rows", "En filas"
    DIAGONAL = "diagonal", "En filas diagonales que llenan la tapa"
    STRIPES = "stripes", "En franjas de atrás hacia el frente, con rosetones entre ellas"


class FruitKind(models.TextChoices):
    """Las frutas que sabe dibujar el modelo (`frontend/src/three/fruit.ts`). No se piden: solo van en la imagen del catálogo."""

    STRAWBERRY = "strawberry", "Fresa"
    APPLE = "apple", "Manzana roja"
    KIWI = "kiwi", "Kiwi"
    GRAPE = "grape", "Uva verde"
    PEACH = "peach", "Durazno en almíbar"
    PEAR = "pear", "Pera"
    STARFRUIT = "starfruit", "Carambola"
    PHYSALIS = "physalis", "Physalis (uchuva)"
    BANANA = "banana", "Plátano"
    PINEAPPLE = "pineapple", "Piña"
    APPLE_SLICE = "apple_slice", "Manzana en rodajas"


class SampleSideTexture(models.TextChoices):
    """La textura del costado de la cobertura en la imagen del catálogo (tanda 4b). Vacío: lisa."""

    LACE = "lace", "Encaje de duya (zigzag cerrado)"
    SPATULA = "spatula", "Marcas de espátula"
    RIDGES = "ridges", "Crestas diagonales"


class SampleDrizzle(models.TextChoices):
    """Los hilos de la imagen del catálogo (tanda 4b): encaje sobre la tapa o hilos sobre las piezas del borde. Vacío: sin hilos."""

    LACE = "lace", "Encaje sobre la tapa"
    THREADS = "threads", "Hilos sobre el borde de arriba"
    SCRIBBLE = "scribble", "Garabato en un lado de la tapa"


class SampleShells(models.TextChoices):
    """Dónde van las conchas de chocolate en la imagen del catálogo (tanda 4b). Vacío: sin conchas."""

    EDGE = "edge", "Alrededor del borde de arriba"
    TULIPS = "tulips", "Tulipanes cerrados alrededor del borde"
    TOP = "top", "Amontonadas en media tapa"
    BACK = "back", "Grandes, en la mitad de atrás"
    FULL = "full", "Cubriendo toda la tapa"


class SampleSideBits(models.TextChoices):
    """Lo que va pegado al costado en la imagen del catálogo (tanda 4b). Vacío: nada."""

    CRUMBS = "crumbs", "Migas de galleta (también en la tapa)"
    FLAKES = "flakes", "Virutas de chocolate"
    SHAVINGS = "shavings", "Virutas de chocolate grandes y tupidas"
    SEEDS = "seeds", "Semillas de la mermelada"


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
            "La dirección de la pastelería en una sola línea: calle y número, colonia, "
            "alcaldía, código postal y ciudad. Con ella, el sitio y los correos muestran "
            "el enlace \"Cómo llegar\" a Google Maps. Vacía, se muestra como pendiente."
        ),
    )
    whatsapp = models.CharField(
        "WhatsApp",
        max_length=WHATSAPP_MAX_DIGITS,
        blank=True,
        validators=[whatsapp_validator],
        help_text=(
            "El número de WhatsApp de la pastelería. Vacío, se muestra como pendiente. "
            "Escribe solo dígitos, con la lada del país y sin + ni "
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
        "precio de la oblea",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Vacío es PENDIENTE: la oblea se muestra desactivada con «Precio por confirmar» "
            "y no se puede pedir. Con 0 la oblea no cuesta."
        ),
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
    message_min_letter_cm = models.DecimalField(
        "alto mínimo de la letra del mensaje (cm)",
        max_digits=3,
        decimal_places=1,
        default=Decimal("1.5"),
        db_default=Decimal("1.5"),
        help_text=(
            "En todos los tamaños: la letra del mensaje no puede ser más chica. Si con este alto el mensaje no cabe "
            "en la tapa, el cliente tiene que acortarlo."
        ),
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
            models.CheckConstraint(
                condition=Q(message_min_letter_cm__gt=0),
                name="cakedesignsettings_min_letter_positive",
                violation_error_message="El alto mínimo de la letra debe ser mayor que 0.",
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


def _proposed_limit(verbose_name, default, help_text, **kwargs):
    """Un tope que la pastelería ajusta en el admin; su valor inicial es una propuesta (D63)."""
    return models.PositiveSmallIntegerField(
        verbose_name,
        default=default,
        db_default=default,
        help_text=f"{help_text} Propuesto: {default}; la pastelería puede ajustarlo.",
        **kwargs,
    )


class PolicySettings(SingletonSettings):
    """Políticas de la pastelería que el admin puede editar."""

    stand_return_days = models.PositiveSmallIntegerField("días para devolver la base")
    advance_percent = models.PositiveSmallIntegerField(
        "porcentaje de anticipo",
        default=50,
        db_default=50,
        help_text=(
            "Qué parte del pedido se paga hoy; el resto, el día de la entrega. "
            "El depósito de la base y el envío no entran: se pagan completos, aparte."
        ),
    )
    damaged_stand_policy = models.TextField(
        "qué pasa si la base regresa dañada",
        blank=True,
        help_text=(
            "PENDIENTE: la pastelería aún no lo define. Déjalo vacío; "
            "no pongas un valor supuesto."
        ),
    )
    # Topes de los pedidos en línea (D63, 14 de noviembre de 2026; lo decidió el usuario). Los valores iniciales son
    # propuestos: la pastelería puede ajustarlos aquí sin un despliegue.
    payment_window_minutes = _proposed_limit(
        "minutos para pagar un pedido",
        30,
        "Un pedido sin pagar se cancela pasados estos minutos, o al empezar su lapso si es antes.",
    )
    max_unpaid_orders_per_customer = _proposed_limit(
        "pedidos sin pagar por cliente",
        2,
        "Cuántos pedidos apartados sin pagar puede tener un cliente a la vez. Los que esperan cotización tienen su "
        "propio tope.",
    )
    max_days_ahead = _proposed_limit("días a futuro para reservar", 60, "Hasta cuántos días adelante se puede pedir.")
    max_pieces_per_line = _proposed_limit(
        "piezas por línea de encargo", 20, "Cuántas piezas de una presentación se encargan en una línea."
    )
    max_pieces_per_order = _proposed_limit(
        "piezas por pedido", 100, "Cuántas piezas lleva un pedido en total, sumando todas sus líneas."
    )
    # PENDIENTE de la pastelería (D63, ronda 2; lo decidió el usuario): sin valor, la cotización no vence.
    quote_expiry_hours = models.PositiveSmallIntegerField(
        "horas para cotizar un pedido",
        null=True,
        blank=True,
        help_text=(
            "Vacío es PENDIENTE: un pedido en pausa por cotización no vence. Con un valor, el pedido que sigue sin "
            "precio se cancela pasadas estas horas y devuelve su lapso."
        ),
    )
    max_quote_orders_per_customer = _proposed_limit(
        "pedidos en pausa por cotización por cliente", 1, "Cuántos pedidos esperando cotización tiene un cliente a la vez."
    )
    max_unpaid_showcase_pieces = _proposed_limit(
        "piezas de vitrina apartadas por cliente",
        10,
        "Cuántas piezas de la vitrina de hoy puede tener apartadas sin pagar un cliente, sumando sus pedidos.",
    )
    # Re-auditoría de la ronda 2 de D63 (lo decidió el usuario; las 24 horas las propuso el equipo).
    expired_showcase_cooldown_hours = _proposed_limit(
        "horas que cuenta la vitrina vencida",
        24,
        "Las piezas de la vitrina de un pedido que se canceló por vencido siguen contando para el tope de piezas del "
        "cliente durante estas horas: así una cuenta no la mantiene apartada dejando vencer pedido tras pedido. Una "
        "cancelación del personal no cuenta.",
    )
    # Envío de referencia (D70): la vigencia de la cotización sigue PENDIENTE de la pastelería (regla 9).
    reference_quote_valid_hours = models.PositiveSmallIntegerField(
        "horas de vigencia de una cotización por referencia",
        null=True,
        blank=True,
        help_text=(
            "Vacío es PENDIENTE: la cotización de un envío de referencia no vence. Con un valor, el cliente puede "
            "aceptarla hasta estas horas después de que la pastelería le pone precio."
        ),
    )
    # Cancelación por el cliente (D70, lo decidió el usuario el 15 de noviembre de 2026).
    customer_cancel_retention_percent = models.PositiveSmallIntegerField(
        "porcentaje que se retiene al cancelar un pedido pagado",
        default=50,
        db_default=50,
        help_text=(
            "Si el cliente cancela un pedido ya pagado, la pastelería retiene este porcentaje del total del pedido (sin "
            "el depósito de la base) y devuelve lo demás que se pagó. Sin pagar, cancelar no cuesta nada."
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
            models.CheckConstraint(
                condition=Q(advance_percent__gte=1) & Q(advance_percent__lte=100),
                name="policysettings_advance_percent_range",
                violation_error_message="El anticipo debe estar entre 1% y 100%.",
            ),
            models.CheckConstraint(
                condition=Q(payment_window_minutes__gt=0)
                & Q(max_unpaid_orders_per_customer__gt=0)
                & Q(max_days_ahead__gt=0)
                & Q(max_pieces_per_line__gt=0)
                & Q(max_pieces_per_order__gt=0)
                & Q(max_quote_orders_per_customer__gt=0)
                & Q(max_unpaid_showcase_pieces__gt=0),
                name="policysettings_order_limits_positive",
                violation_error_message="Los topes de los pedidos deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(quote_expiry_hours__isnull=True) | Q(quote_expiry_hours__gt=0),
                name="policysettings_quote_expiry_positive",
                violation_error_message="Las horas para cotizar deben ser más de 0, o vacías (PENDIENTE).",
            ),
            models.CheckConstraint(
                condition=Q(expired_showcase_cooldown_hours__gt=0),
                name="policysettings_showcase_cooldown_positive",
                violation_error_message="Las horas que cuenta la vitrina vencida deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(reference_quote_valid_hours__isnull=True) | Q(reference_quote_valid_hours__gt=0),
                name="policysettings_reference_quote_valid_positive",
                violation_error_message="Las horas de vigencia de una cotización deben ser más de 0, o vacías (PENDIENTE).",
            ),
            models.CheckConstraint(
                condition=Q(customer_cancel_retention_percent__lte=100),
                name="policysettings_cancel_retention_range",
                violation_error_message="El porcentaje que se retiene va de 0% a 100%.",
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
    # D63, 14 de noviembre de 2026 (lo decidió el usuario); valores propuestos.
    max_pending_images = _proposed_limit(
        "imágenes sin pedido por cliente",
        10,
        "Cuántas imágenes subidas que todavía no están en un pedido puede tener un cliente.",
    )
    max_image_megapixels = _proposed_limit(
        "megapíxeles por imagen",
        12,
        f"Más que esto se rechaza. No puede pasar de {settings.UPLOAD_HARD_LIMIT_MEGAPIXELS}, el tope duro del sitio. "
        "Subirlo de 12 exige revisar antes la memoria del dyno y WEB_CONCURRENCY: cada megapíxel ocupa unos 4 MB al "
        "abrir la imagen, por cada subida a la vez.",
        validators=[MinValueValidator(1), MaxValueValidator(settings.UPLOAD_HARD_LIMIT_MEGAPIXELS)],
    )
    daily_upload_mb = _proposed_limit(
        "MB subidos por cliente en 24 horas",
        25,
        "Suma de todas sus imágenes subidas en las últimas 24 horas, estén o no en un pedido.",
    )
    daily_upload_count = _proposed_limit(
        "imágenes subidas por cliente en 24 horas",
        20,
        "Cuántas imágenes sube un cliente en las últimas 24 horas, estén o no en un pedido.",
    )

    class Meta(SingletonSettings.Meta):
        verbose_name = "subidas"
        verbose_name_plural = "subidas"
        constraints = [
            *SingletonSettings.Meta.constraints,
            models.CheckConstraint(
                condition=Q(max_pending_images__gt=0)
                & Q(daily_upload_mb__gt=0)
                & Q(daily_upload_count__gt=0)
                & Q(max_image_megapixels__gte=1)
                & Q(max_image_megapixels__lte=settings.UPLOAD_HARD_LIMIT_MEGAPIXELS),
                name="uploadsettings_image_limits_range",
                violation_error_message=(
                    "Las imágenes sin pedido deben ser más de 0 y los megapíxeles, de 1 a "
                    f"{settings.UPLOAD_HARD_LIMIT_MEGAPIXELS}."
                ),
            ),
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
        help_text="Color del pan; en un pan de dos colores, el del pan que va encima del relleno en cada piso.",
    )
    preview_color_bottom = models.CharField(
        "color de abajo en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Solo para un pan de dos colores (choco-vainilla): el del pan que va debajo del relleno en cada piso. Vacío: un solo color.",
    )
    included_filling_preview_style = models.CharField(
        "cómo se ve el relleno incluido en la vista previa",
        max_length=20,
        choices=FillingPreviewStyle.choices,
        default=FillingPreviewStyle.SMOOTH,
        help_text=(
            "Solo para un pan con relleno incluido (Choco-pingüino, Red velvet): se ve desde que se elige el pan. "
            "Es crema (blanca o del color que se elige abajo); aquí se elige lo que lleva encima."
        ),
    )
    included_filling_preview_color = models.CharField(
        "color de la crema del relleno incluido en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=(
            "Solo para un pan con relleno incluido: el color de su crema (por ejemplo, café claro en Choco-pingüino). "
            "Vacío: crema pastelera blanca."
        ),
    )
    included_filling_preview_color_secondary = models.CharField(
        "color de los trozos del relleno incluido en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Color de las chispas, los trozos o el granillo del relleno incluido. Vacío si es liso.",
    )
    showcase_price = models.ForeignKey(
        "CatalogPrice",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="precio como pastel de vitrina",
        help_text=(
            "Solo para un pan con relleno incluido (Choco-pingüino, Red velvet): el precio de catálogo del pastel de "
            "vitrina armado con este pan en «Diseña tu pastel». Vacío: ese pan no se ofrece en el pastel de vitrina."
        ),
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
            models.CheckConstraint(
                condition=~Q(pricing_mode=BreadPricingMode.EXTRA_PER_KG) | Q(showcase_price__isnull=True),
                name="bread_showcase_price_only_with_included_filling",
                violation_error_message=(
                    "Un pan con incremento por kilo toma el precio de vitrina de la base del relleno: déjalo vacío."
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
    showcase_price = models.ForeignKey(
        "CatalogPrice",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="precio como pastel de vitrina",
        help_text=(
            "El precio de catálogo del pastel de vitrina armado con esta base en «Diseña tu pastel» (por ejemplo, "
            "«Pastel de sabor normal, completo»). Vacío: esta base no se ofrece en el pastel de vitrina."
        ),
    )
    available_in_mini = models.BooleanField(
        "disponible en el pastel mini",
        default=False,
        db_default=False,
        help_text="No hay pastel mini con queso ni con flan: solo la base Normal va marcada.",
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
        help_text=(
            "Liso, mermelada (brillante, con semillas), cajeta (brillante y lisa), con rebanadas de fruta, con trozos de fruta, con trozos de galleta, con granillo, con grumitos, "
            "con trozos de nuez o con chispas redondas."
        ),
    )
    preview_color_secondary = models.CharField(
        "color de los trozos en la vista previa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text="Color de las rebanadas, los trozos, el granillo o los grumitos más rojos. Vacío en un relleno liso.",
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


# Topes de un molde (D52): más allá es un dedazo del admin, no un molde. La base también los exige (así rechaza un NaN).
MOLD_MAX_KG = Decimal("100")
MOLD_MAX_CM = Decimal("150")


class CakeMold(models.Model):
    """Molde de la pastelería con los kilos que rinde y sus medidas (D52).

    La vista previa de "Diseña tu pastel" toma de aquí el tamaño del pastel
    según los kilos: la pastelería agrega un molde cuando compra uno. Un molde
    redondo lleva solo el diámetro; uno rectangular, el largo y el ancho. El alto
    no se guarda: es el mismo en la vista previa.
    """

    form = models.CharField("forma", max_length=12, choices=CakeShape.choices)
    kg = models.DecimalField(
        "kilos que rinde",
        max_digits=4,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(MOLD_MAX_KG)],
        help_text="Hasta 100 kg.",
    )
    length_cm = models.DecimalField(
        "diámetro o largo (cm)",
        max_digits=4,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(MOLD_MAX_CM)],
        help_text="El diámetro en un molde redondo; el largo en uno rectangular. Hasta 150 cm.",
    )
    width_cm = models.DecimalField(
        "ancho (cm)",
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(MOLD_MAX_CM)],
        help_text="Solo en un molde rectangular. Hasta 150 cm.",
    )

    class Meta:
        verbose_name = "molde"
        verbose_name_plural = "moldes"
        ordering = ["form", "kg"]
        constraints = [
            models.UniqueConstraint(
                fields=["form", "kg"],
                name="cakemold_unique_form_kg",
                violation_error_message="Ya hay un molde de esa forma para esos kilos.",
            ),
            models.CheckConstraint(
                condition=Q(kg__gt=0, kg__lte=MOLD_MAX_KG) & Q(length_cm__gt=0, length_cm__lte=MOLD_MAX_CM),
                name="cakemold_sizes_in_range",
                violation_error_message="Los kilos (hasta 100) y las medidas (hasta 150 cm) deben ser mayores que 0.",
            ),
            models.CheckConstraint(
                condition=~Q(form=CakeShape.ROUND) | Q(width_cm__isnull=True),
                name="cakemold_round_has_no_width",
                violation_error_message="Un molde redondo solo lleva el diámetro: deja el ancho vacío.",
            ),
            models.CheckConstraint(
                condition=~Q(form=CakeShape.RECTANGULAR)
                | (Q(width_cm__isnull=False) & Q(width_cm__gt=0) & Q(width_cm__lte=MOLD_MAX_CM)),
                name="cakemold_rectangular_needs_width",
                violation_error_message="Un molde rectangular lleva largo y ancho (hasta 150 cm).",
            ),
        ]

    def __str__(self):
        shape = "redondo" if self.form == CakeShape.ROUND else "rectangular"
        return f"Molde {shape} de {self.kg} kg"


class CoverageColor(OrderedOption):
    """Nombre de referencia de un color. El cliente elige cualquier color en "Diseña tu pastel".

    La lista ya no limita la cobertura, la decoración ni el mensaje: sirve para decir "parecido a <nombre>" en la
    revisión y en el carrito, con el nombre del color de la lista más cercano al elegido. La cobertura de crema
    pastelera es siempre la misma; su color es libre.
    """

    name = models.CharField("nombre", max_length=60, unique=True)
    slug = models.SlugField(
        "identificador",
        max_length=60,
        unique=True,
        help_text="No se cambia después de crearlo.",
    )
    preview_color = models.CharField(
        "color de referencia",
        max_length=7,
        validators=[hex_color_validator],
        help_text="El color que se compara con el que elige el cliente para nombrarlo.",
    )

    class Meta:
        verbose_name = "nombre de color de referencia"
        verbose_name_plural = "nombres de color de referencia"
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
    preview_flavor = models.ForeignKey(
        "FillingFlavor",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        limit_choices_to={"is_active": True},
        verbose_name="chispas del sabor",
        help_text=(
            "Solo para las chispas: el sabor de relleno cuyo granillo se dibuja (estilo y colores de ese sabor). "
            "Déjalo vacío si no son chispas o si salen de un pan."
        ),
    )
    preview_bread = models.ForeignKey(
        "Bread",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        limit_choices_to={"is_active": True},
        verbose_name="chispas del pan",
        help_text=(
            "Solo para las chispas: el pan cuyo relleno incluido se dibuja (por ejemplo, las chispas de Choco-pingüino). "
            "Déjalo vacío si no son chispas o si salen de un sabor."
        ),
    )
    accepts_color = models.BooleanField(
        "el cliente elige su color",
        default=False,
        db_default=False,
        help_text=(
            "Los diseños con duya y las rosas: el cliente elige automático o un color. Sin marcar, el pedido no "
            "acepta un color para esta decoración (regla 6.1)."
        ),
    )
    available_in_mini = models.BooleanField(
        "disponible en el pastel mini",
        default=False,
        db_default=False,
        help_text="El pastel mini es chico: solo lleva las decoraciones marcadas. Las demás salen desactivadas.",
    )
    mini_price = models.DecimalField(
        "precio en el pastel mini",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Solo para una decoración de precio fijo marcada para el mini (Rosas): su precio en el mini. Vacío es "
            "PENDIENTE: en el mini sale desactivada con «Precio por confirmar». Déjalo vacío; no pongas un valor supuesto."
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
            models.CheckConstraint(
                condition=Q(mini_price__isnull=True) | (Q(pricing=DecorationPricing.FIXED) & Q(mini_price__gt=0)),
                name="decorationoption_mini_price_only_when_fixed",
                violation_error_message="Solo una decoración de precio fijo lleva precio en el mini, mayor que 0.",
            ),
            models.CheckConstraint(
                condition=Q(preview_flavor__isnull=True) | Q(preview_bread__isnull=True),
                name="decorationoption_single_preview_source",
                violation_error_message="Elige el sabor o el pan de donde salen las chispas, no los dos.",
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


# La semilla de la `0050` copia lo que se ve en cada foto; el admin lo dice junto a cada dato que se observó.
OBSERVED_IN_PHOTO = "En las muestras de la semilla, observado en la foto; la pastelería puede corregirlo."
ONLY_IN_IMAGE = "Solo en la imagen del catálogo."
# Los rangos de los detalles de la imagen del catálogo (tanda 4b): fracción del radio de la tapa, del alto del pastel y tamaño.
SAMPLE_RING_WIDTH = (0.1, 0.9)
SAMPLE_BAND_HEIGHT = (0.03, 1.0)
SAMPLE_EDGE_SIZE = (0.5, 2.5)
SAMPLE_FRUIT_DENSITY = (1.0, 3.0)
SAMPLE_SPRINKLE_DENSITY = (1.0, 10.0)
SAMPLE_EDGE_INSET = (0.0, 0.3)
# Los detalles que van en pareja: (el que lo activa, el que lo completa, mensaje si falta el segundo, mensaje si falta el primero).
SAMPLE_DETAIL_PAIRS = (
    ("top_ring_color", "top_ring_width", "Escribe el ancho del anillo, o quita su color.", "Elige el color del anillo, o quita su ancho."),
    ("side_band_color", "side_band_height", "Escribe el alto de la franja, o quita su color.", "Elige el color de la franja, o quita su alto."),
    ("drizzle", "drizzle_color", "Elige el color de los hilos, o quita los hilos.", "Elige los hilos, o quita su color."),
    ("shells", "shell_color", "Elige el color de las conchas, o quita las conchas.", "Elige dónde van las conchas, o quita su color."),
    ("side_bits", "side_bits_color", "Elige el color de lo pegado al costado, o quítalo.", "Elige qué va pegado al costado, o quita su color."),
)


class ProductSampleDesign(models.Model):
    """La muestra del modelo de un pastel (D86): cómo se ve en el modelo 3D y la imagen fija que lo muestra en el catálogo.

    El tipo, el pan y el relleno son los del producto; aquí va lo demás: la cobertura, la decoración, el peinado y la fruta
    fresca. La fruta solo se dibuja en esta imagen: no se pide en "Diseña tu pastel". La imagen es un archivo estático que
    genera `frontend/scripts/render-models.mjs`; la tarjeta del catálogo y la portada la muestran en lugar de la foto solo
    con `show_model_in_catalog`. La ficha conserva la foto real.
    """

    product = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
        related_name="sample_design",
        verbose_name="producto",
    )
    coverage_color = models.CharField(
        "color de la cobertura",
        max_length=7,
        validators=[hex_color_validator],
        help_text=f"La crema pastelera de afuera, como en el paso 5, en #RRGGBB. {OBSERVED_IN_PHOTO}",
    )
    decoration = models.ForeignKey(
        DecorationOption,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name="decoración",
        # Sin `is_active`: una decoración que la pastelería desactiva no debe impedir guardar el producto; la API la da en `null`.
        limit_choices_to=~Q(pricing=DecorationPricing.QUOTE),
        help_text=f"La del paso 6; «Sin decoración» si no lleva. «Otra decoración» no se dibuja. {OBSERVED_IN_PHOTO}",
    )
    decoration_color = models.CharField(
        "color de la decoración",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Vacío es automático. Solo en las decoraciones con duya y las rosas. {OBSERVED_IN_PHOTO}",
    )
    fruit_layout = models.CharField(
        "cómo va la fruta",
        max_length=10,
        choices=FruitLayout.choices,
        blank=True,
        help_text=f"Vacío: sin fruta. La fruta solo va en la imagen del catálogo; no se pide. {OBSERVED_IN_PHOTO}",
    )
    fruits = ArrayField(
        models.CharField(max_length=20, choices=FruitKind.choices),
        verbose_name="frutas",
        default=list,
        blank=True,
        help_text=f"Las que se ven en la tapa, cada una una vez. {OBSERVED_IN_PHOTO}",
    )
    side_comb = models.BooleanField(
        "peinado lateral",
        default=True,
        help_text=f"Surcos horizontales en los costados, como el paso 5. {OBSERVED_IN_PHOTO}",
    )
    # Los detalles de la imagen del catálogo (tanda 4b): solo los dibuja la imagen fija, nunca "Diseña tu pastel".
    top_color = models.CharField(
        "color de la tapa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Vacío: la tapa es del color de la cobertura. Por ejemplo, glaseado amarillo sobre crema blanca. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    top_glossy = models.BooleanField(
        "tapa brillante",
        default=False,
        help_text=f"La tapa brilla como un glaseado de espejo. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    side_glossy = models.BooleanField(
        "costado brillante",
        default=False,
        help_text=f"El costado brilla como la cajeta. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    side_texture = models.CharField(
        "textura del costado",
        max_length=10,
        choices=SampleSideTexture.choices,
        blank=True,
        help_text=f"Vacío: lisa. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    top_ring_color = models.CharField(
        "color del anillo de la tapa",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Un anillo brillante de mermelada con el centro de la tapa a la vista. Vacío: sin anillo. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    top_ring_width = models.FloatField(
        "ancho del anillo",
        null=True,
        blank=True,
        validators=[MinValueValidator(SAMPLE_RING_WIDTH[0]), MaxValueValidator(SAMPLE_RING_WIDTH[1])],
        help_text=f"Parte del radio de la tapa, de la orilla hacia el centro (de 0.1 a 0.9). {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    side_band_color = models.CharField(
        "color de la franja de abajo",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=(
            "La parte de abajo del costado en otro color: glaseado pintado o crema que se derrama en la charola. "
            f"Vacío: sin franja. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}"
        ),
    )
    side_band_height = models.FloatField(
        "alto de la franja de abajo",
        null=True,
        blank=True,
        validators=[MinValueValidator(SAMPLE_BAND_HEIGHT[0]), MaxValueValidator(SAMPLE_BAND_HEIGHT[1])],
        help_text=f"Parte del alto del pastel (de 0.03 a 1). {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    drizzle = models.CharField(
        "hilos",
        max_length=10,
        choices=SampleDrizzle.choices,
        blank=True,
        help_text=f"Vacío: sin hilos. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    drizzle_color = models.CharField(
        "color de los hilos",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Chocolate o cajeta, en #RRGGBB. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    edge_size = models.FloatField(
        "tamaño de las piezas del borde",
        default=1.0,
        validators=[MinValueValidator(SAMPLE_EDGE_SIZE[0]), MaxValueValidator(SAMPLE_EDGE_SIZE[1])],
        help_text=(
            "Cuánto más grandes que en «Diseña tu pastel» son los rosetones o las conchas de duya del borde de arriba "
            f"(1 es igual; de 0.5 a 2.5): con piezas más grandes caben menos. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}"
        ),
    )
    shells = models.CharField(
        "conchas de chocolate",
        max_length=10,
        choices=SampleShells.choices,
        blank=True,
        help_text=f"Conchas o tulipanes de chocolate. Vacío: sin conchas. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    shell_color = models.CharField(
        "color de las conchas",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"El chocolate de las conchas, en #RRGGBB. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    shell_second_color = models.CharField(
        "segundo color de las conchas",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Vacío: todas del mismo color. Con él, se alternan (chocolate blanco y oscuro). {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    dusting_color = models.CharField(
        "color del espolvoreado",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"Canela o azúcar glass sobre la tapa y las conchas. Vacío: sin espolvoreado. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    side_bits = models.CharField(
        "pegado al costado",
        max_length=10,
        choices=SampleSideBits.choices,
        blank=True,
        help_text=f"Vacío: nada. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    side_bits_color = models.CharField(
        "color de lo pegado al costado",
        max_length=7,
        blank=True,
        validators=[hex_color_validator],
        help_text=f"En #RRGGBB. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}",
    )
    fruit_density = models.FloatField(
        "fruta tupida",
        default=1.0,
        validators=[MinValueValidator(SAMPLE_FRUIT_DENSITY[0]), MaxValueValidator(SAMPLE_FRUIT_DENSITY[1])],
        help_text=(
            "1 es el montón de siempre, que cubre del 40 al 60 % de la tapa; 2 llena toda la parte libre de la tapa, con más piezas "
            f"y más alto, sin el centro vacío; 3, más alto y con piezas más grandes (de 1 a 3). {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}"
        ),
    )
    edge_inset = models.FloatField(
        "piezas del borde más adentro",
        default=0.0,
        validators=[MinValueValidator(SAMPLE_EDGE_INSET[0]), MaxValueValidator(SAMPLE_EDGE_INSET[1])],
        help_text=(
            "Cuánto se meten hacia el centro los rosetones del borde o las conchas de chocolate, en parte del radio de la tapa "
            f"(0 es sobre la orilla; de 0 a 0.3). La fruta se queda dentro de ellas. {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}"
        ),
    )
    sprinkle_density = models.FloatField(
        "chispas tupidas",
        default=1.0,
        validators=[MinValueValidator(SAMPLE_SPRINKLE_DENSITY[0]), MaxValueValidator(SAMPLE_SPRINKLE_DENSITY[1])],
        help_text=(
            "Cuántas veces más chispas que en «Diseña tu pastel» lleva el costado, con la decoración de chispas "
            f"(1 es igual; de 1 a 10). {ONLY_IN_IMAGE} {OBSERVED_IN_PHOTO}"
        ),
    )
    model_image = models.CharField(
        "archivo de la imagen del modelo",
        max_length=120,
        blank=True,
        validators=[photo_file_validator],
        help_text=(
            "Nombre del archivo estático que genera el script de imágenes, por ejemplo tres-leches-de-durazno-modelo.webp. "
            "Vacío si aún no se genera."
        ),
    )
    show_model_in_catalog = models.BooleanField(
        "mostrar la imagen del modelo en el catálogo",
        default=False,
        help_text="La tarjeta del catálogo y la portada muestran la imagen del modelo en lugar de la foto. La ficha conserva la foto.",
    )

    class Meta:
        verbose_name = "muestra del modelo"
        verbose_name_plural = "muestras del modelo"
        constraints = [
            models.CheckConstraint(
                condition=Q(show_model_in_catalog=False) | ~Q(model_image=""),
                name="productsampledesign_shown_has_image",
                violation_error_message="Para mostrarla en el catálogo, escribe el archivo de la imagen del modelo.",
            ),
            models.CheckConstraint(
                condition=(Q(fruit_layout="") & Q(fruits__len=0)) | (~Q(fruit_layout="") & Q(fruits__len__gt=0)),
                name="productsampledesign_fruit_with_layout",
                violation_error_message="La fruta va con su acomodo, y un acomodo lleva fruta.",
            ),
            models.CheckConstraint(
                condition=Q(fruits__contained_by=list(FruitKind.values)),
                name="productsampledesign_fruits_known",
                violation_error_message="Hay una fruta que el modelo no sabe dibujar.",
            ),
        ]

    def __str__(self):
        return f"Muestra del modelo de {self.product}"

    def clean(self):
        super().clean()
        errors = {}
        try:
            # En el alta desde el admin, el producto puede no tener id todavía: la muestra ya lo trae en memoria.
            product = self.product
        except Product.DoesNotExist:
            product = None
        if product is not None and product.category != ProductCategory.CAKE:
            errors["product"] = "Solo un pastel lleva muestra del modelo."
        decoration = self.decoration if self.decoration_id else None
        if decoration is not None:
            if decoration.pricing == DecorationPricing.QUOTE:
                errors["decoration"] = "«Otra decoración» no se dibuja: elige un diseño o «Sin decoración»."
            elif self.decoration_color and not decoration.accepts_color:
                errors["decoration_color"] = "Esta decoración no lleva color propio: deja el color vacío."
        if self.fruits and not self.fruit_layout:
            errors["fruit_layout"] = "Elige cómo va la fruta, o quita la fruta."
        if self.fruit_layout and not self.fruits:
            errors["fruits"] = "Elige al menos una fruta, o quita cómo va."
        elif len(set(self.fruits or [])) != len(self.fruits or []):
            errors["fruits"] = "Cada fruta va una sola vez."
        if self.show_model_in_catalog and not self.model_image:
            errors["model_image"] = "Para mostrarla en el catálogo, escribe el archivo de la imagen del modelo."
        for first, second, needs_second, needs_first in SAMPLE_DETAIL_PAIRS:
            has_first = getattr(self, first) not in ("", None)
            has_second = getattr(self, second) not in ("", None)
            if has_first and not has_second:
                errors.setdefault(second, needs_second)
            elif has_second and not has_first:
                errors.setdefault(first, needs_first)
        if self.shell_second_color and not self.shells:
            errors.setdefault("shell_second_color", "El segundo color va con las conchas: elige dónde van, o quítalo.")
        if errors:
            raise ValidationError(errors)


class CatalogPrice(models.Model):
    """Precio de catálogo de un grupo de productos: una celda de la tabla 2 de las reglas.

    Varias presentaciones comparten un precio (por ejemplo, todos los pasteles
    de sabor normal), así subirlo es una sola edición.
    """

    name = models.CharField("nombre", max_length=80, unique=True)
    amount = models.DecimalField(
        "precio",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Vacío es PENDIENTE: el catálogo muestra «[Precio por confirmar]» y esa presentación no se puede pedir. "
            "Déjalo vacío; no pongas un valor supuesto."
        ),
    )
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
                condition=Q(amount__isnull=True) | Q(amount__gt=0),
                name="catalogprice_amount_positive",
                violation_error_message="El precio debe ser mayor que 0.",
            ),
        ]

    def __str__(self):
        return self.name


# Los tamaños con fila en `DesignSize`: siempre redondos, de 1 piso y sin base.
SMALL_DESIGN_SIZES = (CakeDesignSize.SHOWCASE, CakeDesignSize.MINI)


class DesignSize(models.Model):
    """Molde y precio del pastel de vitrina y del mini en "Diseña tu pastel" (tanda 2 de correcciones).

    El precio, el peso y las personas no se repiten aquí: salen del precio de catálogo al que apunta (el mini, de
    «Pastel mini»; la vitrina, del pastel de sabor normal, que es su referencia y su "desde"). Aquí viven las medidas
    del molde (siempre redondo y de 1 piso) y, en la vitrina, la referencia contra la que se cobra la diferencia por
    kilo de lo elegido. El pastel por kilos no lleva fila: sus límites están en la configuración y sus moldes en
    `CakeMold`.
    """

    code = models.CharField(
        "tamaño",
        max_length=12,
        choices=[(size.value, size.label) for size in SMALL_DESIGN_SIZES],
        unique=True,
    )
    catalog_price = models.ForeignKey(
        CatalogPrice,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name="precio de catálogo",
        help_text=(
            "De aquí salen el peso, las personas y el precio: el del mini, siempre; el de la vitrina, como «desde» y "
            "como peso con que se cobra la diferencia por kilo."
        ),
    )
    diameter_cm = models.DecimalField(
        "diámetro del molde (cm)",
        max_digits=4,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(MOLD_MAX_CM)],
    )
    height_cm = models.DecimalField(
        "alto (cm)",
        max_digits=4,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(MOLD_MAX_CM)],
    )
    reference_cake_type = models.CharField(
        "tipo de pastel de referencia",
        max_length=20,
        choices=CakeType.choices,
        blank=True,
        help_text="Solo en la vitrina: la diferencia por kilo se cobra contra este tipo, este pan y la base sin sabor propio.",
    )
    reference_bread = models.ForeignKey(
        Bread,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="pan de referencia",
        help_text="Solo en la vitrina.",
    )

    class Meta:
        verbose_name = "tamaño de vitrina o mini"
        verbose_name_plural = "tamaños de vitrina y mini"
        ordering = ["code"]
        constraints = [
            models.CheckConstraint(
                condition=Q(code__in=[size.value for size in SMALL_DESIGN_SIZES]),
                name="designsize_code_known",
                violation_error_message="Ese tamaño no existe.",
            ),
            models.CheckConstraint(
                condition=Q(diameter_cm__gt=0, diameter_cm__lte=MOLD_MAX_CM) & Q(height_cm__gt=0, height_cm__lte=MOLD_MAX_CM),
                name="designsize_mold_in_range",
                violation_error_message="El diámetro y el alto deben ser mayores que 0 (hasta 150 cm).",
            ),
            models.CheckConstraint(
                condition=~Q(code=CakeDesignSize.SHOWCASE)
                | (~Q(reference_cake_type="") & Q(reference_bread__isnull=False)),
                name="designsize_showcase_needs_reference",
                violation_error_message="La vitrina lleva su tipo de pastel y su pan de referencia.",
            ),
        ]

    def __str__(self):
        return self.get_code_display()


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
            else:
                errors.update(self._one_cake_per_flavor_errors())
            if self.bread_id:
                errors["bread"] = "Las existencias de vitrina no llevan pan."
        elif self.kind == InventoryKind.BREAD:
            if not self.bread_id:
                errors["bread"] = "Elige el pan."
            if self.offering_id:
                errors["offering"] = "El pan de hoy no lleva presentación."
        if errors:
            raise ValidationError(errors)

    # Regla 2 y D60: en la vitrina hay un solo pastel de cada sabor, completo o rebanado.
    # También lo respeta `product_repo.restock_showcase` al reintegrar un pedido cancelado.
    MAX_WHOLE_CAKES_PER_DAY = 1
    ONE_WHOLE_CAKE_MESSAGE = (
        "En la vitrina hay un solo pastel completo de cada sabor: pon 1, o 0 si ya se vendió."
    )
    WHOLE_AND_SLICES_MESSAGES = {
        Presentation.WHOLE: (
            "Ese día este producto ya se vende en rebanadas (es el rebanado). No va completo y en "
            "rebanadas el mismo día: para venderlo completo, borra antes sus rebanadas de ese día."
        ),
        Presentation.SLICE: (
            "Ese día este producto ya está completo en la vitrina. No va completo y en rebanadas el "
            "mismo día: para rebanarlo, pon el completo en 0 si ya se vendió, o bórralo si no salió."
        ),
    }

    def _one_cake_per_flavor_errors(self) -> dict:
        """Un pastel por sabor (D60), en los productos que se venden en rebanadas.

        El completo lleva como mucho 1 pieza por día, y un producto no tiene un completo
        en la vitrina y rebanadas el mismo día: el que tiene rebanadas cargadas es el
        rebanado. "Dejar rebanarlo" (decisión de la dueña): un completo ya vendido (en 0)
        no impide rebanar otro pastel del mismo sabor ese día; una rebanada en 0 sí
        cuenta (el rebanado ya se acabó y el completo no vuelve). Una presentación de
        rebanada inactiva también cuenta para saber si el producto se vende en
        rebanadas. El mini y lo que no tiene rebanada (gelatina de molde, tarta) quedan
        fuera. Las 8 piezas, las 15 gelatinas y las 10 rebanadas son referencias, no topes.
        """
        offering = self.offering
        if offering.presentation not in self.WHOLE_AND_SLICES_MESSAGES:
            return {}
        sold_in_slices = offering.presentation == Presentation.SLICE or (
            ProductOffering.objects.filter(product_id=offering.product_id, presentation=Presentation.SLICE).exists()
        )
        if not sold_in_slices:
            return {}
        self.lock_product(offering.product_id)
        errors = {}
        whole = offering.presentation == Presentation.WHOLE
        if whole and self.quantity is not None and self.quantity > self.MAX_WHOLE_CAKES_PER_DAY:
            errors["quantity"] = self.ONE_WHOLE_CAKE_MESSAGE
        others = Inventory.objects.filter(
            kind=InventoryKind.SHOWCASE,
            offering__product_id=offering.product_id,
            offering__presentation=Presentation.SLICE if whole else Presentation.WHOLE,
            stock_date=self.stock_date,
        ).exclude(pk=self.pk)
        if not whole:
            # Un completo vendido no estorba: deja rebanar otro pastel del mismo sabor.
            others = others.filter(quantity__gt=0)
        conflict = (not whole or (self.quantity or 0) > 0) and self.stock_date and others.exists()
        if conflict:
            # Sin campo: en la lista de la vitrina solo se edita la cantidad.
            errors[NON_FIELD_ERRORS] = self.WHOLE_AND_SLICES_MESSAGES[offering.presentation]
        return errors

    @staticmethod
    def lock_product(product_id) -> None:
        """Bloquea el producto hasta el fin de la transacción: dos altas a la vez del completo
        y de las rebanadas se validan una tras otra. El admin valida y guarda dentro de una
        transacción (`changeform_view` y la lista de `InventoryAdmin`); fuera de una, como en
        `full_clean()` desde la consola, no hay a quién esperar y no se bloquea.
        """
        if transaction.get_connection().in_atomic_block:
            Product.objects.select_for_update().filter(pk=product_id).values_list("pk", flat=True).first()

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


# --- Pedidos ---
#
# Un pedido junta las líneas del carrito: encargos del catálogo, piezas de la vitrina de hoy y
# diseños de "Diseña tu pastel". El servidor lo crea y recalcula todo (`services/orders/`). El
# estado cambia por servicios o por el personal en el registro básico del admin, solo por las
# transiciones de `order_status.ALLOWED_TRANSITIONS`; nunca por un PATCH genérico de la API.


class OrderStatus(models.TextChoices):
    """Estados del pedido (reglas de negocio, sección 12), con su etiqueta en español."""

    AWAITING_PAYMENT = "awaiting_payment", "Apartado, falta tu pago"
    RECEIVED = "received", "Recibido"
    IN_PREPARATION = "in_preparation", "En preparación"
    READY_FOR_DELIVERY = "ready_for_delivery", "Listo para entregar"
    DELIVERED = "delivered", "Entregado"
    CANCELLED = "cancelled", "Cancelado"
    AWAITING_QUOTE = "awaiting_quote", "En pausa por cotización"


class CancellationReason(models.TextChoices):
    """Por qué se canceló un pedido: la pausa de la vitrina solo cuenta los vencidos (re-auditoría de la ronda 2)."""

    EXPIRED = "expired", "Venció sin pagarse"
    STAFF = "staff", "Lo canceló el personal"
    # D70: el cliente lo canceló desde su cuenta.
    CUSTOMER = "customer", "Lo canceló el cliente"


class Fulfillment(models.TextChoices):
    """Cómo se entrega el pedido (regla 8). A domicilio se acuerda por WhatsApp hasta tener la API de rutas."""

    PICKUP = "pickup", "Recoger en la pastelería"
    DELIVERY = "delivery", "Entrega a domicilio"


class OrderLineKind(models.TextChoices):
    """Tipo de una línea del pedido; cada uno sigue su regla de anticipación (sección 1)."""

    ORDER = "order", "Encargo"
    SHOWCASE = "showcase", "Vitrina de hoy"
    DESIGN = "design", "Diseña tu pastel"
    # D70: el precio que cotizó la pastelería para un envío de referencia; nace al aceptar la cotización.
    REFERENCE = "reference", "Pedido con foto de referencia"


class Occasion(models.TextChoices):
    """Ocasión del pastel (regla 6.4): opcional, no cambia el precio."""

    BIRTHDAY = "birthday", "Cumpleaños"
    WEDDING = "wedding", "Boda"
    QUINCEANERA = "quinceanera", "XV años"
    BAPTISM = "baptism", "Bautizo"
    FIRST_COMMUNION = "first_communion", "Primera comunión"
    BABY_SHOWER = "baby_shower", "Baby shower"
    GRADUATION = "graduation", "Graduación"
    ANNIVERSARY = "anniversary", "Aniversario"
    OTHER = "other", "Otra"


class CustomerImagePurpose(models.TextChoices):
    """Para qué subió el cliente la imagen. El envío de referencia agregará su valor."""

    DECORATION = "decoration", "Otra decoración"
    WAFER = "wafer", "Oblea"
    # D70: las fotos de un envío de referencia (regla 9).
    REFERENCE = "reference", "Foto de referencia"


# Lo único que se guarda: la imagen ya vuelta a codificar por el servidor.
IMAGE_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")
# Un color de comida ya normalizado por el servidor (`design_layout.normalize_hex_color`).
HEX_COLOR_SQL = "^#[0-9a-f]{6}$"


class CustomerImage(models.Model):
    """Imagen que sube un cliente, guardada en PostgreSQL (Heroku borra el disco en cada reinicio).

    El servidor la abre con Pillow y la vuelve a codificar sin metadatos; el nombre original se
    conserva limpio, solo para mostrarlo. El id es un `uuid4`: no se adivina ni se enumera. Sale
    solo por el endpoint con permisos, a su dueño o al personal.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="images", verbose_name="cliente"
    )
    purpose = models.CharField("para qué", max_length=12, choices=CustomerImagePurpose.choices)
    content = models.BinaryField("imagen")
    content_type = models.CharField("tipo", max_length=12)
    width = models.PositiveIntegerField("ancho (px)")
    height = models.PositiveIntegerField("alto (px)")
    size_bytes = models.PositiveIntegerField("tamaño (bytes)")
    original_name = models.CharField("nombre original", max_length=120, blank=True)
    created_at = models.DateTimeField("subida", auto_now_add=True)
    # D70: el envío de referencia que la lleva; vacío mientras no está en uno.
    reference_request = models.ForeignKey(
        "ReferenceRequest",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="images",
        verbose_name="envío de referencia",
    )

    class Meta:
        verbose_name = "imagen de cliente"
        verbose_name_plural = "imágenes de clientes"
        constraints = [
            models.CheckConstraint(
                condition=Q(purpose__in=CustomerImagePurpose.values),
                name="customerimage_purpose_known",
                violation_error_message="Ese uso de la imagen no existe.",
            ),
            models.CheckConstraint(
                condition=Q(content_type__in=IMAGE_CONTENT_TYPES),
                name="customerimage_content_type_known",
                violation_error_message="Solo se guardan imágenes JPEG, PNG o WebP.",
            ),
        ]

    def __str__(self):
        return f"Imagen {self.pk}"


class DeliverySlot(models.Model):
    """Un lapso de la agenda (regla 1). La fila se crea con el primer pedido del lapso y es el
    candado del cupo: la creación del pedido la bloquea antes de contar los pedidos activos."""

    date = models.DateField("día")
    starts_at = models.TimeField("empieza")
    ends_at = models.TimeField("termina")

    class Meta:
        verbose_name = "lapso de entrega"
        verbose_name_plural = "lapsos de entrega"
        ordering = ["date", "starts_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["date", "starts_at"],
                name="deliveryslot_unique_start",
                violation_error_message="Ya existe ese lapso.",
            ),
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")),
                name="deliveryslot_ends_after_start",
                violation_error_message="El lapso debe terminar después de empezar.",
            ),
        ]

    def __str__(self):
        return f"{self.date:%d/%m/%Y} {self.starts_at:%H:%M}–{self.ends_at:%H:%M}"


def _money(verbose_name, **kwargs):
    return models.DecimalField(verbose_name, max_digits=10, decimal_places=2, **kwargs)


class CakeDesign(models.Model):
    """El diseño de "Diseña tu pastel" de una línea del pedido, como lo revalidó y calculó el servidor.

    Nada sale del snapshot del cliente sin pasar por su validación: los kilos salen de las
    personas, el precio de `pricing_service`, la base de `warranty_service` y el "parecido a" de
    los colores, de la lista de nombres de referencia.
    """

    cake_size = models.CharField(
        "tamaño",
        max_length=12,
        choices=CakeDesignSize.choices,
        default=CakeDesignSize.BY_WEIGHT,
        db_default=CakeDesignSize.BY_WEIGHT,
    )
    # Por kilos: las que pidió el cliente. Vitrina y mini: las que rinde, del catálogo al hacer el pedido (vacías si la
    # pastelería no las ha definido).
    people = models.PositiveSmallIntegerField("personas", null=True, blank=True)
    kg = models.PositiveSmallIntegerField("kilos", null=True, blank=True, help_text="Solo en un pastel por kilos.")
    source_product = models.ForeignKey(
        "Product",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="pastel de vitrina de origen",
        help_text="Con «Personalizar este pastel» de un pastel de vitrina: su tipo, pan y relleno no cambian.",
    )
    form = models.CharField("forma", max_length=12, choices=CakeShape.choices)
    tiers = models.PositiveSmallIntegerField("pisos")
    cake_type = models.CharField("tipo de pastel", max_length=20, choices=CakeType.choices)
    bread = models.ForeignKey(Bread, on_delete=models.PROTECT, related_name="+", verbose_name="pan")
    filling_base = models.ForeignKey(
        FillingBase, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="base de relleno"
    )
    first_flavor = models.ForeignKey(
        FillingFlavor, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="sabor"
    )
    second_flavor = models.ForeignKey(
        FillingFlavor, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="segundo sabor"
    )
    coverage_color = models.CharField("color de la cobertura", max_length=7)
    coverage_color_name = models.CharField(
        "parecido a", max_length=60, blank=True, help_text="Lo calcula el servidor; vacío si ningún nombre se parece."
    )
    # Tanda 4: surcos horizontales en los costados de la cobertura. Va por omisión; los diseños de antes quedan peinados,
    # que es como la pastelería termina sus pasteles.
    side_comb = models.BooleanField(
        "peinado lateral",
        default=True,
        db_default=True,
        help_text="Surcos horizontales en los costados de la cobertura. Sin él, los costados van lisos.",
    )
    decoration = models.ForeignKey(
        DecorationOption, on_delete=models.PROTECT, related_name="+", verbose_name="decoración"
    )
    decoration_color = models.CharField(
        "color de la decoración", max_length=7, null=True, blank=True, help_text="Vacío: automático."
    )
    decoration_color_name = models.CharField("parecido a (decoración)", max_length=60, blank=True)
    decoration_image = models.OneToOneField(
        CustomerImage,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="decoration_design",
        verbose_name="imagen de la decoración",
    )
    message = models.JSONField("mensaje", null=True, blank=True)
    wafer = models.BooleanField("oblea", default=False)
    wafer_layout = models.JSONField("acomodo de la oblea", null=True, blank=True)
    wafer_image = models.OneToOneField(
        CustomerImage,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="wafer_design",
        verbose_name="imagen de la oblea",
    )
    occasion = models.CharField("ocasión", max_length=20, choices=Occasion.choices, blank=True)
    price_per_kg = _money("precio por kilo", null=True, blank=True, help_text="Solo en un pastel por kilos.")
    cake_subtotal = _money("pastel")
    wafer_price = _money("oblea")
    decoration_price = _money("decoración")
    total = _money(
        "total",
        help_text=(
            "Sin el depósito de la base. Con una decoración por cotizar, sin la decoración hasta que la pastelería le "
            "pone precio."
        ),
    )
    requires_quote = models.BooleanField("por cotizar", default=False)
    stand = models.ForeignKey(
        CakeStand, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="base"
    )
    stand_deposit = _money("depósito de la base")

    class Meta:
        verbose_name = "diseño de pastel"
        verbose_name_plural = "diseños de pastel"
        constraints = [
            models.CheckConstraint(
                condition=Q(coverage_color__regex=HEX_COLOR_SQL),
                name="cakedesign_coverage_color_hex",
                violation_error_message="El color de la cobertura va como #rrggbb.",
            ),
            models.CheckConstraint(
                condition=Q(decoration_color__isnull=True) | Q(decoration_color__regex=HEX_COLOR_SQL),
                name="cakedesign_decoration_color_hex",
                violation_error_message="El color de la decoración va como #rrggbb o vacío.",
            ),
            models.CheckConstraint(
                condition=Q(tiers__gt=0)
                & (Q(kg__isnull=True) | Q(kg__gt=0))
                & (Q(people__isnull=True) | Q(people__gt=0)),
                name="cakedesign_size_positive",
                violation_error_message="Las personas, los kilos y los pisos deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(cake_size__in=CakeDesignSize.values),
                name="cakedesign_cake_size_known",
                violation_error_message="Ese tamaño no existe.",
            ),
            # Por kilos: kilos, personas y precio por kilo. Vitrina y mini: redondo, de 1 piso, sin kilos y sin base.
            models.CheckConstraint(
                condition=(
                    Q(cake_size=CakeDesignSize.BY_WEIGHT)
                    & Q(kg__isnull=False)
                    & Q(people__isnull=False)
                    & Q(price_per_kg__isnull=False)
                )
                | (
                    ~Q(cake_size=CakeDesignSize.BY_WEIGHT)
                    & Q(kg__isnull=True)
                    & Q(price_per_kg__isnull=True)
                    & Q(form=CakeShape.ROUND)
                    & Q(tiers=1)
                    & Q(stand__isnull=True)
                    & Q(stand_deposit=0)
                ),
                name="cakedesign_cake_size_shape",
                violation_error_message=(
                    "Un pastel por kilos lleva kilos y personas; uno de vitrina o mini es redondo, de 1 piso y sin base."
                ),
            ),
            models.CheckConstraint(
                condition=Q(source_product__isnull=True) | Q(cake_size=CakeDesignSize.SHOWCASE),
                name="cakedesign_source_product_is_showcase",
                violation_error_message="Solo un pastel de vitrina sale de un producto.",
            ),
            models.CheckConstraint(
                condition=~Q(cake_size=CakeDesignSize.MINI) | Q(wafer=False),
                name="cakedesign_mini_has_no_wafer",
                violation_error_message="El pastel mini no lleva oblea.",
            ),
            models.CheckConstraint(
                condition=Q(wafer=True) | (Q(wafer_layout__isnull=True) & Q(wafer_image__isnull=True)),
                name="cakedesign_wafer_parts_need_wafer",
                violation_error_message="El acomodo y la imagen de la oblea exigen la oblea.",
            ),
        ]

    def __str__(self):
        if self.cake_size == CakeDesignSize.BY_WEIGHT:
            return f"Pastel de {self.kg} kg"
        return self.get_cake_size_display()


def new_note_token():
    """Token de la nota en PDF y su QR (regla 11): no adivinable, nunca el id ni un hash del id."""
    return secrets.token_urlsafe(32)


class Order(models.Model):
    """Pedido de un cliente. Montos, base, anticipo y estado los fija el servidor al crearlo."""

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders", verbose_name="cliente"
    )
    status = models.CharField("estado", max_length=20, choices=OrderStatus.choices)
    status_changed_at = models.DateTimeField("último cambio de estado")
    fulfillment = models.CharField("entrega", max_length=10, choices=Fulfillment.choices)
    delivery_slot = models.ForeignKey(
        DeliverySlot, on_delete=models.PROTECT, related_name="orders", verbose_name="lapso de entrega"
    )
    # Quién recoge (D66, decisión A del usuario). La API los exige; vacíos solo en los pedidos de antes de la `0036`.
    pickup_name = models.CharField("nombre de quien recoge", max_length=150, blank=True)
    pickup_phone = models.CharField(
        "teléfono de quien recoge",
        max_length=10,
        blank=True,
        validators=[RegexValidator(r"^[0-9]{10}$", "Escribe 10 dígitos.")],
        help_text="10 dígitos, sin lada del país.",
    )
    subtotal = _money("pedido", help_text="Sin la base ni el envío.")
    stand_deposit = _money("depósitos de las bases")
    delivery_fee = _money("envío")
    # Vacíos mientras el pedido espera cotización: no se cobra nada hasta que la pastelería ponga el precio.
    advance_percent = models.PositiveSmallIntegerField("porcentaje de anticipo", null=True, blank=True)
    advance = _money("anticipo", null=True, blank=True)
    pay_today = _money("se paga hoy", null=True, blank=True)
    pay_on_delivery = _money("se paga en la entrega", null=True, blank=True)
    paid_in_full = _money(
        "se paga completo", null=True, blank=True, help_text="Lo de la vitrina de hoy: entra completo en el anticipo."
    )
    quoted_decoration_price = _money(
        "precio de la decoración por cotizar",
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text=(
            "Solo con el pedido en pausa por cotización: al guardarlo, el servidor suma la decoración, recalcula el "
            "pago y el pedido pasa a «Apartado, falta tu pago»."
        ),
    )
    payment_due_at = models.DateTimeField(
        "pagar antes de", null=True, blank=True, help_text="Solo con el pedido apartado: después se cancela."
    )
    cancellation_reason = models.CharField(
        "motivo de la cancelación", max_length=10, choices=CancellationReason.choices, blank=True
    )
    idempotency_key = models.CharField("llave de idempotencia", max_length=64)
    # Se crea con el pedido (tabla vacía): agregarlo después con filas pediría una migración en tres pasos.
    note_token = models.CharField("token de la nota", max_length=64, unique=True, default=new_note_token, editable=False)
    created_at = models.DateTimeField("creado", auto_now_add=True)
    updated_at = models.DateTimeField("actualizado", auto_now=True)

    class Meta:
        verbose_name = "pedido"
        verbose_name_plural = "pedidos"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["delivery_slot", "status"], name="order_slot_status")]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                name="order_unique_idempotency_key",
                violation_error_message="Ya existe un pedido con esa llave.",
            ),
            models.CheckConstraint(
                condition=Q(status__in=OrderStatus.values),
                name="order_status_known",
                violation_error_message="Ese estado no existe.",
            ),
            models.CheckConstraint(
                condition=Q(fulfillment__in=Fulfillment.values),
                name="order_fulfillment_known",
                violation_error_message="Esa forma de entrega no existe.",
            ),
            models.CheckConstraint(
                condition=Q(cancellation_reason="") | Q(cancellation_reason__in=CancellationReason.values),
                name="order_cancellation_reason_known",
                violation_error_message="Ese motivo de cancelación no existe.",
            ),
            models.CheckConstraint(
                condition=Q(pickup_phone="") | Q(pickup_phone__regex=r"^[0-9]{10}$"),
                name="order_pickup_phone_ten_digits",
                violation_error_message="El teléfono de quien recoge lleva 10 dígitos.",
            ),
            models.CheckConstraint(
                condition=Q(subtotal__gte=0) & Q(stand_deposit__gte=0) & Q(delivery_fee__gte=0),
                name="order_amounts_non_negative",
                violation_error_message="Los montos no pueden ser negativos.",
            ),
        ]

    def __str__(self):
        return f"Pedido {self.pk}"


class OrderItem(models.Model):
    """Línea del pedido: una presentación del catálogo (encargo o vitrina de hoy) o un diseño."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items", verbose_name="pedido")
    position = models.PositiveSmallIntegerField("orden")
    kind = models.CharField("tipo", max_length=10, choices=OrderLineKind.choices)
    offering = models.ForeignKey(
        ProductOffering, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="presentación"
    )
    design = models.OneToOneField(
        CakeDesign, on_delete=models.PROTECT, null=True, blank=True, related_name="item", verbose_name="diseño"
    )
    # Un encargo para hoy consume pan del día (D30): se guarda para devolverlo si el pedido se cancela.
    bread = models.ForeignKey(
        Bread, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="pan del día que consumió"
    )
    # Lo que se vendió, como estaba al crear el pedido.
    product_name = models.CharField("producto", max_length=80, blank=True)
    presentation = models.CharField("presentación", max_length=12, choices=Presentation.choices, blank=True)
    quantity = models.PositiveSmallIntegerField("cantidad")
    unit_price = _money("precio por pieza")
    line_total = _money("importe")

    class Meta:
        verbose_name = "línea del pedido"
        verbose_name_plural = "líneas del pedido"
        ordering = ["order", "position"]
        constraints = [
            models.UniqueConstraint(fields=["order", "position"], name="orderitem_unique_position"),
            models.CheckConstraint(
                condition=(
                    Q(kind=OrderLineKind.DESIGN) & Q(design__isnull=False) & Q(offering__isnull=True) & Q(quantity=1)
                )
                | (
                    Q(kind__in=[OrderLineKind.ORDER, OrderLineKind.SHOWCASE])
                    & Q(offering__isnull=False)
                    & Q(design__isnull=True)
                    & Q(quantity__gte=1)
                )
                | (
                    Q(kind=OrderLineKind.REFERENCE)
                    & Q(offering__isnull=True)
                    & Q(design__isnull=True)
                    & Q(quantity=1)
                ),
                name="orderitem_offering_or_design",
                violation_error_message=(
                    "Una línea es una presentación del catálogo, un diseño o una cotización aceptada, no varias."
                ),
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.product_name or 'diseño'} × {self.quantity}"


# --- Pagos (D68) ---
#
# Un pago es un intento de cobro de lo que el pedido paga hoy (`Order.pay_today`, regla 10): el cliente lo inicia con
# un método (`POST orders/<id>/payment/`) y la pasarela lo confirma por un webhook verificado; el efectivo lo registra
# el personal en el admin. Las restricciones únicas hacen imposible el doble registro: una llave de idempotencia por
# pedido, un id de la pasarela por método y, por pedido, un solo pago que cuenta (`succeeded`).


class PaymentMethod(models.TextChoices):
    """Cómo paga el cliente (regla 10). Es la llave de `PAYMENT_GATEWAY_REGISTRY`."""

    MERCADOPAGO = "mercadopago", "Mercado Pago"
    STRIPE = "stripe", "Tarjeta (Stripe)"
    CASH = "cash", "Efectivo en la pastelería"


class PaymentStatus(models.TextChoices):
    """En qué va el intento de pago. `succeeded` y `refund_required` ya no cambian."""

    PENDING = "pending", "Esperando el pago"
    SUCCEEDED = "succeeded", "Pagado"
    FAILED = "failed", "Rechazado"
    REFUND_REQUIRED = "refund_required", "Cobrado sin pedido vigente: reembolsar"


class PaymentRefundReason(models.TextChoices):
    """Por qué un cobro aprobado no se aplicó al pedido y el personal debe reembolsarlo desde la pasarela."""

    ORDER_NOT_PAYABLE = "order_not_payable", "El pedido ya estaba cancelado, pagado o sin lugar en su horario"
    AMOUNT_MISMATCH = "amount_mismatch", "El monto no coincide con lo que se paga hoy"
    CURRENCY_MISMATCH = "currency_mismatch", "La moneda no es MXN"
    # D70: el cliente canceló un pedido pagado; se devuelve lo pagado menos lo que retiene la pastelería.
    CUSTOMER_CANCELLED = "customer_cancelled", "El cliente canceló: devolver lo pagado menos lo retenido"


class Payment(models.Model):
    """Un intento de cobro de un pedido. Los montos y el estado los fija el servidor, nunca el cliente.

    `checkout_id` es lo que el servidor creó en la pasarela (la preferencia de Mercado Pago o el PaymentIntent de
    Stripe); `provider_payment_id`, el pago que la pasarela confirmó (en Stripe es el mismo PaymentIntent). El
    `client_secret` de Stripe no se guarda: se vuelve a pedir a Stripe en un reintento.
    """

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments", verbose_name="pedido")
    method = models.CharField("método", max_length=12, choices=PaymentMethod.choices)
    status = models.CharField("estado", max_length=16, choices=PaymentStatus.choices)
    refund_reason = models.CharField(
        "por qué reembolsar", max_length=20, choices=PaymentRefundReason.choices, blank=True
    )
    amount = _money("monto", help_text="Lo que se pidió cobrar; al confirmarse, lo que la pasarela cobró.")
    currency = models.CharField("moneda", max_length=3, default="MXN")
    idempotency_key = models.CharField("llave de idempotencia", max_length=64, blank=True)
    checkout_id = models.CharField("id del cobro en la pasarela", max_length=100, blank=True)
    provider_payment_id = models.CharField("id del pago en la pasarela", max_length=100, blank=True)
    redirect_url = models.URLField("enlace de pago", max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="registró el cobro",
    )
    created_at = models.DateTimeField("creado", auto_now_add=True)
    updated_at = models.DateTimeField("actualizado", auto_now=True)

    class Meta:
        verbose_name = "pago"
        verbose_name_plural = "pagos"
        ordering = ["-created_at", "-pk"]
        permissions = [("register_cash_payment", "Puede registrar el cobro en efectivo de un pedido")]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="payment_unique_idempotency_key",
                violation_error_message="Ya existe un pago de este pedido con esa llave.",
            ),
            models.UniqueConstraint(
                fields=["method", "checkout_id"],
                condition=~Q(checkout_id=""),
                name="payment_unique_checkout",
                violation_error_message="Ese cobro de la pasarela ya está registrado.",
            ),
            models.UniqueConstraint(
                fields=["method", "provider_payment_id"],
                condition=~Q(provider_payment_id=""),
                name="payment_unique_provider_payment",
                violation_error_message="Ese pago de la pasarela ya está registrado.",
            ),
            models.UniqueConstraint(
                fields=["order"],
                condition=Q(status="succeeded"),
                name="payment_one_success_per_order",
                violation_error_message="Este pedido ya tiene un pago registrado.",
            ),
            models.CheckConstraint(
                condition=Q(method__in=PaymentMethod.values),
                name="payment_method_known",
                violation_error_message="Ese método de pago no existe.",
            ),
            models.CheckConstraint(
                condition=Q(status__in=PaymentStatus.values),
                name="payment_status_known",
                violation_error_message="Ese estado del pago no existe.",
            ),
            models.CheckConstraint(
                condition=Q(refund_reason="") | Q(refund_reason__in=PaymentRefundReason.values),
                name="payment_refund_reason_known",
                violation_error_message="Ese motivo de reembolso no existe.",
            ),
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="payment_amount_non_negative",
                violation_error_message="El monto no puede ser negativo.",
            ),
        ]

    def __str__(self):
        return f"Pago {self.pk} del pedido {self.order_id}"


# --- Bases prestadas (D69) ---
#
# Un préstamo por cada diseño del pedido que lleva base con depósito (regla 7). Lo crea `StandLoanObserver` al entrar el
# pedido en `delivered` (regla 12: fecha límite = entrega + `PolicySettings.stand_return_days`) y lo cierra el evento
# "base devuelta", que emite solo `warranty_service.register_stand_return` cuando el personal con permiso registra la
# devolución en el admin (D64). Nadie escribe el estado a mano.


class StandLoanStatus(models.TextChoices):
    """Seguimiento de la base (reglas de negocio, sección 12), con su etiqueta en español."""

    ON_LOAN = "on_loan", "Prestada"
    RETURNED = "returned", "Devuelta"


class StandLoan(models.Model):
    """Una base prestada con su depósito retenido, su fecha límite y, al volver, quién la recibió."""

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="stand_loans", verbose_name="pedido")
    # Un préstamo es de un diseño o del pastel de un envío de referencia aceptado (D70), nunca de los dos.
    design = models.OneToOneField(
        CakeDesign,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stand_loan",
        verbose_name="diseño del pastel",
    )
    reference_request = models.OneToOneField(
        "ReferenceRequest",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stand_loan",
        verbose_name="envío de referencia",
    )
    stand = models.ForeignKey(CakeStand, on_delete=models.PROTECT, related_name="+", verbose_name="tamaño de base")
    deposit = _money("depósito retenido")
    status = models.CharField("estado", max_length=10, choices=StandLoanStatus.choices)
    delivered_on = models.DateField("entregada el")
    due_date = models.DateField("devolver antes del")
    returned_at = models.DateTimeField("devuelta el", null=True, blank=True)
    returned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="recibió la base",
    )
    deposit_refunded = models.BooleanField("depósito reembolsado", default=False)
    created_at = models.DateTimeField("creado", auto_now_add=True)

    class Meta:
        verbose_name = "base prestada"
        verbose_name_plural = "bases prestadas"
        ordering = ["status", "due_date", "pk"]
        permissions = [("register_stand_return", "Puede registrar la devolución de una base")]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=StandLoanStatus.values),
                name="standloan_status_known",
                violation_error_message="Ese estado de la base no existe.",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status=StandLoanStatus.ON_LOAN)
                    & Q(returned_at__isnull=True)
                    & Q(returned_by__isnull=True)
                    & Q(deposit_refunded=False)
                )
                | (Q(status=StandLoanStatus.RETURNED) & Q(returned_at__isnull=False) & Q(deposit_refunded=True)),
                name="standloan_return_consistent",
                violation_error_message="Una base devuelta lleva su fecha y el depósito reembolsado; una prestada, no.",
            ),
            models.CheckConstraint(
                condition=Q(due_date__gte=F("delivered_on")),
                name="standloan_due_after_delivery",
                violation_error_message="La fecha límite no puede ser antes de la entrega.",
            ),
            models.CheckConstraint(
                condition=Q(deposit__gt=0),
                name="standloan_deposit_positive",
                violation_error_message="Solo se presta una base con depósito.",
            ),
            models.CheckConstraint(
                condition=(Q(design__isnull=False) & Q(reference_request__isnull=True))
                | (Q(design__isnull=True) & Q(reference_request__isnull=False)),
                name="standloan_one_cake",
                violation_error_message="Una base prestada es de un diseño o de un envío de referencia, no de los dos.",
            ),
        ]

    def __str__(self):
        return f"Base del pedido {self.order_id}"


# --- Envío de referencia (D70) ---
#
# El cliente manda hasta `UploadSettings.max_reference_images` fotos con lo que quiere (regla 9) y no paga nada. El
# personal con `core_pasteleria.set_reference_quote` le pone precio y nota en el admin (D64), y la solicitud pasa de
# `in_review` a `quote_ready`. Al aceptarla, el servidor crea un pedido normal en `awaiting_payment` con una línea del
# precio cotizado (`OrderLineKind.REFERENCE`) y la solicitud queda `accepted`, ligada a ese pedido.


class ReferenceRequestStatus(models.TextChoices):
    """Estados del envío de referencia (reglas de negocio, secciones 9 y 12), con su etiqueta en español."""

    IN_REVIEW = "in_review", "En revisión"
    QUOTE_READY = "quote_ready", "Cotización lista"
    ACCEPTED = "accepted", "Aceptada"
    CANCELLED = "cancelled", "Cancelada"


REFERENCE_TEXT_MAX_LENGTH = 1000


class ReferenceRequest(models.Model):
    """Una solicitud de cotización con fotos de referencia. Precio, nota y estado los fija el servidor o el personal."""

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reference_requests", verbose_name="cliente"
    )
    status = models.CharField("estado", max_length=12, choices=ReferenceRequestStatus.choices)
    status_changed_at = models.DateTimeField("último cambio de estado")
    description = models.TextField("qué tomar de la foto", max_length=REFERENCE_TEXT_MAX_LENGTH)
    occasion = models.CharField("ocasión", max_length=20, choices=Occasion.choices, blank=True)
    people = models.PositiveSmallIntegerField("personas")
    # El sabor y la base (D70, decisión del usuario del 15 de noviembre de 2026): las opciones de los pasos 2 a 4 de
    # "Diseña tu pastel", revisadas con sus reglas (4.7), y la base que toca a los kilos de las personas (3.1 y 7).
    # Vacíos solo en las solicitudes de antes de la `0040`.
    cake_type = models.CharField("tipo de pastel", max_length=20, choices=CakeType.choices, blank=True)
    bread = models.ForeignKey(
        Bread, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="pan"
    )
    filling_base = models.ForeignKey(
        FillingBase, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="base de relleno"
    )
    first_flavor = models.ForeignKey(
        FillingFlavor, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="sabor"
    )
    second_flavor = models.ForeignKey(
        FillingFlavor, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="segundo sabor"
    )
    kg = models.PositiveSmallIntegerField("kilos", null=True, blank=True, help_text="Salen de las personas (regla 3.1).")
    stand = models.ForeignKey(
        CakeStand, on_delete=models.PROTECT, null=True, blank=True, related_name="+", verbose_name="base"
    )
    stand_deposit = _money(
        "depósito de la base",
        default=Decimal("0.00"),
        db_default=Decimal("0.00"),
        help_text="Se paga completo al aceptar, aparte del precio cotizado (regla 10).",
    )
    event_date = models.DateField("fecha del evento")
    budget = _money("presupuesto aproximado", null=True, blank=True)
    quoted_price = _money(
        "precio cotizado",
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text=(
            "El precio del pastel según la referencia. Al guardarlo, la solicitud pasa a «Cotización lista» y el "
            "cliente recibe un correo."
        ),
    )
    quote_note = models.TextField(
        "nota de la pastelería", max_length=REFERENCE_TEXT_MAX_LENGTH, blank=True, help_text="La ve el cliente."
    )
    quoted_at = models.DateTimeField("cotizada el", null=True, blank=True)
    quoted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="cotizó",
    )
    order = models.OneToOneField(
        Order,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reference_request",
        verbose_name="pedido",
    )
    idempotency_key = models.CharField("llave de idempotencia", max_length=64)
    created_at = models.DateTimeField("enviada", auto_now_add=True)

    class Meta:
        verbose_name = "envío de referencia"
        verbose_name_plural = "envíos de referencia"
        ordering = ["-created_at", "-pk"]
        permissions = [("set_reference_quote", "Puede poner el precio de un envío de referencia")]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                name="referencerequest_unique_idempotency_key",
                violation_error_message="Ya existe una solicitud con esa llave.",
            ),
            models.CheckConstraint(
                condition=Q(status__in=ReferenceRequestStatus.values),
                name="referencerequest_status_known",
                violation_error_message="Ese estado de la solicitud no existe.",
            ),
            models.CheckConstraint(
                condition=Q(people__gt=0),
                name="referencerequest_people_positive",
                violation_error_message="Las personas deben ser más de 0.",
            ),
            models.CheckConstraint(
                condition=Q(budget__isnull=True) | Q(budget__gte=0),
                name="referencerequest_budget_non_negative",
                violation_error_message="El presupuesto no puede ser negativo.",
            ),
            models.CheckConstraint(
                condition=(Q(status=ReferenceRequestStatus.IN_REVIEW) & Q(quoted_price__isnull=True))
                | (
                    Q(status__in=[ReferenceRequestStatus.QUOTE_READY, ReferenceRequestStatus.ACCEPTED])
                    & Q(quoted_price__gt=0)
                    & Q(quoted_at__isnull=False)
                )
                | Q(status=ReferenceRequestStatus.CANCELLED),
                name="referencerequest_quote_consistent",
                violation_error_message="Una cotización lista o aceptada lleva su precio y su fecha; una en revisión, no.",
            ),
            models.CheckConstraint(
                condition=(Q(status=ReferenceRequestStatus.ACCEPTED) & Q(order__isnull=False))
                | (~Q(status=ReferenceRequestStatus.ACCEPTED) & Q(order__isnull=True)),
                name="referencerequest_accepted_has_order",
                violation_error_message="Solo una solicitud aceptada tiene pedido, y siempre lo tiene.",
            ),
        ]

    def __str__(self):
        return f"Solicitud {self.pk}"
