"""Datos del negocio para el pie y la franja superior: dirección, WhatsApp y horario.

La dirección y el WhatsApp son PENDIENTE (reglas de negocio, sección 13): la
semilla los deja vacíos y la API los da como `null`, nunca con un valor supuesto.
Los números de prueba no se pueden marcar (52 y diez ceros).
"""
import json
from dataclasses import replace
from datetime import time

import pytest
from django.contrib import admin as django_admin
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.forms.models import model_to_dict
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.models import ADDRESS_FORMAT_MESSAGE, WHATSAPP_FORMAT_MESSAGE, StoreSettings
from core_pasteleria.services import store_info_service
from tests import memory_cake_design

STORE_INFO_URL = "/api/v1/store/info/"
PRICE_URL = "/api/v1/cake-designs/price/"
CHANGE_URL = "admin:core_pasteleria_storesettings_change"
BUSINESS_DATA_SECTION = "Datos del negocio (pie del sitio)"

SEEDED_STORE_INFO = {
    "address": None,
    "whatsapp": None,
    "opens_at": "10:00",
    "closes_at": "22:30",
    "custom_lead_days": 2,
}
PRICE_REQUEST = {
    "kg": 15,
    "cake_type": "tres_leches",
    "bread": "chocolate",
    "filling_base": "queso",
    "filling_flavors": ["zarzamora"],
}

VALID_WHATSAPP = [
    "520000000000",  # México: 52 y los 10 dígitos
    "5210000000000",  # México con el 1 de los celulares: también se acepta
    "10000000",  # 8 dígitos, el mínimo
    "100000000000000",  # 15 dígitos, el máximo de E.164
]
TOO_LONG_WHATSAPP = "1000000000000000"  # 16 dígitos
INVALID_WHATSAPP = [
    "52000abc00000",  # letras
    "+520000000000",  # con "+"
    "52 00 0000 0000",  # con espacios
    "52-00-0000-0000",  # con guiones
    "1000000",  # 7 dígitos: muy corto
    TOO_LONG_WHATSAPP,
    "0520000000000",  # ninguna lada de país empieza con 0
    "520000000000\n",  # un salto de línea al final no se cuela
    "５２００００００００００",  # dígitos de ancho completo: no son ASCII
]
# Más largo que la columna: la base lo rechaza por tamaño (DataError), no por la regla.
INVALID_WHATSAPP_THAT_FITS = [value for value in INVALID_WHATSAPP if value != TOO_LONG_WHATSAPP]

VALID_ADDRESS = "Calle Ñandú 12, Col. Árbol, Alcaldía Ejemplo, 00000 Ciudad de México"
# Escritos como escapes: en el código fuente no van caracteres invisibles ni bidi.
FORBIDDEN_ADDRESS_CHARACTERS = [
    # Control (Cc): C0, DEL y C1 (NEL incluido).
    "\x00", "\t", "\n", "\r", "\x1b", "\x1f", "\x7f", "\x85", "\x9f",
    # Formato (Cf): marca de letra árabe, ancho cero, LRM/RLM, bidi, word joiner y BOM.
    "\u061c", "\u200b", "\u200e", "\u200f",
    "\u202a", "\u202b", "\u202c", "\u202d", "\u202e",
    "\u2060", "\u2066", "\u2067", "\u2068", "\u2069", "\ufeff",
    # Separadores de línea y de párrafo (Zl, Zp).
    "\u2028", "\u2029",
]


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


def store_settings(**changes):
    row = StoreSettings.objects.get(pk=1)
    for name, value in changes.items():
        setattr(row, name, value)
    return row


def admin_form_data(**overrides):
    """Datos del formulario del admin a partir de la fila sembrada."""
    values = model_to_dict(StoreSettings.objects.get(pk=1))
    values.pop("id", None)
    return {**{name: "" if value is None else value for name, value in values.items()}, **overrides}


# --- Modelo: dirección y WhatsApp ---


