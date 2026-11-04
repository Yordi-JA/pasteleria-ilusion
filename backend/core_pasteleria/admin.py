"""Registro de modelos en el admin de Django.

Excepción a la regla de capas: el admin consulta el ORM directamente (D18).
"""
from datetime import datetime

from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone

from .models import (
    Bread,
    BreadInventory,
    CakeDesignSettings,
    CakeStand,
    CakeType,
    CatalogPrice,
    CoverageColor,
    DecorationOption,
    DecorationPricing,
    DeliveryFeeBand,
    FillingBase,
    FillingFlavor,
    FillingPrice,
    Inventory,
    SalesChannel,
    ShowcaseInventory,
    PolicySettings,
    Product,
    ProductOffering,
    StoreSettings,
    TierRecommendation,
    UploadSettings,
    User,
)


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

    fieldsets = (
        (None, {"fields": ("email", "password")}),
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
        ("Fechas importantes", {"fields": ("last_login",)}),
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
        readonly = super().get_readonly_fields(request, obj)
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
    pass


@admin.register(CakeDesignSettings)
class CakeDesignSettingsAdmin(SingletonAdmin):
    pass


@admin.register(PolicySettings)
class PolicySettingsAdmin(SingletonAdmin):
    pass


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


@admin.register(Bread)
class BreadAdmin(ReadOnlySlugMixin, CakeTypesMixin, admin.ModelAdmin):
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
    list_display = ("name", "is_combinable", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    list_filter = ("bases", "is_combinable", "is_active")
    filter_horizontal = ("bases",)
    search_fields = ("name",)


@admin.register(FillingPrice)
class FillingPriceAdmin(admin.ModelAdmin):
    list_display = ("base", "flavor", "cake_type", "price_per_kg")
    list_filter = ("cake_type", "base")


@admin.register(TierRecommendation)
class TierRecommendationAdmin(admin.ModelAdmin):
    list_display = ("tiers", "recommended_min_kg", "recommended_max_kg")


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
    list_display = ("name", "category", "sales_channel", "photo", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")
    list_filter = ("category", "sales_channel", "is_active")
    search_fields = ("name",)
    inlines = [ProductOfferingInline]


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
        if (
            self.instance.pk
            and (self.has_changed() or not self.only_when_changed)
            and not self._loaded_state_is_current(cleaned_data.get("loaded_at"))
        ):
            # En la lista, el error de un formulario solo se ve junto a un campo.
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
