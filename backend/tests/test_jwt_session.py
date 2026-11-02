"""Los tokens JWT dejan de valer cuando el usuario cambia su contraseña."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

SCHEMA_URL = "/api/v1/schema/"


def _client_with(token):
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api


@pytest.mark.django_db
def test_valid_access_works_before_password_change(staff_user):
    access = RefreshToken.for_user(staff_user).access_token
    assert _client_with(access).get(SCHEMA_URL).status_code == 200


@pytest.mark.django_db
def test_old_access_is_rejected_after_password_change(staff_user):
    old_access = RefreshToken.for_user(staff_user).access_token
    staff_user.set_password("otra-clave-segura-456")
    staff_user.save()

    assert _client_with(old_access).get(SCHEMA_URL).status_code == 401

    new_access = RefreshToken.for_user(staff_user).access_token
    assert _client_with(new_access).get(SCHEMA_URL).status_code == 200


@pytest.mark.django_db
def test_access_renewed_from_old_refresh_is_rejected(staff_user):
    """TokenRefreshSerializer de SimpleJWT no revisa la huella de la contraseña:
    todavía renueva un refresh viejo. Lo que sí garantiza CHECK_REVOKE_TOKEN es
    que el access que entrega hereda la huella vieja y la API lo rechaza.
    """
    old_refresh = RefreshToken.for_user(staff_user)
    staff_user.set_password("otra-clave-segura-456")
    staff_user.save()

    serializer = TokenRefreshSerializer(data={"refresh": str(old_refresh)})
    serializer.is_valid(raise_exception=True)
    renewed_access = serializer.validated_data["access"]

    assert _client_with(renewed_access).get(SCHEMA_URL).status_code == 401