@pytest.mark.django_db
def test_seeded_row_leaves_address_and_whatsapp_empty():
    row = StoreSettings.objects.get(pk=1)
    assert (row.address, row.whatsapp) == ("", "")


def test_address_and_whatsapp_are_optional_and_have_no_invented_default():
    for name in ("address", "whatsapp"):
        field = StoreSettings._meta.get_field(name)
        assert field.blank is True
        assert field.null is False
        assert field.get_default() == ""


def test_address_and_whatsapp_help_text_marks_them_as_pending():
    for name in ("address", "whatsapp"):
        assert "PENDIENTE" in str(StoreSettings._meta.get_field(name).help_text)


@pytest.mark.django_db
@pytest.mark.parametrize("whatsapp", ["", *VALID_WHATSAPP])
def test_model_accepts_an_empty_or_well_formed_whatsapp(whatsapp):
    row = store_settings(whatsapp=whatsapp)
    row.full_clean()
    row.save()
    assert StoreSettings.objects.values_list("whatsapp", flat=True).get(pk=1) == whatsapp


@pytest.mark.django_db
@pytest.mark.parametrize("whatsapp", INVALID_WHATSAPP)
def test_model_rejects_a_malformed_whatsapp_with_its_format_message(whatsapp):
    with pytest.raises(ValidationError) as error:
        store_settings(whatsapp=whatsapp).full_clean()
    assert set(error.value.message_dict) == {"whatsapp"}
    assert WHATSAPP_FORMAT_MESSAGE in error.value.message_dict["whatsapp"]


@pytest.mark.django_db
@pytest.mark.parametrize("whatsapp", VALID_WHATSAPP)
def test_database_accepts_a_well_formed_whatsapp(whatsapp):
    StoreSettings.objects.filter(pk=1).update(whatsapp=whatsapp)
    assert StoreSettings.objects.get(pk=1).whatsapp == whatsapp


@pytest.mark.django_db
@pytest.mark.parametrize("whatsapp", INVALID_WHATSAPP_THAT_FITS)
def test_database_rejects_a_malformed_whatsapp_even_if_it_skips_validation(whatsapp):
    with pytest.raises(IntegrityError), transaction.atomic():
        StoreSettings.objects.filter(pk=1).update(whatsapp=whatsapp)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "address",
    [
        "",
        VALID_ADDRESS,
        "Calle 5 #12-B, int. 3 (frente al parque); C.P. 00000",
        "Av. Ejemplo No. 12-A, Col. Ñandú, Peña Pobre",
    ],
)
def test_model_accepts_an_address_with_accents_and_punctuation(address):
    row = store_settings(address=address)
    row.full_clean()
    row.save()
    assert StoreSettings.objects.values_list("address", flat=True).get(pk=1) == address


@pytest.mark.django_db
@pytest.mark.parametrize("character", FORBIDDEN_ADDRESS_CHARACTERS, ids=lambda c: f"U+{ord(c):04X}")
def test_model_rejects_control_and_bidi_characters_in_the_address(character):
    with pytest.raises(ValidationError) as error:
        store_settings(address=f"Calle Ñandú 12{character}Col. Árbol").full_clean()
    assert set(error.value.message_dict) == {"address"}
    assert ADDRESS_FORMAT_MESSAGE in error.value.message_dict["address"]


# --- Admin ---


def test_admin_fieldsets_show_every_editable_field_once():
    model_admin = django_admin.site._registry[StoreSettings]
    listed = [name for _, options in model_admin.fieldsets for name in options["fields"]]
    editable = [field.name for field in StoreSettings._meta.concrete_fields if field.editable and not field.primary_key]
    assert sorted(listed) == sorted(editable)
    assert len(listed) == len(set(listed))


@pytest.mark.django_db
def test_admin_form_shows_the_business_data_section_with_the_pending_marker(superuser_client):
    response = superuser_client.get(reverse(CHANGE_URL, args=[1]))
    assert response.status_code == 200
    sections = {fieldset.name: [field for line in fieldset for field in line] for fieldset in response.context["adminform"]}
    assert [field.field.name for field in sections[BUSINESS_DATA_SECTION]] == ["address", "whatsapp"]
    content = response.content.decode()
    assert BUSINESS_DATA_SECTION in content
    assert content.count("PENDIENTE") >= 2


