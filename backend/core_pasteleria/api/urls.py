"""Rutas de la API bajo /api/v1/."""
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from . import views

urlpatterns = [
    # Contrato OpenAPI y Swagger UI: solo para personal (SPECTACULAR_SETTINGS).
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    # "Diseña tu pastel": públicas y de solo lectura.
    path(
        "cake-designs/options/",
        views.CakeDesignOptionsView.as_view(),
        name="cake-design-options",
    ),
    path("cake-designs/price/", views.CakeDesignPriceView.as_view(), name="cake-design-price"),
]
