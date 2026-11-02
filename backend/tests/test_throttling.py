"""El throttling no se evade falsificando X-Forwarded-For."""
import pytest
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView


class Ping(APIView):
    """Vista pública mínima: así el throttling se evalúa sin autenticación."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        return Response({"ok": True})


@pytest.fixture
def call_ping(settings, monkeypatch):
    """Devuelve una función que pide /ping/ con X-Forwarded-For y NUM_PROXIES dados."""
    # La tasa se lee al importar DRF: se reemplaza en la clase, con un límite bajo.
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/min"})
    factory = APIRequestFactory()
    view = Ping.as_view()

    def call_ping(forwarded_for, num_proxies):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": num_proxies}
        request = factory.get(
            "/ping/", HTTP_X_FORWARDED_FOR=forwarded_for, REMOTE_ADDR="10.0.0.1"
        )
        return view(request).status_code

    return call_ping


def test_without_proxies_a_forged_header_does_not_get_a_new_counter(call_ping):
    assert call_ping("1.1.1.1", 0) == 200
    assert call_ping("2.2.2.2", 0) == 200
    # Tercera petición de la misma conexión, con otro X-Forwarded-For.
    assert call_ping("3.3.3.3", 0) == 429


def test_with_one_proxy_the_address_added_by_the_proxy_is_counted(call_ping):
    # El cliente antepone direcciones falsas; el proxy de confianza agrega la real.
    assert call_ping("falsa-1, 9.9.9.9", 1) == 200
    assert call_ping("falsa-2, 9.9.9.9", 1) == 200
    assert call_ping("falsa-3, 9.9.9.9", 1) == 429
    # Otro cliente real sigue teniendo su propio contador.
    assert call_ping("falsa-4, 8.8.8.8", 1) == 200