@pytest.mark.django_db
def test_admin_saves_the_address_and_a_well_formed_whatsapp(superuser_client):
    response = superuser_client.post(
        reverse(CHANGE_URL, args=[1]), admin_form_data(address=VALID_ADDRESS, whatsapp="520000000000")
    )
    assert response.status_code == 302
    row = StoreSettings.objects.get(pk=1)
    assert (row.address, row.whatsapp) == (VALID_ADDRESS, "520000000000")


@pytest.mark.django_db
@pytest.mark.parametrize("whatsapp", ["+52 00 0000 0000", "00-0000", "abcdefghij"])
def test_admin_rejects_a_malformed_whatsapp_and_keeps_the_saved_one(superuser_client, whatsapp):
    response = superuser_client.post(reverse(CHANGE_URL, args=[1]), admin_form_data(whatsapp=whatsapp))
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["whatsapp"]
    assert StoreSettings.objects.get(pk=1).whatsapp == ""


@pytest.mark.django_db
@pytest.mark.parametrize("address", ["Calle 1\tCol. Árbol", "Calle 1\u202eCol. Árbol"])
def test_admin_rejects_an_address_with_hidden_characters(superuser_client, address):
    response = superuser_client.post(reverse(CHANGE_URL, args=[1]), admin_form_data(address=address))
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["address"] == [ADDRESS_FORMAT_MESSAGE]
    assert StoreSettings.objects.get(pk=1).address == ""


# --- Servicio, con el repositorio en memoria ---


def test_service_turns_empty_fields_into_none():
    info = store_info_service.get_store_info(settings=memory_cake_design.settings_repo())
    assert info == store_info_service.StoreInfo(
        address=None, whatsapp=None, opens_at=time(10, 0), closes_at=time(22, 30), custom_lead_days=2
    )


def test_service_treats_a_blank_address_as_empty_and_trims_it():
    store = replace(memory_cake_design.STORE_SETTINGS, address="   ", whatsapp="520000000000")
    info = store_info_service.get_store_info(settings=memory_cake_design.settings_repo(store=store))
    assert (info.address, info.whatsapp) == (None, "520000000000")
    store = replace(store, address="  Calle Ñandú 12  ")
    info = store_info_service.get_store_info(settings=memory_cake_design.settings_repo(store=store))
    assert info.address == "Calle Ñandú 12"


# --- Endpoint ---


@pytest.mark.django_db
def test_store_info_is_public_and_gives_null_for_the_pending_fields(api):
    response = api.get(STORE_INFO_URL)
    assert response.status_code == 200
    assert response.json() == SEEDED_STORE_INFO


@pytest.mark.django_db
def test_store_info_url_has_its_name():
    assert reverse("store-info") == STORE_INFO_URL


@pytest.mark.django_db
def test_store_info_returns_what_the_admin_saved(api):
    StoreSettings.objects.filter(pk=1).update(
        address=VALID_ADDRESS, whatsapp="520000000000", custom_lead_days=3
    )
    assert api.get(STORE_INFO_URL).json() == {
        **SEEDED_STORE_INFO,
        "address": VALID_ADDRESS,
        "whatsapp": "520000000000",
        "custom_lead_days": 3,
    }


@pytest.mark.django_db
def test_store_info_reads_the_current_hours_as_24_hour_hh_mm(api):
    StoreSettings.objects.filter(pk=1).update(store_opens_at=time(9, 5, 30), store_closes_at=time(23, 0))
    body = api.get(STORE_INFO_URL).json()
    assert (body["opens_at"], body["closes_at"]) == ("09:05", "23:00")


@pytest.mark.django_db
def test_store_info_gives_null_for_a_blank_address(api):
    StoreSettings.objects.filter(pk=1).update(address="   ")
    assert api.get(STORE_INFO_URL).json()["address"] is None


