"""Endpoints públicos de "Diseña tu pastel" contra PostgreSQL con la semilla de las migraciones."""
from decimal import Decimal

import io
import json

import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.api.parsers import MAX_JSON_BODY_BYTES, BoundedJSONParser, RequestBodyTooLarge
from core_pasteleria.models import CakeDesignSettings, CakeStand, DecorationOption

OPTIONS_URL = "/api/v1/cake-designs/options/"
PRICE_URL = "/api/v1/cake-designs/price/"

RULE_4_6_EXAMPLE = {
    "kg": 15,
    "cake_type": "tres_leches",
    "bread": "chocolate",
    "filling_base": "queso",
    "filling_flavors": ["zarzamora"],
}

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    return APIClient()


def by_slug(items):
    return {item["slug"]: item for item in items}


# --- Opciones ---


def test_options_are_public(api):
    assert api.get(OPTIONS_URL).status_code == 200


def test_options_ignore_an_invalid_token(api):
    """Sin sesión: un token vencido o falso no convierte la vista pública en 401."""
    api.credentials(HTTP_AUTHORIZATION="Bearer no-es-un-token")
    assert api.get(OPTIONS_URL).status_code == 200


def test_options_carry_the_seeded_data(api):
    body = api.get(OPTIONS_URL).json()
    assert [t["value"] for t in body["cake_types"]] == ["tres_leches", "seco", "envinado"]
    breads = by_slug(body["breads"])
    assert list(breads) == ["vainilla", "chocolate", "choco_vainilla", "choco_pinguino", "red_velvet"]
    assert breads["red_velvet"]["unavailable_reasons"] == {
        "tres_leches": "Solo en pastel seco", "envinado": "Solo en pastel seco",
    }
    assert breads["choco_pinguino"]["allowed_cake_types"] == ["tres_leches", "seco"]
    assert breads["chocolate"]["price_per_kg_from"] == {
        "tres_leches": "185.00", "seco": "185.00", "envinado": "205.00",
    }
    assert breads["red_velvet"]["price_per_kg_from"] == {"seco": "280.00"}
    bases = by_slug(body["filling_bases"])
    assert list(bases) == ["normal", "queso", "flan"]
    assert bases["queso"]["price_per_kg_by_cake_type"] == {
        "tres_leches": "250.00", "seco": "250.00", "envinado": "250.00",
    }
    yogurt = by_slug(bases["normal"]["flavors"])["fresa_yogurt"]
    assert yogurt["unavailable_reasons"] == {"envinado": "No disponible en pastel envinado"}
    assert yogurt["is_combinable"] is False
    assert len(body["coverage_colors"]) == 11
    assert body["limits"] == {
        "people_per_kg": 7,
        "min_custom_kg": 4,
        "max_online_kg": 50,
        "wafer_price": "125.00",
        "wafer_max_width_cm": "21.6",
        "wafer_max_height_cm": "27.9",
        "message_suggested_max_words": 4,
    }
    assert [t["tiers"] for t in body["tier_recommendations"]] == [1, 2, 3, 4, 5]


def test_options_show_seeded_pending_decorations_disabled_with_their_reason(api):
    decorations = by_slug(api.get(OPTIONS_URL).json()["decorations"])
    assert list(decorations) == ["ninguna", "duya", "flores", "chispas", "otra"]
    # La semilla deja PENDIENTE las decoraciones fijas: se muestran, desactivadas.
    for slug in ("duya", "flores", "chispas"):
        assert decorations[slug]["available"] is False
        assert decorations[slug]["unavailable_reason"] == "Precio por confirmar"
        assert (decorations[slug]["price"], decorations[slug]["price_pending"]) == (None, True)
    assert decorations["otra"]["requires_quote"] is True
    assert decorations["otra"]["available"] is True


def test_options_reject_post(api):
    assert api.post(OPTIONS_URL, {}, format="json").status_code == 405


# --- Precio ---


def test_price_of_the_rule_4_6_example_with_its_stand_deposit(api):
    response = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json")
    assert response.status_code == 200
    assert response.json() == {
        "price_per_kg": "255.00",
        "kg": 15,
        "cake_subtotal": "3825.00",
        "wafer": "0.00",
        "decoration": "0.00",
        "total": "3825.00",
        "requires_quote": False,
        "is_estimate": False,
        "stand": {"min_kg": 15, "max_kg": 15, "deposit": "200.00"},
        # Con `kg` no hay cálculo por personas.
        "size": None,
    }


