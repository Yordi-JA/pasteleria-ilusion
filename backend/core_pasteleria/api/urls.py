"""Rutas de la API bajo /api/v1/."""
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Contrato OpenAPI y Swagger UI: solo para personal (SPECTACULAR_SETTINGS).
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
