"""Registro de modelos en el admin de Django.

Excepción a la regla de capas: el admin consulta el ORM directamente (D18).
"""
from datetime import datetime

from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.contrib.auth.models import Group
from django.core.exceptions import NON_FIELD_ERRORS, PermissionDenied, ValidationError
from django.db import transaction
from django.shortcuts import redirect
from django.http import HttpResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from django.utils.safestring import mark_safe

from .models import (
    Bread,
    BreadInventory,
    CakeDesign,
    CakeDesignSettings,
    CakeMold,
    CakeStand,
    CakeType,
    CatalogPrice,
    CoverageColor,
    DecorationOption,
    DecorationPricing,
    DeliveryFeeBand,
    FillingBase,
    FillingFlavor,
    FillingPreviewStyle,
    FillingPrice,
    Inventory,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    SalesChannel,
    ShowcaseInventory,
    StandLoan,
    StandLoanStatus,
    PolicySettings,
    Product,
    ProductOffering,
    ReferenceRequest,
    ReferenceRequestStatus,
    StoreSettings,
    TierRecommendation,
    UploadSettings,
    User,
    WaferShape,
)
from .services import customer_image_service, warranty_service
from .services.catalog_service import HOME_FEATURED_LIMIT
from .services.errors import DomainValidationError
from .services.orders import order_status, quote_service, reference_service
from .services.payments import payment_service


class CustomUserCreationForm(AdminUserCreationForm):
    """Alta de usuario por correo (el formulario de Django pide username)."""

    class Meta(AdminUserCreationForm.Meta):
        model = User
        fields = ("email",)
        field_classes = {}


class CustomUserChangeForm(UserChangeForm):
    """Edición de usuario por correo (el formulario de Django pide username)."""

    class Meta(UserChangeForm.Meta):
        model = User
        field_classes = {}


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    customer_fields = ("full_name", "phone", "notify_whatsapp")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        # Los cambia el cliente en "Datos y avisos" (D72); aquí solo se ven.
        ("Datos y avisos", {"fields": customer_fields}),
        (
            "Permisos",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        # `email_verified_at` (D76) lo pone el enlace del correo o Google; aquí solo se ve.
        ("Fechas importantes", {"fields": ("last_login", "email_verified_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "usable_password", "password1", "password2"),
            },
        ),
    )
    list_display = ("email", "is_staff", "is_active")
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")
    search_fields = ("email",)
    ordering = ("email",)

    # Campos que dan privilegios: solo un superusuario puede tocarlos.
    privilege_fields = ("is_staff", "is_superuser", "groups", "user_permissions")

    def get_queryset(self, request):
        """Quien no es superusuario no ve (ni edita ni borra) al personal.

        Sin esto, un miembro del personal con permiso de cambiar usuarios
        podría darse privilegios a sí mismo o tomar la cuenta de otro.
        """
        users = super().get_queryset(request)
        if request.user.is_superuser:
            return users
        return users.filter(is_staff=False, is_superuser=False)

    def get_readonly_fields(self, request, obj=None):
        readonly = (*super().get_readonly_fields(request, obj), *self.customer_fields, "email_verified_at")
        if request.user.is_superuser:
            return readonly
        # El correo identifica la cuenta y sirve para recuperarla: solo un
        # superusuario lo cambia.
        email = ("email",) if obj is not None else ()
        return (*readonly, *self.privilege_fields, *email)

    def has_add_permission(self, request):
        """Solo un superusuario da de alta usuarios desde el admin.

        El alta pide una contraseña, y quedaría una cuenta de cliente con una
        clave que el personal conoce.
        """
        return request.user.is_superuser and super().has_add_permission(request)

    def user_change_password(self, request, id, form_url=""):
        """Solo un superusuario cambia la contraseña de otra cuenta."""
        if not request.user.is_superuser:
            raise PermissionDenied
        return super().user_change_password(request, id, form_url)


# El GroupAdmin por defecto deja a quien tenga `change_group` darse a su grupo
# todos los permisos. Los grupos y sus permisos son solo del superusuario.
admin.site.unregister(Group)


@admin.register(Group)
class RestrictedGroupAdmin(GroupAdmin):
    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


# --- Configuraciones de una sola fila ---


class SingletonAdmin(admin.ModelAdmin):
    """Admin de una configuración con una sola fila.

    La lista abre directo la única fila; no se puede borrar, y solo se puede
    agregar si la tabla quedó vacía (la migración de datos crea la fila).
    """

    empty_value_display = "PENDIENTE"

    def has_add_permission(self, request):
        return not self.model.objects.exists() and super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        if not self.has_view_or_change_permission(request):
            raise PermissionDenied
        row = self.model.objects.first()
        if row is None:
            return super().changelist_view(request, extra_context)
        opts = self.model._meta
        return redirect(reverse(f"admin:{opts.app_label}_{opts.model_name}_change", args=[row.pk]))


@admin.register(StoreSettings)
class StoreSettingsAdmin(SingletonAdmin):
    # Un campo nuevo del modelo debe agregarse aquí: si no, el admin no lo muestra
    # (una prueba lo revisa).
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "store_opens_at",
                    "store_closes_at",
                    "first_slot_starts_at",
                    "last_slot_starts_at",
                    "slot_minutes",
                    "max_orders_per_slot",
                    "custom_lead_days",
                    "same_day_showcase_lead_hours",
                    "free_delivery_from_kg",
                )
            },
        ),
        ("Datos del negocio (pie del sitio)", {"fields": ("address", "whatsapp")}),
    )