def test_price_with_wafer_and_otra_decoracion(api):
    body = api.post(
        PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 9, "wafer": True, "decoration": "otra"}, format="json"
    ).json()
    assert (body["total"], body["wafer"], body["requires_quote"]) == ("2420.00", "125.00", True)
    assert body["stand"] == {"min_kg": 10, "max_kg": 12, "deposit": "150.00"}


def test_price_reads_the_current_settings(api):
    CakeDesignSettings.objects.filter(pk=1).update(wafer_price=Decimal("130"))
    DecorationOption.objects.filter(slug="duya").update(price=Decimal("90"))
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True, "decoration": "duya"}, format="json").json()
    assert (body["wafer"], body["decoration"], body["total"]) == ("130.00", "90.00", "4045.00")


def test_price_ignores_amounts_sent_by_the_client(api):
    tampered = {**RULE_4_6_EXAMPLE, "total": "1.00", "price_per_kg": "1.00", "wafer_price": "0", "deposit": "0"}
    body = api.post(PRICE_URL, tampered, format="json").json()
    assert (body["total"], body["price_per_kg"], body["stand"]["deposit"]) == ("3825.00", "255.00", "200.00")


def test_price_ignores_shape_and_tiers(api):
    plain = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json")
    shaped = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "shape": "rectangular", "tiers": 2}, format="json")
    assert (plain.status_code, shaped.status_code) == (200, 200)
    assert plain.json() == shaped.json()


def test_price_ignores_shape_and_tiers_even_if_malformed(api):
    """Forma y pisos se validarán con `CakeDesign`; hoy el precio no los lee."""
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "shape": "hexagonal", "tiers": "muchos"}, format="json")
    assert response.status_code == 200


def test_price_is_public_and_needs_no_csrf_even_with_a_session(customer_user):
    api = APIClient(enforce_csrf_checks=True)
    assert api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").status_code == 200
    # Con la sesión iniciada y sin token CSRF: la vista no lee la sesión y no guarda nada.
    api.force_login(customer_user)
    assert api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").status_code == 200
    token = RefreshToken.for_user(customer_user).access_token
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").status_code == 200


@pytest.mark.parametrize("url", [OPTIONS_URL, PRICE_URL])
def test_public_endpoints_use_the_anonymous_rate(api, monkeypatch, url, customer_user):
    # Con la tasa de usuarios en 1/min, solo la anónima (2/min) debe contar.
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/min"})
    monkeypatch.setattr(UserRateThrottle, "THROTTLE_RATES", {"user": "1/min"})
    api.force_login(customer_user)

    def call():
        return api.generic(
            "GET" if url == OPTIONS_URL else "POST", url, json.dumps(RULE_4_6_EXAMPLE),
            content_type="application/json",
        ).status_code

    assert [call(), call(), call()] == [200, 200, 429]


def test_kilos_beyond_the_active_stands_are_rejected_by_field(api):
    """Sin base para esos kilos, el máximo efectivo baja a la base más grande y lo dice una sola vez."""
    CakeStand.objects.filter(max_kg__gt=40).update(is_active=False)
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 45}, format="json")
    assert response.status_code == 400
    assert response.json() == {"kg": ["En línea el máximo es 40 kg. Para más, escríbenos por WhatsApp."]}


@pytest.mark.parametrize(
    ("kg", "message"),
    [
        # Por abajo no hay tope técnico: el mínimo lo dice el servicio, con la cifra vigente.
        (0, "El pedido es de mínimo 4 kg."),
        (-3, "El pedido es de mínimo 4 kg."),
        (1001, "Son demasiados kilos para pedir en línea. Escríbenos por WhatsApp."),
        ("4.5", "Los kilos van en números enteros."),
    ],
)
def test_kilo_errors_are_in_spanish_from_mexico(api, kg, message):
    """El serializador solo pone un tope técnico (1000 kg); el rango de la regla lo da el servicio."""
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": kg}, format="json")
    assert response.status_code == 400
    assert response.json() == {"kg": [message]}


def test_price_and_stand_errors_come_back_together(api):
    """Si fallan el pan y la base del pastel, la respuesta trae los dos campos."""
    CakeStand.objects.filter(max_kg__gt=40).update(is_active=False)
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 45, "bread": "red_velvet",
                                    "filling_base": None, "filling_flavors": []}, format="json")
    assert response.status_code == 400
    assert response.json() == {
        "bread": ["Red velvet: solo en pastel seco."],
        "kg": ["En línea el máximo es 40 kg. Para más, escríbenos por WhatsApp."],
    }


def test_a_field_keeps_the_first_reason_only(api):
    """60 kg pasa el máximo en línea y no tiene base: se dice una vez, con el motivo del precio."""
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 60}, format="json")
    assert response.status_code == 400
    assert response.json() == {"kg": ["En línea el máximo es 50 kg. Para más, escríbenos por WhatsApp."]}


