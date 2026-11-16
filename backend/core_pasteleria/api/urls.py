"""Rutas de la API bajo /api/v1/."""
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from . import account_views, auth_views, payment_views, reference_views, views

urlpatterns = [
    # Acceso de clientes (D62): la cookie del refresh vive solo bajo `auth/`.
    path("auth/csrf/", auth_views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/register/", auth_views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", auth_views.LoginView.as_view(), name="auth-login"),
    path("auth/google/", auth_views.GoogleLoginView.as_view(), name="auth-google"),
    path("auth/refresh/", auth_views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", auth_views.LogoutView.as_view(), name="auth-logout"),
    # "Datos y avisos" (D72): la cuenta con JWT; la contraseña va bajo `auth/` porque pone la cookie del refresh.
    path("auth/password/", auth_views.PasswordChangeView.as_view(), name="auth-password"),
    # Enlaces por correo (D76): confirmar la cuenta y recuperar la contraseña. Crear la contraseña nueva pone la cookie
    # del refresh, que solo existe bajo `auth/`.
    path("auth/verify/", auth_views.VerifyEmailView.as_view(), name="auth-verify"),
    path("auth/verify/resend/", auth_views.VerificationResendView.as_view(), name="auth-verify-resend"),
    path("auth/password/reset/", auth_views.PasswordResetView.as_view(), name="auth-password-reset"),
    path(
        "auth/password/reset/confirm/",
        auth_views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("account/", account_views.AccountView.as_view(), name="account"),
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
    # Bases en préstamo (`/bases`): las bases de la pastelería y las condiciones del préstamo; pública y de solo lectura.
    path("stands/", views.StandInfoView.as_view(), name="stands"),
    # Catálogo, portada, vitrina y rebanadas de hoy: públicas y de solo lectura.
    path("products/", views.ProductListView.as_view(), name="product-list"),
    path("products/<slug:slug>/", views.ProductDetailView.as_view(), name="product-detail"),
    path("featured-products/", views.FeaturedProductListView.as_view(), name="featured-products"),
    path("showcase/", views.ShowcaseView.as_view(), name="showcase"),
    path("slices/", views.SliceListView.as_view(), name="slices"),
    # Pedidos, su agenda y las imágenes de los clientes: exigen sesión (JWT).
    path("delivery-slots/", views.DeliverySlotListView.as_view(), name="delivery-slots"),
    path("orders/", views.OrderListCreateView.as_view(), name="order-list"),
    path("orders/<int:order_id>/", views.OrderDetailView.as_view(), name="order-detail"),
    # Nota en PDF (dueño, JWT), su verificación pública (lo que abre el QR) y las bases del cliente (D69).
    path("orders/<int:order_id>/note.pdf", views.OrderNoteView.as_view(), name="order-note"),
    path("notes/<str:token>/", views.NoteVerificationView.as_view(), name="note-verification"),
    path("stand-loans/", views.StandLoanListView.as_view(), name="stand-loans"),
    # Pagos (D68): iniciar y consultar con JWT; los webhooks, sin sesión ni CSRF (la firma es la autenticación).
    path("orders/<int:order_id>/payment/", payment_views.OrderPaymentView.as_view(), name="order-payment"),
    path(
        "payments/webhooks/mercadopago/",
        payment_views.MercadoPagoWebhookView.as_view(),
        name="payment-webhook-mercadopago",
    ),
    path("payments/webhooks/stripe/", payment_views.StripeWebhookView.as_view(), name="payment-webhook-stripe"),
    # Envío de referencia y su cotización, y la cancelación por el cliente (D70): JWT, del dueño.
    path("orders/<int:order_id>/cancel/", reference_views.OrderCancelView.as_view(), name="order-cancel"),
    path("reference-requests/", reference_views.ReferenceRequestListCreateView.as_view(), name="reference-requests"),
    path(
        "reference-requests/<int:request_id>/",
        reference_views.ReferenceRequestDetailView.as_view(),
        name="reference-request-detail",
    ),
    path(
        "reference-requests/<int:request_id>/accept/",
        reference_views.ReferenceQuoteAcceptView.as_view(),
        name="reference-request-accept",
    ),
    path(
        "reference-requests/<int:request_id>/cancel/",
        reference_views.ReferenceRequestCancelView.as_view(),
        name="reference-request-cancel",
    ),
    path("customer-images/", views.CustomerImageUploadView.as_view(), name="customer-image-upload"),
    path("customer-images/<uuid:image_id>/", views.CustomerImageView.as_view(), name="customer-image"),
]