@admin.register(CakeDesignSettings)
class CakeDesignSettingsAdmin(SingletonAdmin):
    pass


QUOTE_EXPIRY_LABEL = "Vigencia de la cotización"
QUOTE_EXPIRY_PENDING = "PENDIENTE, no vence"


def quote_expiry_notice() -> str:
    """Cuánto espera un pedido sin precio antes de cancelarse; mientras la pastelería no lo fije, el marcador PENDIENTE."""
    hours = PolicySettings.objects.values_list("quote_expiry_hours", flat=True).first()
    return QUOTE_EXPIRY_PENDING if hours is None else f"{hours} horas sin precio; después se cancela"


@admin.register(PolicySettings)
class PolicySettingsAdmin(SingletonAdmin):
    readonly_fields = ("quote_expiry_notice",)

    @admin.display(description=QUOTE_EXPIRY_LABEL)
    def quote_expiry_notice(self, obj):
        return quote_expiry_notice()


@admin.register(UploadSettings)
class UploadSettingsAdmin(SingletonAdmin):
    pass


# --- Opciones y precios de "Diseña tu pastel" ---


class ReadOnlySlugMixin:
    """El identificador lo usan la vista previa y otras pantallas: no cambia tras crearlo."""

    def get_readonly_fields(self, request, obj=None):
        readonly = super().get_readonly_fields(request, obj)
        return (*readonly, "slug") if obj is not None else readonly


class CakeTypesMixin:
    """Muestra `allowed_cake_types` como casillas, con al menos un tipo elegido."""

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name == "allowed_cake_types":
            return forms.MultipleChoiceField(
                label=db_field.verbose_name.capitalize(),
                choices=CakeType.choices,
                widget=forms.CheckboxSelectMultiple,
            )
        return super().formfield_for_dbfield(db_field, request, **kwargs)


class BreadForm(forms.ModelForm):
    """Formulario de cambio del pan.

    La regla vive aquí y no en `Bread.clean()`: un error con clave de campo en el
    modelo revienta (500) al guardar desde la lista, cuyo formulario solo trae
    `sort_order` e `is_active`, si la fila ya estaba así.
    """

    def clean(self):
        cleaned = super().clean()
        # Sin el color de arriba, el de abajo no se usa: la vista previa pinta un solo color.
        if cleaned.get("preview_color_bottom") and not cleaned.get("preview_color") and "preview_color" not in self.errors:
            self.add_error(
                "preview_color_bottom",
                'Un pan de dos colores también lleva el color de arriba ("color en la vista previa"). Escríbelo o borra este.',
            )
        # Lo mismo que en los sabores: un relleno incluido con trozos y sin su color se vería liso.
        style = cleaned.get("included_filling_preview_style")
        # El caso inverso: un pan sin relleno incluido no tiene relleno que dibujar con ese estilo. Un color sin estilo
        # (liso) no se usa: se borra al guardar para que no quede un dato viejo.
        if "included_filling" in cleaned and "included_filling_preview_style" in cleaned and not cleaned["included_filling"]:
            if style and style != FillingPreviewStyle.SMOOTH:
                self.add_error(
                    "included_filling_preview_style",
                    'Este pan no lleva relleno incluido: deja el estilo en "Liso" o escribe su relleno incluido.',
                )
        if style == FillingPreviewStyle.SMOOTH and cleaned.get("included_filling_preview_color_secondary"):
            cleaned["included_filling_preview_color_secondary"] = ""
        if (
            style
            and style != FillingPreviewStyle.SMOOTH
            and not cleaned.get("included_filling_preview_color_secondary")
            and "included_filling_preview_color_secondary" not in self.errors
        ):
            self.add_error(
                "included_filling_preview_color_secondary",
                'Escribe el color de los trozos del relleno incluido o elige el estilo "Liso".',
            )
        return cleaned


class FillingFlavorForm(forms.ModelForm):
    """Formulario de cambio del sabor; ver `BreadForm` para por qué la regla no está en el modelo."""

    def clean(self):
        cleaned = super().clean()
        # Un estilo con trozos sin su color no dibuja nada: se ve liso aunque el admin diga otra cosa.
        style = cleaned.get("preview_style")
        if style and style != FillingPreviewStyle.SMOOTH and not cleaned.get("preview_color_secondary") and "preview_color_secondary" not in self.errors:
            self.add_error("preview_color_secondary", 'Escribe el color de los trozos o elige el estilo "Liso".')
        return cleaned


