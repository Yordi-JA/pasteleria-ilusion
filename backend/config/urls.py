"""Rutas raíz del proyecto: admin, la API bajo /api/v1/ y la SPA de React.

`MEDIA_URL` no se enruta: los archivos de clientes salen por un endpoint con
permisos, nunca desde una carpeta pública.
"""
from django.contrib import admin
from django.urls import include, path, re_path

from . import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core_pasteleria.api.urls")),
    # Al final: cualquier ruta que no sea del servidor es del router de React.
    # `/api/`, `/admin/`, `/static/` y `/media/` quedan fuera, para que sus
    # rutas inexistentes den 404 y `/admin` siga redirigiendo a `/admin/`.
    re_path(r"^(?!(?:api|admin|static|media)(?:/|$))(?P<path>.*)$", views.spa_index, name="spa"),
]

handler404 = "config.views.not_found"
