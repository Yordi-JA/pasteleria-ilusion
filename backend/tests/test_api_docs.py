"""El esquema OpenAPI y Swagger UI son solo para personal (is_staff)."""
import re

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

DOCS_URL = "/api/v1/docs/"
SCHEMA_URL = "/api/v1/schema/"
URLS = [DOCS_URL, SCHEMA_URL]


@pytest.fixture
def api():
    return APIClient()


@pytest.mark.django_db
@pytest.mark.parametrize("url", URLS)
def test_anonymous_is_rejected(api, url):
    assert api.get(url).status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("url", URLS)
def test_non_staff_customer_is_rejected_with_session(api, url, customer_user):
    api.force_login(customer_user)
    assert api.get(url).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("url", URLS)
def test_non_staff_customer_is_rejected_with_jwt(api, url, customer_user):
    token = RefreshToken.for_user(customer_user).access_token
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api.get(url).status_code == 403


@pytest.mark.django_db
def test_staff_sees_swagger_ui_with_session(api, staff_user):
    api.force_login(staff_user)
    response = api.get(DOCS_URL)
    assert response.status_code == 200
    assert b"swagger" in response.content.lower()


@pytest.mark.django_db
def test_staff_gets_the_schema_with_jwt(api, staff_user):
    token = RefreshToken.for_user(staff_user).access_token
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = api.get(SCHEMA_URL)
    assert response.status_code == 200
    assert b"openapi" in response.content


@pytest.mark.django_db
def test_inactive_staff_user_is_rejected(api, staff_user):
    token = RefreshToken.for_user(staff_user).access_token
    staff_user.is_active = False
    staff_user.save()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api.get(SCHEMA_URL).status_code == 401


@pytest.mark.django_db
def test_schema_has_the_configured_title(api, staff_user, settings):
    api.force_login(staff_user)
    response = api.get(SCHEMA_URL, {"format": "json"})
    assert response.status_code == 200
    schema = response.json()
    assert schema["openapi"].startswith("3.")
    assert schema["info"]["title"] == settings.SPECTACULAR_SETTINGS["TITLE"]


@pytest.mark.django_db
def test_swagger_ui_loads_no_external_resources(api, staff_user):
    api.force_login(staff_user)
    html = api.get(DOCS_URL).content.decode()
    assert "cdn.jsdelivr.net" not in html
    # Ningún src/href apunta a un host externo (http://, https:// o //).
    external = re.findall(r"""(?:src|href)=["'](?:https?:)?//[^"']+""", html)
    assert external == []
    # Los recursos salen del propio sitio, vía drf-spectacular-sidecar.
    assert "drf_spectacular_sidecar" in html
