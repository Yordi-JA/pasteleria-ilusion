"""Rutas raíz del proyecto: admin y la API bajo /api/v1/.

`MEDIA_URL` no se enruta: los archivos de clientes salen por un endpoint con
permisos, nunca desde una carpeta pública.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core_pasteleria.api.urls")),
]