@pytest.mark.django_db
def test_store_info_without_the_settings_row_fails_like_the_other_settings():
    """Como las opciones y el precio: la fila la crea la migración y el admin no la borra.

    El 500 no deja ver el motivo: ni el mensaje de la excepción ni el comando.
    """
    StoreSettings.objects.all().delete()
    response = APIClient(raise_request_exception=False).get(STORE_INFO_URL)
    assert response.status_code == 500
    body = response.content.decode()
    assert "migrate" not in body
    assert "horarios y entregas" not in body
    assert "Falta la configuración" not in body


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_store_info_only_answers_get(api, method):
    response = getattr(api, method)(STORE_INFO_URL, {"address": "x"}, format="json")
    assert response.status_code == 405
    assert StoreSettings.objects.get(pk=1).address == ""


@pytest.mark.django_db
def test_store_info_ignores_an_invalid_token(api):
    """Sin sesión: un token vencido o falso no convierte la vista pública en 401."""
    api.credentials(HTTP_AUTHORIZATION="Bearer no-es-un-token")
    assert api.get(STORE_INFO_URL).status_code == 200


@pytest.mark.django_db
def test_store_info_does_not_read_the_session_or_the_token(customer_user):
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(customer_user)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(customer_user).access_token}")
    response = api.get(STORE_INFO_URL)
    assert response.status_code == 200
    assert response.renderer_context["request"].user.is_anonymous


@pytest.mark.django_db
def test_store_info_uses_its_own_rate(api, monkeypatch, customer_user):
    # Con la anónima y la de usuarios en 1/min, solo la propia (2/min) debe contar.
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"store_info": "2/min"})
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "1/min"})
    monkeypatch.setattr(UserRateThrottle, "THROTTLE_RATES", {"user": "1/min"})
    api.force_login(customer_user)
    assert [api.get(STORE_INFO_URL).status_code for _ in range(3)] == [200, 200, 429]


@pytest.mark.django_db
def test_store_info_and_the_price_do_not_share_their_quota(api, monkeypatch):
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"store_info": "2/min"})
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/min"})

    def price():
        return api.generic("POST", PRICE_URL, json.dumps(PRICE_REQUEST), content_type="application/json").status_code

    def store_info():
        return api.get(STORE_INFO_URL).status_code

    # Gastar el cupo anónimo con el precio no bloquea el pie...
    assert [price(), price(), price()] == [200, 200, 429]
    assert [store_info(), store_info(), store_info()] == [200, 200, 429]
    # ...y gastar el del pie no bloquea el precio.
    cache.clear()
    assert [store_info(), store_info(), store_info()] == [200, 200, 429]
    assert [price(), price(), price()] == [200, 200, 429]


def test_store_info_rate_is_configured(settings):
    rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["store_info"]
    requests, seconds = ScopedRateThrottle().parse_rate(rate)
    assert requests > 0 and seconds > 0


@pytest.mark.django_db
def test_store_info_is_in_the_openapi_schema(api, staff_user):
    api.force_login(staff_user)
    schema = api.get("/api/v1/schema/", {"format": "json"}).json()
    operations = schema["paths"][STORE_INFO_URL]
    assert set(operations) == {"get"}
    assert operations["get"]["operationId"] == "store_info"
    assert operations["get"].get("security") in (None, [], [{}])
    component = schema["components"]["schemas"]["StoreInfo"]
    assert set(component["properties"]) == set(component["required"]) == set(SEEDED_STORE_INFO)
    # Solo lo PENDIENTE puede ser `null`; el horario y los días siempre vienen.
    nullable = {name for name, prop in component["properties"].items() if prop.get("nullable")}
    assert nullable == {"address", "whatsapp"}
    examples = operations["get"]["responses"]["200"]["content"]["application/json"]["examples"]
    assert all(set(item["value"]) == set(SEEDED_STORE_INFO) for item in examples.values())