# --- Cuerpo de la petición ---


@pytest.mark.parametrize("format_", ["multipart", None])
def test_only_json_bodies_are_accepted(api, format_):
    if format_ is None:
        response = api.post(PRICE_URL, "kg=15", content_type="application/x-www-form-urlencoded")
    else:
        response = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format=format_)
    assert response.status_code == 415


def test_a_body_over_16_kb_is_rejected_before_parsing(api):
    padding = "x" * (17 * 1024)
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "padding": padding}, format="json")
    assert response.status_code == 413
    assert response.json() == {"detail": "La petición es demasiado grande."}


def test_deeply_nested_json_is_a_parse_error_not_a_500(api):
    response = api.generic("POST", PRICE_URL, "[" * 5000, content_type="application/json")
    assert response.status_code == 400
    assert response.json() == {"detail": "JSON inválido."}


def test_huge_nested_json_is_rejected_for_its_size(api):
    response = api.generic("POST", PRICE_URL, "[" * 50000, content_type="application/json")
    assert response.status_code == 413


def test_the_parser_caps_what_it_reads_even_without_a_declared_length():
    """Defensa en profundidad: sin `CONTENT_LENGTH`, el parser no lee más que el tope."""
    body = io.BytesIO(b'{"padding": "' + b"x" * (10 * MAX_JSON_BODY_BYTES) + b'"}')
    with pytest.raises(RequestBodyTooLarge):
        BoundedJSONParser().parse(body, "application/json", {})
    # No leyó el cuerpo entero: solo el tope más un byte para saber que se pasó.
    assert body.tell() == MAX_JSON_BODY_BYTES + 1


def test_the_parser_reads_a_body_at_the_cap():
    padding = "x" * (MAX_JSON_BODY_BYTES - len('{"p": ""}'))
    body = io.BytesIO(json.dumps({"p": padding}, separators=(",", ":")).encode())
    assert BoundedJSONParser().parse(body, "application/json", {}) == {"p": padding}


def test_malformed_json_is_a_400(api):
    response = api.generic("POST", PRICE_URL, "{kg: 15", content_type="application/json")
    assert response.status_code == 400


def test_price_rejects_get(api):
    assert api.get(PRICE_URL).status_code == 405


def test_seeded_pending_decoration_is_rejected_by_field(api):
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "flores"}, format="json")
    assert response.status_code == 400
    assert response.json() == {"decoration": ["Precio por confirmar"]}


def test_business_errors_come_back_by_field_in_spanish(api):
    response = api.post(
        PRICE_URL,
        {"kg": 60, "cake_type": "envinado", "bread": "choco_pinguino", "filling_base": "normal",
         "filling_flavors": ["fresa"]},
        format="json",
    )
    assert response.status_code == 400
    assert response.json() == {
        "kg": ["En línea el máximo es 50 kg. Para más, escríbenos por WhatsApp."],
        "bread": ["Choco-pingüino: no se combina con pastel envinado."],
    }


def test_missing_and_malformed_fields_are_rejected_by_the_serializer(api):
    response = api.post(
        PRICE_URL,
        {"kg": "mucho", "cake_type": "helado", "filling_flavors": ["a" * 61], "wafer": "tal vez"},
        format="json",
    )
    assert response.status_code == 400
    errors = response.json()
    assert set(errors) == {"kg", "cake_type", "bread", "filling_flavors", "wafer"}
    assert errors["bread"] == ["Este campo es requerido."]
    assert errors["kg"] == ["Los kilos van en números enteros."]


def test_flavor_lists_are_bounded(api):
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "filling_flavors": ["fresa"] * 6}, format="json")
    assert response.status_code == 400
    assert list(response.json()) == ["filling_flavors"]


def test_slugs_are_validated(api):
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "bread": "<script>"}, format="json")
    assert response.status_code == 400
    assert list(response.json()) == ["bread"]


def test_both_endpoints_are_in_the_openapi_schema(api, staff_user):
    api.force_login(staff_user)
    paths = api.get("/api/v1/schema/", {"format": "json"}).json()["paths"]
    assert set(paths[OPTIONS_URL]) == {"get"}
    assert set(paths[PRICE_URL]) == {"post"}
    assert "security" not in paths[PRICE_URL]["post"] or paths[PRICE_URL]["post"]["security"] in ([], [{}])
    request_body = paths[PRICE_URL]["post"]["requestBody"]["content"]
    assert set(request_body) == {"application/json"}
    request_schema = api.get("/api/v1/schema/", {"format": "json"}).json()["components"]["schemas"][
        "CakeDesignPriceRequest"
    ]
    assert not {"shape", "tiers"} & set(request_schema["properties"])


