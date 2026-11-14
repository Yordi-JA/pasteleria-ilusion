"""API de imágenes de clientes: `POST /api/v1/customer-images/` y `GET /api/v1/customer-images/<id>/`."""
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.api import throttles
from core_pasteleria.models import CustomerImage, UploadSettings

pytestmark = pytest.mark.django_db
URL = "/api/v1/customer-images/"


def jpeg(size=(30, 20)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "pink").save(buffer, format="JPEG")
    return buffer.getvalue()


def upload(client, data=None, purpose="wafer", name="pastel.jpg", **extra):
    file = SimpleUploadedFile(name, jpeg() if data is None else data, content_type="image/jpeg")
    return client.post(URL, {"image": file, "purpose": purpose}, format="multipart", **extra)


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(customer_user).access_token}")
    return client


@pytest.fixture
def other_customer(django_user_model):
    return django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123")


def test_anonymous_cannot_upload():
    assert upload(APIClient()).status_code == 401


def test_upload_returns_the_image_metadata(api, customer_user):
    response = upload(api, name="C:\\fakepath\\mi\u202epastel.jpg")
    assert response.status_code == 201, response.json()
    body = response.json()
    assert set(body) == {"id", "purpose", "content_type", "width", "height", "size_bytes", "original_name"}
    assert (body["purpose"], body["content_type"], body["width"], body["height"]) == ("wafer", "image/jpeg", 30, 20)
    assert body["original_name"] == "mipastel.jpg"
    assert CustomerImage.objects.get(pk=body["id"]).owner == customer_user


def test_a_file_that_is_not_an_image_is_a_400(api):
    response = upload(api, data=b"<svg onload=alert(1)>")
    assert response.status_code == 400
    assert "image" in response.json()


def test_an_unknown_purpose_is_a_400(api):
    assert upload(api, purpose="reference").status_code == 400


def test_a_body_declared_larger_than_the_admin_limit_is_a_413_without_reading_it(api):
    UploadSettings.objects.update(max_upload_mb=1)
    response = upload(api, data=b"x" * (1024 * 1024 + 200_000))
    assert response.status_code == 413
    assert "1 MB" in response.json()["image"][0]
    assert not CustomerImage.objects.exists()


def test_a_file_over_the_limit_inside_a_small_multipart_overhead_is_still_a_413(api):
    UploadSettings.objects.update(max_upload_mb=1)
    response = upload(api, data=b"x" * (1024 * 1024 + 10))
    assert response.status_code == 413


def test_json_is_a_415(api):
    assert api.post(URL, {"purpose": "wafer"}, format="json").status_code == 415


def test_the_owner_gets_the_image_with_safe_headers(api):
    image_id = upload(api).json()["id"]
    response = api.get(f"{URL}{image_id}/")
    assert response.status_code == 200
    assert response["Content-Type"] == "image/jpeg"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Disposition"] == f'inline; filename="{image_id}.jpg"'
    assert "default-src 'none'" in response["Content-Security-Policy"]
    assert response["Cache-Control"] == "private, no-store"
    assert Image.open(io.BytesIO(response.content)).size == (30, 20)


def test_only_the_owner_and_the_superuser_see_it(api, other_customer, staff_user, django_user_model):
    """Sin vistas nuevas para el personal (decisión del usuario del 14 de noviembre): fuera del dueño, solo el
    superusuario, desde el admin con su sesión."""
    image_id = upload(api).json()["id"]
    stranger = APIClient()
    stranger.force_authenticate(other_customer)
    assert stranger.get(f"{URL}{image_id}/").status_code == 404
    staff = APIClient()
    staff.force_login(staff_user)
    assert staff.get(f"{URL}{image_id}/").status_code == 404
    superuser = APIClient()
    superuser.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    assert superuser.get(f"{URL}{image_id}/").status_code == 200
    assert APIClient().get(f"{URL}{image_id}/").status_code == 401


def test_uploads_are_throttled_per_user(api, monkeypatch):
    monkeypatch.setattr(throttles.CustomerImageUserThrottle, "rate", "2/min")
    assert [upload(api).status_code for _ in range(3)] == [201, 201, 429]


def test_uploads_are_throttled_per_ip_across_accounts(customer_user, other_customer, monkeypatch):
    monkeypatch.setattr(throttles.CustomerImageIPThrottle, "rate", "2/min")
    first, second = APIClient(), APIClient()
    first.force_authenticate(customer_user)
    second.force_authenticate(other_customer)
    assert [upload(first).status_code, upload(first).status_code, upload(second).status_code] == [201, 201, 429]