@admin.register(Bread)
class BreadAdmin(ReadOnlySlugMixin, CakeTypesMixin, admin.ModelAdmin):
    form = BreadForm
    list_display = ("name", "pricing_mode", "price_per_kg", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    list_filter = ("pricing_mode", "is_active")
    search_fields = ("name",)


@admin.register(FillingBase)
class FillingBaseAdmin(ReadOnlySlugMixin, admin.ModelAdmin):
    list_display = ("name", "max_flavors", "combined_extra_per_kg", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    search_fields = ("name",)


@admin.register(FillingFlavor)
class FillingFlavorAdmin(ReadOnlySlugMixin, CakeTypesMixin, admin.ModelAdmin):
    form = FillingFlavorForm
    list_display = ("name", "is_combinable", "preview_style", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    list_filter = ("bases", "is_combinable", "preview_style", "is_active")
    filter_horizontal = ("bases",)
    search_fields = ("name",)


@admin.register(FillingPrice)
class FillingPriceAdmin(admin.ModelAdmin):
    list_display = ("base", "flavor", "cake_type", "price_per_kg")
    list_filter = ("cake_type", "base")


@admin.register(TierRecommendation)
class TierRecommendationAdmin(admin.ModelAdmin):
    list_display = ("tiers", "recommended_min_kg")


@admin.register(CakeMold)
class CakeMoldAdmin(admin.ModelAdmin):
    list_display = ("form", "kg", "length_cm", "width_cm")
    list_filter = ("form",)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Aviso suave (no bloquea): un molde con más kilos no debería medir menos que uno con menos kilos de su forma.
        for other in CakeMold.objects.filter(form=obj.form).exclude(pk=obj.pk):
            bigger = other.kg > obj.kg
            smaller_in_length = (other.length_cm < obj.length_cm) if bigger else (other.length_cm > obj.length_cm)
            smaller_in_width = (
                obj.width_cm is not None
                and other.width_cm is not None
                and ((other.width_cm < obj.width_cm) if bigger else (other.width_cm > obj.width_cm))
            )
            if (other.kg != obj.kg) and (smaller_in_length or smaller_in_width):
                self.message_user(
                    request,
                    f"Revisa las medidas: el {obj} y el {other} no crecen juntos con los kilos "
                    "(un molde con más kilos debería medir más). Se guardó igual.",
                    level=messages.WARNING,
                )
                break


@admin.register(CoverageColor)
class CoverageColorAdmin(ReadOnlySlugMixin, admin.ModelAdmin):
    list_display = ("name", "preview_color", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")


class PendingPriceFilter(admin.SimpleListFilter):
    """Decoraciones de precio fijo a las que aún les falta el precio (PENDIENTE)."""

    title = "precio"
    parameter_name = "price"

    def lookups(self, request, model_admin):
        return [("pending", "Con precio pendiente")]

    def queryset(self, request, queryset):
        if self.value() == "pending":
            # Solo una decoración de precio fijo lleva precio: las otras lo tienen vacío a propósito.
            return queryset.filter(pricing=DecorationPricing.FIXED, price__isnull=True)
        return queryset


@admin.register(DecorationOption)
class DecorationOptionAdmin(ReadOnlySlugMixin, admin.ModelAdmin):
    empty_value_display = "PENDIENTE"
    list_display = ("name", "pricing", "price_label", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    list_filter = (PendingPriceFilter, "pricing", "is_active")
    autocomplete_fields = ("preview_flavor", "preview_bread")

    @admin.display(description="precio", ordering="price")
    def price_label(self, obj):
        """Precio, o la palabra que lo reemplaza: nunca un precio supuesto."""
        if obj.price is not None:
            return f"${obj.price}"
        if obj.pricing == DecorationPricing.FIXED:
            return self.get_empty_value_display()
        return obj.get_pricing_display()


# --- Bases y envío ---


@admin.register(CakeStand)
class CakeStandAdmin(admin.ModelAdmin):
    list_display = ("__str__", "deposit", "origin", "is_active")
    list_filter = ("origin", "is_active")

    def has_delete_permission(self, request, obj=None):
        # Borrar un tamaño dejaría sin depósito a los pedidos de esos kilos; se
        # desactiva con "activa", que se puede deshacer.
        return False

    def changelist_view(self, request, extra_context=None):
        """Avisa si las bases no llegan hasta los kilos máximos en línea."""
        highest = CakeStand.objects.filter(is_active=True).order_by("-max_kg").first()
        max_online_kg = CakeDesignSettings.objects.values_list("max_online_kg", flat=True).first()
        if highest is not None and max_online_kg is not None and highest.max_kg < max_online_kg:
            self.message_user(
                request,
                f"La base más grande llega a {highest.max_kg} kg y los kilos máximos en "
                f"línea son {max_online_kg}: un pedido más grande no tendría base.",
                level=messages.WARNING,
            )
        return super().changelist_view(request, extra_context)


@admin.register(DeliveryFeeBand)
class DeliveryFeeBandAdmin(admin.ModelAdmin):
    list_display = ("max_km", "fee")


# --- Catálogo ---


class ProductOfferingInline(admin.TabularInline):
    model = ProductOffering
    extra = 0


@admin.register(Product)
class ProductAdmin(ReadOnlySlugMixin, admin.ModelAdmin):
    empty_value_display = "PENDIENTE"
    list_display = (
        "name", "category", "sales_channel", "photo", "sort_order", "is_active", "featured_on_home",
    )
    # `is_active` no va aquí: una lista cargada antes de desactivar un producto lo
    # volvería a publicar al guardarla. Se activa o desactiva en su formulario.
    list_editable = ("sort_order", "featured_on_home")
    list_filter = ("category", "sales_channel", "is_active", "featured_on_home")
    search_fields = ("name",)
    inlines = [ProductOfferingInline]

    def changelist_view(self, request, extra_context=None):
        if request.method == "GET":
            self._warn_about_extra_featured_products(request)
        return super().changelist_view(request, extra_context)

    def _warn_about_extra_featured_products(self, request):
        """Avisa si hay más destacados activos de los que muestra "Pasteles de la casa"."""
        featured = Product.objects.filter(featured_on_home=True, is_active=True).count()
        if featured > HOME_FEATURED_LIMIT:
            self.message_user(
                request,
                f"Hay {featured} productos activos destacados en la portada, y la portada muestra "
                f"solo los primeros {HOME_FEATURED_LIMIT}, en el orden de la lista.",
                level=messages.WARNING,
            )


@admin.register(CatalogPrice)
class CatalogPriceAdmin(admin.ModelAdmin):
    list_display = ("name", "amount", "approx_weight_kg", "servings", "sort_order")
    list_editable = ("sort_order",)
    search_fields = ("name",)


# --- Inventario ---


class StockDayFilter(admin.SimpleListFilter):
    """Filtra por día; sin elegir nada muestra solo hoy (hora de Ciudad de México)."""

    title = "día"
    parameter_name = "day"

    def lookups(self, request, model_admin):
        return [("today", "Hoy"), ("all", "Todos los días")]

    def choices(self, changelist):
        current = self.value() or "today"
        for lookup, title in self.lookup_choices:
            yield {
                "selected": current == lookup,
                "query_string": changelist.get_query_string({self.parameter_name: lookup}),
                "display": title,
            }

    def queryset(self, request, queryset):
        if (self.value() or "today") == "today":
            return queryset.filter(stock_date=timezone.localdate())
        return queryset


class LoadedStateField(forms.CharField):
    """Campo oculto con el estado con que se cargó la página.

    Nunca cuenta como un cambio del formulario: una fila que la pastelería no
    editó no se guarda ni se compara aunque su estado ya sea otro.
    """

    def has_changed(self, initial, data):
        return False


class InventoryStockForm(forms.ModelForm):
    """Formulario de existencias con bloqueo optimista.

    La pastelería edita la cantidad absoluta. Mientras tanto un pedido puede
    descontar o devolver piezas (los repositorios suben `updated_at` en cada
    escritura). El campo oculto `loaded_at` lleva el `updated_at` con que se cargó
    la página: si una fila que se está editando ya es otra al guardar, no se
    escribe nada y se pide recargar. Solo se revisa y se bloquea
    (`select_for_update`, hasta terminar la petición) lo que cambió: una venta en
    una fila que no se tocó no rechaza el guardado de las demás, y ni otra edición
    ni un descuento se cuelan entre la revisión y la escritura de las que sí.

    `quantity` lleva su valor inicial oculto (`show_hidden_initial`) porque el
    formulario del guardado se arma con la fila actual, no con la que se cargó:
    sin eso, una fila con una venta parecería editada.
    """

    STALE_MESSAGE = "Las existencias cambiaron mientras editabas; recarga la página."
    # El formulario de cambio siempre guarda la fila, aunque no se haya tocado, así
    # que siempre se revisa. En la lista el admin solo guarda las filas que cambiaron.
    only_when_changed = False

    # Debe ser el `isoformat()` crudo de `updated_at`: `_loaded_state_is_current` lo compara tal cual.
    loaded_at = LoadedStateField(widget=forms.HiddenInput, required=False)

    class Meta:
        model = Inventory
        fields = ("quantity",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["quantity"].show_hidden_initial = True
        if self.instance.pk:
            self.initial["loaded_at"] = self.instance.updated_at.isoformat()

    def clean(self):
        cleaned_data = super().clean()
        checks_state = self.instance.pk and (self.has_changed() or not self.only_when_changed)
        offering = self.instance.offering if self.instance.offering_id else None
        if checks_state and offering and offering.presentation in Inventory.WHOLE_AND_SLICES_MESSAGES:
            # Primero el producto y luego la fila del inventario, el mismo orden que
            # `Inventory.clean()`: dos guardados a la vez nunca se esperan en cruz (D60).
            Inventory.lock_product(offering.product_id)
        if checks_state and not self._loaded_state_is_current(cleaned_data.get("loaded_at")):
            # Junto a la cantidad, el campo que se editó. Los errores sin campo también se ven
            # en la lista, en una fila arriba de la suya (`change_list_results.html`).
            self.add_error("quantity", self.STALE_MESSAGE)
        return cleaned_data

    def _loaded_state_is_current(self, token):
        try:
            loaded_at = datetime.fromisoformat(token)
        except (TypeError, ValueError):
            return False
        current = (
            Inventory.objects.select_for_update()
            .filter(pk=self.instance.pk)
            .values_list("updated_at", flat=True)
            .first()
        )
        return current == loaded_at


class InventoryListForm(InventoryStockForm):
    """Formulario de cada fila de la lista: solo se revisan las filas editadas."""

    only_when_changed = True

    def _post_clean(self):
        # La lista solo guarda las filas editadas. Una fila sin tocar no pasa por
        # `Inventory.clean()`: un dato de antes de una regla (por ejemplo, dos
        # completos del mismo sabor, D60) no bloquea el guardado de las demás.
        if self.has_changed():
            super()._post_clean()

    def _update_errors(self, errors):
        # La lista solo tiene la cantidad: un error de `Inventory.clean()` en otro campo
        # (por ejemplo `offering`, de un producto que pasó a "solo por encargo") va arriba
        # de la fila. Sin esto, `add_error` lanza `ValueError` y el admin responde 500.
        if hasattr(errors, "error_dict"):
            regrouped = {}
            for field, messages in errors.error_dict.items():
                key = field if field in self.fields else NON_FIELD_ERRORS
                regrouped.setdefault(key, []).extend(messages)
            errors = ValidationError(regrouped)
        super()._update_errors(errors)


class InventoryAdmin(admin.ModelAdmin):
    """Base de las dos vistas del mostrador: la cantidad se edita en la lista."""

    form = InventoryStockForm
    list_editable = ("quantity",)
    list_filter = (StockDayFilter,)

    @admin.display(description="")
    def loaded_at(self, obj):
        """Columna sin texto: en la lista solo lleva el campo oculto de `InventoryStockForm`."""
        return ""

    def get_changelist_form(self, request, **kwargs):
        kwargs.setdefault("form", InventoryListForm)
        return super().get_changelist_form(request, **kwargs)

    def changelist_view(self, request, extra_context=None):
        # La validación de la lista corre fuera de la transacción del guardado;
        # con esta, el bloqueo de cada fila dura hasta terminar la petición.
        with transaction.atomic():
            return super().changelist_view(request, extra_context)


@admin.register(ShowcaseInventory)
class ShowcaseInventoryAdmin(InventoryAdmin):
    fields = ("offering", "stock_date", "quantity", "loaded_at")
    list_display = ("offering", "stock_date", "quantity", "updated_at", "loaded_at")
    ordering = ("offering__product__sort_order", "offering__sort_order")

    def get_queryset(self, request):
        # `Inventory.clean()` y `__str__` leen el producto de cada fila.
        return super().get_queryset(request).select_related("offering__product")

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "offering":
            # Lo que es solo por encargo (Red velvet) no tiene vitrina.
            kwargs["queryset"] = ProductOffering.objects.filter(is_active=True).exclude(
                product__sales_channel=SalesChannel.ORDER_ONLY
            )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(BreadInventory)
class BreadInventoryAdmin(InventoryAdmin):
    fields = ("bread", "stock_date", "quantity", "loaded_at")
    list_display = ("bread", "stock_date", "quantity", "updated_at", "loaded_at")
    ordering = ("bread__sort_order",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("bread")

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "bread":
            kwargs["queryset"] = Bread.objects.filter(is_active=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


# --- Pedidos ---
#
# Registro básico (sin vistas del personal, D63 y D64): el pedido lo crea la API y sus líneas van en solo lectura. Se
# editan solo el estado, por las transiciones de `services/orders/order_status.py`, y el precio de una decoración por
# cotizar mientras el pedido la espera (`services/orders/quote_service.py`, ronda 2); los dos, auditados. El texto que
# manda el cliente se escapa y los colores se pintan con `format_html` y el valor que el servidor ya validó (auditoría
# de D55, punto 11).


def _swatch(color: str, name: str) -> str:
    """La muestra del color, su código y el "parecido a" que calculó el servidor."""
    similar = format_html(", parecido a {}", name) if name else ""
    return format_html(
        '<span style="display:inline-block;width:1em;height:1em;vertical-align:middle;'
        'border:1px solid #2b1d1a;background-color: {}"></span> {}{}',
        color,
        color.upper(),
        similar,
    )


def _image_link(image_id) -> str:
    return format_html('<a href="{}" target="_blank" rel="noopener">ver imagen</a>', reverse("customer-image", args=[image_id]))


def design_lines(design: CakeDesign, show_images: bool = False) -> list[str]:
    """El diseño en renglones para el personal, armado por el servidor (nunca con el texto del cliente).

    El enlace a las imágenes sale solo con `show_images`: el endpoint de imágenes las entrega solo al superusuario.
    """
    flavors = ", ".join(flavor.name for flavor in (design.first_flavor, design.second_flavor) if flavor)
    filling = f"relleno {design.filling_base.name.lower()}: {flavors}" if design.filling_base else "relleno incluido"
    lines = [
        format_html(
            "{} kg ({} personas), {}, {} {}",
            design.kg, design.people, design.get_form_display().lower(), design.tiers,
            "piso" if design.tiers == 1 else "pisos",
        ),
        format_html("{}, pan {}, {}", design.get_cake_type_display(), design.bread.name.lower(), filling),
        format_html("Cobertura: {}", _swatch(design.coverage_color, design.coverage_color_name)),
    ]
    decoration_color = (
        _swatch(design.decoration_color, design.decoration_color_name) if design.decoration_color else "color automático"
    )
    lines.append(format_html("Decoración: {}, {}", design.decoration.name, decoration_color))
    if design.decoration_image_id:
        image = _image_link(design.decoration_image_id) if show_images else "subida por el cliente"
        lines.append(format_html("Imagen de la decoración: {}", image))
    if design.message:
        color = design.message.get("color")
        ink = _swatch(color, "") if color and color.startswith("#") else design.message.get("color_mode", "")
        lines.append(format_html("Mensaje: «{}», {}", design.message.get("text", ""), ink))
    if design.wafer:
        shape = (design.wafer_layout or {}).get("shape", "")
        image = _image_link(design.wafer_image_id) if design.wafer_image_id and show_images else ""
        lines.append(format_html("Oblea: {} {}", WaferShape(shape).label.lower() if shape else "", image))
    if design.occasion:
        lines.append(format_html("Ocasión: {}", design.get_occasion_display()))
    if design.requires_quote:
        quoted = design.decoration_price > 0
        lines.append(
            format_html("Cotizada: la decoración (${}) ya está en el total.", design.decoration_price)
            if quoted
            else "Por cotizar: la decoración no está en el total."
        )
    stand = format_html("Base: {} (depósito ${})", design.stand, design.stand_deposit) if design.stand else "Sin base"
    lines.append(stand)
    return lines


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    line_fields = ("position", "kind", "product_name", "presentation", "quantity", "unit_price", "line_total")

    def get_fields(self, request, obj=None):
        # El superusuario ve el enlace a las imágenes; el resto del personal, el diseño sin él.
        summary = "design_with_images" if request.user.is_superuser else "design_summary"
        return (*self.line_fields, summary)

    def get_readonly_fields(self, request, obj=None):
        return self.get_fields(request, obj)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "design__bread", "design__filling_base", "design__first_flavor", "design__second_flavor",
            "design__decoration", "design__stand",
        )

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @staticmethod
    def _summary(item, show_images):
        if not item.design_id:
            return "—"
        return format_html_join(mark_safe("<br>"), "{}", ((line,) for line in design_lines(item.design, show_images)))

    @admin.display(description="diseño")
    def design_summary(self, item):
        return self._summary(item, show_images=False)

    @admin.display(description="diseño")
    def design_with_images(self, item):
        return self._summary(item, show_images=True)


def payment_lines(order: Order) -> str:
    """Los intentos de pago del pedido en renglones de solo lectura (D68): los cambia solo `payment_service`."""
    payments = order.payments.order_by("created_at", "pk")
    if not payments:
        return "Sin intentos de pago."
    return format_html_join(
        mark_safe("<br>"),
        "{}: {}, ${} {}{}",
        (
            (
                payment.get_method_display(),
                payment.get_status_display(),
                payment.amount,
                payment.currency,
                format_html(" ({})", payment.get_refund_reason_display()) if payment.refund_reason else "",
            )
            for payment in payments
        ),
    )


# Marca en la petición que un servicio rechazó el cambio: así no se registra ni se anuncia como guardado.
ORDER_CHANGE_REFUSED = "_order_change_refused"


class ServiceEditAdminMixin:
    """Un registro que no guarda con `obj.save()`: cada cambio lo hace un servicio. Si el servicio lo rechaza, la página
    muestra solo su error, sin el aviso de guardado ni la entrada del historial (`response_change` y `log_change`)."""

    def _refuse(self, request, texts):
        setattr(request, ORDER_CHANGE_REFUSED, True)
        for text in texts:
            self.message_user(request, text, level=messages.ERROR)

    def _refuse_error(self, request, error: DomainValidationError):
        self._refuse(request, [message for messages_ in error.errors.values() for message in messages_])

    def log_change(self, request, obj, message):
        if getattr(request, ORDER_CHANGE_REFUSED, False):
            return None
        return super().log_change(request, obj, message)

    def response_change(self, request, obj):
        if getattr(request, ORDER_CHANGE_REFUSED, False):
            return redirect(request.path)
        return super().response_change(request, obj)
ONE_CHANGE_AT_A_TIME_MESSAGE = "Pon el precio o cambia el estado, no las dos cosas a la vez."


def _register_cash_payment(request, obj, form):
    # Pasar a `received` desde el admin es registrar el cobro en efectivo (D64, D68).
    payment_service.register_cash_payment(obj.pk, actor=request.user)


def _change_status_only(request, obj, form):
    order_status.change_status(obj.pk, form.initial["status"], obj.status, actor_id=request.user.pk)


# El servicio de cada estado de destino; los demás solo cambian el estado.
STATUS_EDITS = {OrderStatus.RECEIVED: _register_cash_payment}


def _change_order_status(request, obj, form):
    STATUS_EDITS.get(obj.status, _change_status_only)(request, obj, form)


def _price_order_quote(request, obj, form):
    quote_service.price_quote(obj.pk, obj.quoted_decoration_price, actor_id=request.user.pk)


# Cada campo editable del pedido, con el servicio que lo cambia.
ORDER_EDITS = {"status": _change_order_status, "quoted_decoration_price": _price_order_quote}


@admin.register(Order)
class OrderAdmin(ServiceEditAdminMixin, admin.ModelAdmin):
    # Registro básico: lista y detalle, sin filtros, acciones ni formularios propios (sin vistas nuevas para el
    # personal, D63 y D64). El personal registra el cobro en efectivo, avanza o cancela el pedido cambiando el estado
    # aquí, solo hacia los estados que permite `order_status`, y pone el precio de una decoración por cotizar mientras
    # el pedido la espera. El Observer del pedido (D68) reacciona a esos cambios.
    list_display = ("__str__", "customer", "status", "delivery_slot", "subtotal", "pay_today", "created_at")
    list_select_related = ("customer", "delivery_slot")
    # Sin la llave de idempotencia ni el token de la nota: no le sirven al personal y el token abre la nota.
    fields = (
        "customer", "customer_phone", "customer_notify_whatsapp", "status", "status_changed_at", "fulfillment",
        "delivery_slot", "pickup_name", "pickup_phone",
        "quoted_decoration_price", "subtotal", "stand_deposit", "delivery_fee", "advance_percent", "advance", "pay_today",
        "pay_on_delivery", "payment_due_at", "created_at", "payments_summary",
    )
    inlines = [OrderItemInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_fields(self, request, obj=None):
        # Un pedido que espera cotización muestra también cuánto puede esperar (PENDIENTE mientras no se fije).
        if obj is not None and obj.status == OrderStatus.AWAITING_QUOTE:
            return (*self.fields, "quote_expiry_notice")
        return self.fields

    def get_readonly_fields(self, request, obj=None):
        # Lo único que se edita está en `ORDER_EDITS`; el precio de la cotización, solo mientras el pedido la espera.
        quoting = obj is not None and obj.status == OrderStatus.AWAITING_QUOTE
        editable = tuple(ORDER_EDITS) if quoting else ("status",)
        return tuple(field for field in self.get_fields(request, obj) if field not in editable)

    @admin.display(description=QUOTE_EXPIRY_LABEL)
    def quote_expiry_notice(self, obj):
        return quote_expiry_notice()

    # La cuenta del cliente, para escribirle (D72): su teléfono y si pidió avisos por WhatsApp. El sitio no los manda.
    @admin.display(description="teléfono del cliente")
    def customer_phone(self, obj):
        return obj.customer.phone or "Sin teléfono en su cuenta"

    @admin.display(description="avisos por WhatsApp")
    def customer_notify_whatsapp(self, obj):
        if obj.customer.notify_whatsapp:
            return "Sí, escríbele por WhatsApp al teléfono de su cuenta"
        return "No, solo por correo"

    @admin.display(description="pagos")
    def payments_summary(self, obj):
        return payment_lines(obj)

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if obj is not None and "status" in form.base_fields:
            # Solo el estado actual y los siguientes que se permiten: lo demás ni se ofrece ni se acepta.
            allowed = (obj.status, *order_status.next_statuses(obj.status))
            if not request.user.has_perm(payment_service.CASH_PERMISSION):
                # Sin el permiso, el cobro en efectivo ni se ofrece (el servicio también lo revisa).
                allowed = tuple(value for value in allowed if value != OrderStatus.RECEIVED or value == obj.status)
            form.base_fields["status"].choices = [(value, OrderStatus(value).label) for value in allowed]
        return form

    def save_model(self, request, obj, form, change):
        # Nunca `obj.save()`: cada cambio pasa por su servicio. Si el servicio lo rechaza, la página muestra solo su
        # error, sin el aviso de guardado ni la entrada del historial (`response_change` y `log_change`).
        changed = [field for field in ORDER_EDITS if field in form.changed_data]
        if len(changed) > 1:
            self._refuse(request, [ONE_CHANGE_AT_A_TIME_MESSAGE])
            return
        if not changed:
            return
        try:
            ORDER_EDITS[changed[0]](request, obj, form)
        except DomainValidationError as error:
            self._refuse_error(request, error)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    # Registro básico en solo lectura (D64, D68): el personal ve qué cobros llegaron y cuáles hay que reembolsar desde
    # el panel de la pasarela (`refund_required`). Nada se agrega, cambia ni borra aquí; el efectivo se registra
    # cambiando el estado del pedido.
    list_display = ("__str__", "order", "method", "status", "refund_reason", "amount", "created_at")
    list_filter = ("status", "method")
    list_select_related = ("order",)
    fields = (
        "order", "method", "status", "refund_reason", "amount", "currency", "checkout_id", "provider_payment_id",
        "recorded_by", "created_at", "updated_at",
    )
    readonly_fields = fields

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StandLoan)
class StandLoanAdmin(ServiceEditAdminMixin, admin.ModelAdmin):
    # Registro básico (D64, D69): el préstamo lo crea el Observer al entregar el pedido. El personal con
    # `core_pasteleria.register_stand_return` registra la devolución cambiando el estado de "Prestada" a "Devuelta";
    # el cambio pasa por `warranty_service.register_stand_return`, que emite "base devuelta" y el Observer marca el
    # depósito reembolsado. Nada más se edita, agrega ni borra aquí.
    list_display = ("__str__", "order", "stand", "deposit", "status", "due_date", "returned_at")
    list_filter = ("status",)
    list_select_related = ("order", "stand")
    search_fields = ("=order__id",)
    fields = (
        "order", "stand", "deposit", "status", "delivered_on", "due_date", "returned_at", "returned_by",
        "deposit_refunded",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        # Cambiar es solo registrar la devolución: lo da el permiso propio, no `change_standloan`.
        return request.user.has_perm(warranty_service.RETURN_PERMISSION)

    def get_readonly_fields(self, request, obj=None):
        # Solo una base prestada ofrece el estado; una devuelta ya no cambia.
        on_loan = obj is not None and obj.status == StandLoanStatus.ON_LOAN
        return tuple(field for field in self.fields if not (on_loan and field == "status"))

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if "status" in form.base_fields:
            form.base_fields["status"].choices = StandLoanStatus.choices
        return form

    def save_model(self, request, obj, form, change):
        # Nunca `obj.save()`: la devolución pasa por el servicio y su evento (D64).
        if "status" not in form.changed_data or obj.status != StandLoanStatus.RETURNED:
            return
        try:
            warranty_service.register_stand_return(obj.pk, actor=request.user)
        except DomainValidationError as error:
            self._refuse_error(request, error)


@admin.register(ReferenceRequest)
class ReferenceRequestAdmin(ServiceEditAdminMixin, admin.ModelAdmin):
    # Registro básico (D64, D70): la solicitud la manda el cliente. El personal con
    # `core_pasteleria.set_reference_quote` escribe el precio y su nota mientras está en revisión o con cotización; el
    # cambio pasa por `reference_service.set_quote`, que la deja en "Cotización lista", lo audita y avisa al cliente.
    # Nada más se edita, agrega ni borra aquí.
    # Quien cotiza ve el sabor, la base y las fotos de la solicitud (D70, decisiones del usuario del 15 de noviembre de
    # 2026): las fotos salen por `photo_view`, que pide el permiso de cotizar y que la foto sea de esta solicitud.
    list_display = ("__str__", "customer", "status", "event_date", "people", "quoted_price", "created_at")
    list_filter = ("status",)
    list_select_related = ("customer",)
    search_fields = ("=id",)
    fields = (
        "customer", "status", "created_at", "description", "occasion", "people", "flavor", "stand_summary",
        "event_date", "budget", "photos", "quoted_price", "quote_note", "quoted_at", "quoted_by", "order",
    )
    QUOTE_FIELDS = ("quoted_price", "quote_note")
    PHOTO_SIZE_PX = 160

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        # Cambiar es solo cotizar: lo da el permiso propio, no `change_referencerequest`.
        return request.user.has_perm(reference_service.QUOTE_PERMISSION)

    def has_view_permission(self, request, obj=None):
        return super().has_view_permission(request, obj) or self.has_change_permission(request, obj)

    def get_readonly_fields(self, request, obj=None):
        quoting = obj is not None and obj.status in (ReferenceRequestStatus.IN_REVIEW, ReferenceRequestStatus.QUOTE_READY)
        editable = self.QUOTE_FIELDS if quoting else ()
        return tuple(field for field in self.fields if field not in editable)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "bread", "filling_base", "first_flavor", "second_flavor", "stand"
        )

    def get_urls(self):
        photo = path(
            "<int:request_id>/photos/<uuid:image_id>/",
            self.admin_site.admin_view(self.photo_view),
            name="core_pasteleria_referencerequest_photo",
        )
        return [photo, *super().get_urls()]

    def photo_view(self, request, request_id, image_id):
        """Una foto de la solicitud para quien cotiza; sin el permiso, o si la foto no es de esta solicitud, 403."""
        image = reference_service.get_photo_for_staff(request_id, image_id, actor=request.user)
        if image is None:
            raise PermissionDenied
        response = HttpResponse(image.content, content_type=image.content_type)
        response["Content-Disposition"] = f'inline; filename="{customer_image_service.file_name(image)}"'
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["Cache-Control"] = "private, no-store"
        return response

    @admin.display(description="sabor")
    def flavor(self, obj):
        if obj.bread is None:
            return "Sin sabor (solicitud de antes de pedirlo)"
        flavors = ", ".join(flavor.name for flavor in (obj.first_flavor, obj.second_flavor) if flavor)
        filling = f"relleno {obj.filling_base.name.lower()}: {flavors}" if obj.filling_base else "relleno incluido"
        return f"{obj.get_cake_type_display()}, pan {obj.bread.name}, {filling}"

    @admin.display(description="base")
    def stand_summary(self, obj):
        if obj.kg is None:
            return "-"
        if obj.stand is None:
            return f"{obj.kg} kg, sin base"
        return f"{obj.kg} kg, base de {obj.stand.min_kg} a {obj.stand.max_kg} kg, depósito ${obj.stand_deposit}"

    @admin.display(description="fotos")
    def photos(self, obj):
        ids = list(obj.images.values_list("pk", flat=True))
        if not ids:
            return "Sin fotos"
        # Las miniaturas solo sirven con el permiso de cotizar (`photo_view` lo vuelve a revisar).
        links = (
            (
                reverse("admin:core_pasteleria_referencerequest_photo", args=[obj.pk, image_id]),
                self.PHOTO_SIZE_PX,
                f"Foto {number} de {len(ids)} de la solicitud {obj.pk}",
            )
            for number, image_id in enumerate(ids, start=1)
        )
        return format_html_join(
            " ",
            '<a href="{0}" target="_blank" rel="noopener"><img src="{0}" height="{1}" alt="{2}" loading="lazy"></a>',
            links,
        )

    def save_model(self, request, obj, form, change):
        # Nunca `obj.save()`: la cotización pasa por el servicio y su evento (D64).
        if not any(field in form.changed_data for field in self.QUOTE_FIELDS):
            return
        try:
            reference_service.set_quote(obj.pk, obj.quoted_price, obj.quote_note, actor=request.user)
        except DomainValidationError as error:
            self._refuse_error(request, error)