# --- Total estimado y alternativas más chicas ---


def test_price_estimate_without_flavor_is_the_from_price(api):
    body = api.post(
        PRICE_URL,
        {"kg": 6, "cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal", "estimate": True},
        format="json",
    ).json()
    assert (body["price_per_kg"], body["total"], body["size"]) == ("180.00", "1080.00", None)


def test_price_without_estimate_still_asks_for_the_flavor(api):
    response = api.post(
        PRICE_URL, {"kg": 6, "cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal"}, format="json"
    )
    assert response.status_code == 400
    assert response.json() == {"filling_flavors": ["Elige el sabor del relleno."]}


ESTIMATE_BY_PEOPLE = {"cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal", "estimate": True}


def test_price_by_people_returns_the_kilos_the_server_computed(api):
    body = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 40}, format="json").json()
    assert (body["kg"], body["total"]) == (6, "1080.00")
    assert body["size"] == {
        "people": 40, "rounded_kg": 6, "kg": 6, "below_minimum": False, "above_maximum": False,
        "minimum_people": 28, "max_online_people": 350,
    }


def test_price_by_people_below_the_minimum_prices_the_minimum(api):
    body = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 15}, format="json").json()
    assert (body["kg"], body["total"], body["size"]["rounded_kg"], body["size"]["below_minimum"]) == (4, "720.00", 2, True)


def test_price_by_people_above_the_online_maximum_has_no_amounts(api):
    response = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 400}, format="json")
    assert response.status_code == 200
    body = response.json()
    assert (body["total"], body["kg"], body["stand"]) == (None, None, None)
    assert (body["size"]["rounded_kg"], body["size"]["above_maximum"]) == (57, True)


@pytest.mark.parametrize(
    ("extra", "errors"),
    [
        ({"people": 40, "kg": 6}, {"people": ["Indica las personas o los kilos, no los dos."]}),
        ({}, {"people": ["Indica para cuántas personas es el pastel."]}),
        ({"people": 0}, {"people": ["Indica al menos una persona."]}),
        ({"people": "muchas"}, {"people": ["Las personas van en números enteros."]}),
    ],
)
def test_people_and_kilos_are_validated_in_spanish(api, extra, errors):
    response = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, **extra}, format="json")
    assert response.status_code == 400
    assert response.json() == errors


def test_a_rejected_choice_by_people_still_returns_the_kilos(api):
    response = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 40, "bread": "brioche"}, format="json")
    assert response.status_code == 400
    assert response.json() == {
        "bread": ["Ese pan no existe o no está disponible."],
        "size": {
            "people": 40, "rounded_kg": 6, "kg": 6, "below_minimum": False, "above_maximum": False,
            "minimum_people": 28, "max_online_people": 350,
        },
    }


def test_a_rejected_choice_by_kilos_has_no_size(api):
    response = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "kg": 6, "bread": "brioche"}, format="json")
    assert response.status_code == 400
    assert "size" not in response.json()


def test_the_response_says_whether_the_total_is_an_estimate(api):
    estimate = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 40}, format="json").json()
    regular = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").json()
    assert (estimate["is_estimate"], regular["is_estimate"]) == (True, False)


def test_the_online_maximum_follows_the_largest_active_stand(api):
    CakeStand.objects.filter(max_kg__gt=25).update(is_active=False)
    body = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": 200}, format="json").json()
    assert (body["size"]["above_maximum"], body["size"]["max_online_people"], body["total"]) == (True, 175, None)


def test_options_carry_a_code_next_to_each_reason(api):
    breads = by_slug(api.get(OPTIONS_URL).json()["breads"])
    assert breads["choco_pinguino"]["unavailable_codes"] == {"envinado": "not_combinable"}
    assert breads["red_velvet"]["unavailable_codes"] == {"tres_leches": "only_in", "envinado": "only_in"}
    yogurt = by_slug(by_slug(api.get(OPTIONS_URL).json()["filling_bases"])["normal"]["flavors"])["fresa_yogurt"]
    assert yogurt["unavailable_codes"] == {"envinado": "not_offered"}


def test_options_carry_the_smaller_alternatives_from_the_catalog(api):
    assert api.get(OPTIONS_URL).json()["smaller_alternatives"] == {
        "showcase_cake": {"approx_weight_kg": "2.7", "servings": 19},
        "mini_cake": {"approx_weight_kg": None, "servings": 3},
    }
