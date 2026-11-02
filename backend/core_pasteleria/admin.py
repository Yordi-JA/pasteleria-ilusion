"""Registro de modelos en el admin de Django.

Excepción a la regla de capas: el admin consulta el ORM directamente (D18).
"""
from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied

from .models import User


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
