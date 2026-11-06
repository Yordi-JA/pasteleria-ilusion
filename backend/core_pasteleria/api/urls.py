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
    # Datos del negocio para el pie y la franja superior: pública y de solo lectura.
    path("store/info/", views.StoreInfoView.as_view(), name="store-info"),
    # Catálogo, portada, vitrina y rebanadas de hoy: públicas y de solo lectura.
    path("products/", views.ProductListView.as_view(), name="product-list"),
    path("products/<slug:slug>/", views.ProductDetailView.as_view(), name="product-detail"),
    path("featured-products/", views.FeaturedProductListView.as_view(), name="featured-products"),
    path("showcase/", views.ShowcaseView.as_view(), name="showcase"),
    path("slices/", views.SliceListView.as_view(), name="slices"),
]
