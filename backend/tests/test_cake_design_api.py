"""Endpoints públicos de "Diseña tu pastel" contra PostgreSQL con la semilla de las migraciones."""
from decimal import Decimal

import io
import json

import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.api.serializers import MessageLayoutSerializer
from core_pasteleria.api.parsers import MAX_JSON_BODY_BYTES, BoundedJSONParser, RequestBodyTooLarge
from core_pasteleria.models import CakeDesignSettings, CakeMold, CakeStand, DecorationOption, PolicySettings

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
    # Regla 3.3 (D50): kilos mínimos que bloquean, no recomendaciones.
    assert body["tier_minimums"] == [
        {"tiers": 1, "min_kg": 0}, {"tiers": 2, "min_kg": 15}, {"tiers": 3, "min_kg": 18},
        {"tiers": 4, "min_kg": 25}, {"tiers": 5, "min_kg": 30},
    ]


def test_options_show_the_confirmed_decoration_prices_and_sprinkle_sources(api):
    decorations = by_slug(api.get(OPTIONS_URL).json()["decorations"])
    assert list(decorations) == [
        "ninguna", "duya", "rosetones", "festones", "olanes", "flores", "chispas", "chispas-chocolate", "chispas-choco-vainilla", "otra",
    ]
    # Los diseños sencillos y los tres tipos de chispas van incluidos: no suman (regla 6.1).
    for slug in ("ninguna", "duya", "rosetones", "festones", "olanes", "chispas", "chispas-chocolate", "chispas-choco-vainilla"):
        assert (decorations[slug]["pricing"], decorations[slug]["price"], decorations[slug]["available"]) == ("included", None, True)
    assert (decorations["flores"]["pricing"], decorations["flores"]["price"], decorations["flores"]["available"]) == ("fixed", "120.00", True)
    assert decorations["otra"]["requires_quote"] is True
    assert decorations["otra"]["available"] is True
    # Las chispas dicen de qué sabor o pan salen su estilo y sus colores; lo demás, nada.
    sources = {slug: (d["preview_flavor"], d["preview_bread"]) for slug, d in decorations.items()}
    assert sources["chispas"] == ("capuchino", None)
    assert sources["chispas-chocolate"] == (None, "choco_pinguino")
    assert sources["chispas-choco-vainilla"] == ("choco_vainilla", None)
    assert sources["flores"] == (None, None)


def test_rosas_adds_its_fixed_price_and_the_included_designs_add_nothing(api):
    rosas = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "flores"}, format="json").json()
    assert (rosas["decoration"], rosas["total"]) == ("120.00", "3945.00")
    for slug in ("duya", "olanes", "chispas-chocolate"):
        body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": slug}, format="json").json()
        assert (body["decoration"], body["total"]) == ("0.00", "3825.00")


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
        "stand": {"min_kg": 15, "max_kg": 15, "deposit": "200.00", "return_days": 15},
        # Regla 10: el anticipo es el 50% del pedido; la base va completa y aparte.
        "payment": {
            "advance_percent": 50,
            "advance": "1912.50",
            "base_deposit": "200.00",
            "delivery_fee": "0.00",
            "pay_today": "2112.50",
            "pay_on_delivery": "1912.50",
        },
        # Con `kg` no hay cálculo por personas.
        "size": None,
    }


def test_price_with_wafer_and_otra_decoracion(api):
    body = api.post(
        PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 9, "wafer": True, "decoration": "otra"}, format="json"
    ).json()
    assert (body["total"], body["wafer"], body["requires_quote"]) == ("2420.00", "125.00", True)
    assert body["stand"] == {"min_kg": 10, "max_kg": 12, "deposit": "150.00", "return_days": 15}


def test_price_payment_follows_the_advance_percent_of_the_admin(api):
    PolicySettings.objects.filter(pk=1).update(advance_percent=30)
    payment = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").json()["payment"]
    assert (payment["advance_percent"], payment["advance"], payment["pay_today"], payment["pay_on_delivery"]) == (
        30, "1147.50", "1347.50", "2677.50",
    )


def test_price_payment_is_null_when_the_pastry_shop_still_has_to_quote(api):
    """Con "Otra decoración" el pedido queda en pausa: no se cobra ni anticipo ni depósito."""
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "otra"}, format="json").json()
    assert body["requires_quote"] is True
    assert body["payment"] is None
    assert body["stand"]["deposit"] == "200.00"


def test_price_payment_adds_the_deposit_of_the_smaller_stand(api):
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "kg": 4}, format="json").json()
    assert (body["total"], body["stand"]["deposit"]) == ("1020.00", "70.00")
    payment = body["payment"]
    assert (payment["advance"], payment["pay_today"], payment["pay_on_delivery"]) == ("510.00", "580.00", "510.00")


def test_a_wafer_without_a_price_is_pending_and_cannot_be_ordered(api):
    CakeDesignSettings.objects.filter(pk=1).update(wafer_price=None)
    options = api.get(OPTIONS_URL).json()
    assert options["limits"]["wafer_price"] is None
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True}, format="json")
    assert response.status_code == 400
    assert response.json() == {"wafer": ["Precio por confirmar"]}
    # Sin oblea el precio sigue igual: la oblea pendiente no frena el pedido.
    assert api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json").status_code == 200


def test_price_reads_the_current_settings(api):
    CakeDesignSettings.objects.filter(pk=1).update(wafer_price=Decimal("130"))
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("90"))
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True, "decoration": "flores"}, format="json").json()
    assert (body["wafer"], body["decoration"], body["total"]) == ("130.00", "90.00", "4045.00")


def test_price_ignores_amounts_sent_by_the_client(api):
    tampered = {**RULE_4_6_EXAMPLE, "total": "1.00", "price_per_kg": "1.00", "wafer_price": "0", "deposit": "0"}
    body = api.post(PRICE_URL, tampered, format="json").json()
    assert (body["total"], body["price_per_kg"], body["stand"]["deposit"]) == ("3825.00", "255.00", "200.00")


def test_form_and_tiers_do_not_change_the_price(api):
    plain = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json")
    shaped = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "form": "rectangular", "tiers": 2}, format="json")
    assert (plain.status_code, shaped.status_code) == (200, 200)
    assert plain.json() == shaped.json()


@pytest.mark.parametrize(
    ("extra", "errors"),
    [
        ({"tiers": 3}, {"tiers": ["Para 3 pisos el pedido es desde 18 kg."]}),
        ({"tiers": 6}, {"tiers": ["El pastel lleva de 1 a 5 pisos."]}),
        ({"tiers": "muchos"}, {"tiers": ["Los pisos van en números enteros."]}),
        ({"tiers": 0}, {"tiers": ["El pastel lleva al menos un piso."]}),
        ({"tiers": -2}, {"tiers": ["El pastel lleva al menos un piso."]}),
        ({"tiers": 21}, {"tiers": ["Son demasiados pisos para pedir en línea. Escríbenos por WhatsApp."]}),
        ({"tiers": 10**30}, {"tiers": ["Son demasiados pisos para pedir en línea. Escríbenos por WhatsApp."]}),
        ({"form": "hexagonal"}, {"form": ["Elige una forma: redondo o rectangular."]}),
    ],
)
def test_form_and_tiers_are_validated_when_sent(api, extra, errors):
    """Regla 3.3 (D50): los kilos por pisos son mínimos que bloquean; 15 kg no llevan 3 pisos."""
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, **extra}, format="json")
    assert response.status_code == 400
    assert response.json() == errors


def test_an_unknown_key_like_shape_is_still_ignored(api):
    assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "shape": "hexagonal"}, format="json").status_code == 200


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


DESIGNS = ("duya", "rosetones", "festones", "olanes", "flores", "chispas")


@pytest.fixture
def pending_designs(db):
    """Los diseños como los dejó la pastelería sin definir su precio (PENDIENTE): cobro fijo y sin precio."""
    DecorationOption.objects.filter(slug__in=DESIGNS).update(pricing="fixed", price=None)


@pytest.mark.parametrize("slug", DESIGNS)
def test_pending_decoration_is_rejected_by_field(api, pending_designs, slug):
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": slug}, format="json")
    assert response.status_code == 400
    assert response.json() == {"decoration": ["Precio por confirmar"]}


@pytest.mark.parametrize("slug", DESIGNS)
def test_each_design_is_accepted_with_its_own_price_and_becomes_available(api, pending_designs, slug):
    DecorationOption.objects.filter(slug=slug).update(price=Decimal("85"))
    option = by_slug(api.get(OPTIONS_URL).json()["decorations"])[slug]
    assert (option["available"], option["price"], option["price_pending"]) == (True, "85.00", False)
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": slug}, format="json").json()
    assert (body["decoration"], body["total"], body["requires_quote"]) == ("85.00", "3910.00", False)


def test_a_priced_design_does_not_make_the_others_available(api, pending_designs):
    DecorationOption.objects.filter(slug="rosetones").update(price=Decimal("85"))
    decorations = by_slug(api.get(OPTIONS_URL).json()["decorations"])
    assert decorations["festones"]["available"] is False
    assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "festones"}, format="json").status_code == 400


def test_otra_decoracion_needs_no_price_and_adds_nothing(api):
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "otra"}, format="json").json()
    assert (body["decoration"], body["total"], body["requires_quote"]) == ("0.00", "3825.00", True)


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
    assert {"people", "kg", "tiers", "form", "estimate"} <= set(request_schema["properties"])
    assert "shape" not in request_schema["properties"]


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
        "minimum_people": 28, "max_online_people": 350, "max_tiers": 1,
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
            "minimum_people": 28, "max_online_people": 350, "max_tiers": 1,
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


@pytest.mark.parametrize(("people", "max_tiers"), [(40, 1), (105, 2), (126, 3), (175, 4), (210, 5)])
def test_the_size_says_how_many_tiers_the_kilos_allow(api, people, max_tiers):
    # 105 personas son 15 kg (2 pisos); 126, 18 kg; 175, 25 kg; 210, 30 kg.
    body = api.post(PRICE_URL, {**ESTIMATE_BY_PEOPLE, "people": people}, format="json").json()
    assert body["size"]["max_tiers"] == max_tiers


def test_without_active_stands_online_orders_are_not_available(api):
    CakeStand.objects.update(is_active=False)
    response = api.post(PRICE_URL, RULE_4_6_EXAMPLE, format="json")
    assert response.status_code == 400
    assert response.json()["kg"] == ["Por ahora no tomamos pedidos en línea. Escríbenos por WhatsApp."]


def test_options_carry_the_seeded_preview_styles(api):
    body = api.get(OPTIONS_URL).json()
    breads = by_slug(body["breads"])
    chocolate, vainilla = breads["chocolate"]["preview_color"], breads["vainilla"]["preview_color"]
    assert (breads["choco_vainilla"]["preview_color"], breads["choco_vainilla"]["preview_color_bottom"]) == (chocolate, vainilla)
    assert breads["vainilla"]["preview_color_bottom"] == ""
    flavors = by_slug(by_slug(body["filling_bases"])["normal"]["flavors"])
    styles = {slug: flavor["preview_style"] for slug, flavor in flavors.items()}
    assert styles == {
        "durazno": "fruit_chunks", "fresa": "fruit_chunks", "zarzamora": "smooth", "cajeta": "smooth",
        "galleta": "cookie_chunks", "chocolate": "sprinkles", "choco_vainilla": "sprinkles",
        "capuchino": "sprinkles", "fresa_yogurt": "crumbles", "nuez": "nut_pieces",
    }
    assert all(flavor["preview_color_secondary"] for flavor in flavors.values() if flavor["preview_style"] != "smooth")
    # Choco-pingüino y Red velvet traen cómo se ve su relleno incluido (crema pastelera con chispas o granillo rojo).
    assert (
        breads["choco_pinguino"]["included_filling_preview_style"],
        breads["choco_pinguino"]["included_filling_preview_color_secondary"],
    ) == ("round_chips", "#3A2218")
    assert (
        breads["red_velvet"]["included_filling_preview_style"],
        breads["red_velvet"]["included_filling_preview_color_secondary"],
    ) == ("sprinkles", "#C8283A")
    # Los panes sin relleno incluido quedan lisos y sin color.
    assert (breads["vainilla"]["included_filling_preview_style"], breads["vainilla"]["included_filling_preview_color_secondary"]) == ("smooth", "")


def test_options_carry_the_cake_molds_for_the_preview(api):
    molds = api.get(OPTIONS_URL).json()["cake_molds"]
    rounds = [m for m in molds if m["form"] == "round"]
    rectangles = [m for m in molds if m["form"] == "rectangular"]
    assert [(m["kg"], m["length_cm"]) for m in rounds] == [
        ("2.7", "28.0"), ("4.0", "34.0"), ("6.0", "37.0"), ("8.0", "41.0"), ("10.0", "47.0"), ("12.0", "51.5"),
    ]
    assert all(m["width_cm"] is None for m in rounds)
    assert [(m["kg"], m["length_cm"], m["width_cm"]) for m in rectangles] == [
        ("4.0", "41.0", "26.0"), ("5.0", "42.0", "28.0"), ("6.0", "45.4", "29.5"), ("7.0", "48.0", "33.0"),
        ("8.0", "50.0", "33.0"), ("9.0", "53.5", "41.0"), ("10.0", "60.0", "44.0"),
    ]


def test_a_mold_the_bakery_adds_in_the_admin_reaches_the_options(api):
    CakeMold.objects.create(form="round", kg=Decimal("14"), length_cm=Decimal("55"))
    molds = api.get(OPTIONS_URL).json()["cake_molds"]
    assert {"form": "round", "kg": "14.0", "length_cm": "55.0", "width_cm": None} in molds


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


def test_price_rejects_sprinkles_whose_source_is_inactive_like_the_options_say(api):
    from core_pasteleria.models import FillingFlavor

    FillingFlavor.objects.filter(slug="capuchino").update(is_active=False)
    option = by_slug(api.get(OPTIONS_URL).json()["decorations"])["chispas"]
    assert (option["available"], option["unavailable_reason"]) == (False, "No disponible por ahora")
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "decoration": "chispas"}, format="json")
    assert response.status_code == 400
    assert response.json() == {"decoration": ["No disponible por ahora"]}


# --- Oblea y mensaje del paso 7: su acomodo se valida y no cambia el precio ---

WAFER_LAYOUT = {
    "shape": "sheet", "width_cm": 21.0, "height_cm": 27.0, "rotation_deg": 15, "x": 0.1, "y": -0.2,
    "image_zoom": 1.5, "image_x": 0.25, "image_y": -0.5,
}
HEX_MESSAGE = "Escribe el color como #RRGGBB, por ejemplo #F0CE8A."
MESSAGE_LAYOUT = {
    "text": "Feliz cumpleaños Ana", "color_mode": "tones", "color": "deep", "arrangement": "arc", "curve": 0.6,
    "scale": 0.2, "rotation_deg": 0, "x": 0, "y": -0.7,
}


def test_a_valid_layout_is_accepted_and_does_not_change_the_price(api):
    plain = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True}, format="json").json()
    body = api.post(
        PRICE_URL,
        {**RULE_4_6_EXAMPLE, "wafer": True, "wafer_layout": WAFER_LAYOUT, "message_layout": MESSAGE_LAYOUT},
        format="json",
    )
    assert body.status_code == 200
    assert body.json() == plain


def test_a_wafer_layout_needs_the_wafer(api):
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer_layout": WAFER_LAYOUT}, format="json")
    assert response.status_code == 400
    assert response.json() == {"wafer_layout": ["Elige la oblea para acomodarla."]}


@pytest.mark.parametrize(
    "changes, message",
    [
        ({"width_cm": 22.0, "height_cm": 28.0}, "La oblea no puede pasar de la hoja carta (21.6 × 27.9 cm)."),
        ({"width_cm": 20.0, "height_cm": 22.0}, None),
        ({"width_cm": 27.9, "height_cm": 21.6}, None),
        ({"width_cm": 27.9, "height_cm": 21.7}, "La oblea no puede pasar de la hoja carta (21.6 × 27.9 cm)."),
        ({"shape": "circle", "width_cm": 21.6, "height_cm": 21.6}, None),
        ({"shape": "circle", "width_cm": 22.0, "height_cm": 22.0}, "La oblea no puede pasar de la hoja carta (21.6 × 27.9 cm)."),
        ({"shape": "circle", "width_cm": 10.0, "height_cm": 12.0}, "El círculo lleva un solo diámetro."),
        ({"width_cm": 1.0, "height_cm": 10.0}, None),
    ],
)
def test_the_wafer_never_passes_the_letter_sheet_in_either_orientation(api, changes, message):
    layout = {**WAFER_LAYOUT, **changes}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True, "wafer_layout": layout}, format="json")
    if message is None and changes.get("width_cm") == 1.0:
        # Menos de 2 cm lo frena el serializador con su propio texto.
        assert response.status_code == 400 and "width_cm" in response.json()["wafer_layout"]
    elif message is None:
        assert response.status_code == 200
    else:
        assert response.status_code == 400
        assert response.json() == {"wafer_layout": [message]}


def test_the_letter_limit_follows_the_sizes_the_pastry_shop_sets(api):
    CakeDesignSettings.objects.filter(pk=1).update(wafer_max_width_cm=Decimal("15.0"), wafer_max_height_cm=Decimal("20.0"))
    layout = {**WAFER_LAYOUT, "width_cm": 21.0, "height_cm": 27.0}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True, "wafer_layout": layout}, format="json")
    assert response.json() == {"wafer_layout": ["La oblea no puede pasar de la hoja carta (15 × 20 cm)."]}


@pytest.mark.parametrize(
    "field, value",
    [
        ("x", 11), ("y", -11), ("rotation_deg", 181), ("image_zoom", 0.5), ("image_zoom", 4.5),
        ("image_x", 1.5), ("image_y", -1.5), ("shape", "triangle"),
    ],
)
def test_wafer_layout_numbers_have_reasonable_bounds(api, field, value):
    layout = {**WAFER_LAYOUT, field: value}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "wafer": True, "wafer_layout": layout}, format="json")
    assert response.status_code == 400
    assert field in response.json()["wafer_layout"]


def _unsafe_texts():
    """Textos que no se imprimen bien, armados por código para que ningún editor los cambie por otro carácter."""
    ch = chr
    return [
        "hola" + ch(0x202E) + "Ana",  # invierte el texto (Cf)
        "dos\nlíneas",  # control (Cc)
        "a" + ch(0x061C) + "b",  # marca de letra árabe (Cf)
        "a" + ch(0x00AD) + "b",  # guion suave (Cf)
        "a" + ch(0x180E) + "b",  # separador mongol (Cf)
        "a" + ch(0xFFF9) + "b",  # anotación interlineal (Cf)
        "a" + ch(0xE0041) + "b",  # etiqueta (Cf)
        "a" + ch(0x1D173) + "b",  # control musical (Cf)
        "a" + ch(0x200D) + "b",  # ZWJ (Cf)
        "a" + ch(0xE000) + "b",  # uso privado (Co)
        "a" + ch(0xFFFF) + "b",  # sin asignar (Cn)
        "a" + ch(0xD800) + "b",  # sustituto suelto (Cs)
        "a" + ch(0x2028) + "b",  # separador de línea (Zl)
        "a" + ch(0x2029) + "b",  # separador de párrafo (Zp)
        "a" + ch(0x3164) + "b",  # relleno de hangul
        "a" + ch(0xFFA0) + "b",  # relleno de hangul de ancho medio
        "a" + ch(0x2800) + "b",  # braille vacío
        "a" + ch(0x034F) + "b",  # junta de grafemas
        "a" + ch(0x17B4) + "b",  # vocal inherente del jemer
        "a" + ch(0x17B5) + "b",
        *("a" + ch(code) + "b" for code in range(0x180B, 0x1810)),  # selectores de variación mongoles
        "a" + ch(0x115F) + ch(0x1160),
        "a" + ch(0x0301) * 3,  # tres acentos encimados
        "a" + ch(0x0301) * 79,  # el texto apilado
        "a" + ch(0x20DD) * 3,  # marcas que encierran (Me)
    ]


@pytest.mark.parametrize("text", _unsafe_texts())
def test_a_message_with_characters_that_do_not_print_well_is_rejected(api, text):
    layout = {**MESSAGE_LAYOUT, "text": text}
    # Se manda el JSON ya escapado (`ensure_ascii`): el cliente de pruebas no puede codificar un sustituto suelto.
    response = api.post(
        PRICE_URL, json.dumps({**RULE_4_6_EXAMPLE, "message_layout": layout}), content_type="application/json"
    )
    assert response.status_code == 400
    assert set(response.json()["message_layout"]) == {"text"}


def test_a_lone_surrogate_gets_the_spanish_message(api):
    layout = {**MESSAGE_LAYOUT, "text": "a" + chr(0xD800) + "b"}
    response = api.post(
        PRICE_URL, json.dumps({**RULE_4_6_EXAMPLE, "message_layout": layout}), content_type="application/json"
    )
    assert response.json() == {"message_layout": {"text": ["El mensaje lleva caracteres que no se pueden imprimir."]}}


@pytest.mark.parametrize("text", ["Feliz cumpleaños Ana", "Ñandú y pingüino", "a" + chr(0x0301), "a" + chr(0x0301) * 2, "¡Qué día! 🎂"])
def test_accents_and_emoji_are_fine(api, text):
    layout = {**MESSAGE_LAYOUT, "text": text}
    assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json").status_code == 200


@pytest.mark.parametrize("value", [True, False, "1e400", "nan", 10**400])
def test_layout_numbers_are_real_numbers(api, value):
    layout = {**MESSAGE_LAYOUT, "x": value}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json")
    assert response.status_code == 400
    assert set(response.json()["message_layout"]) == {"x"}


def test_a_huge_integer_gets_a_spanish_message_not_a_500(api):
    layout = {**MESSAGE_LAYOUT, "x": 10**400}
    body = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json").json()
    assert body == {"message_layout": {"x": ["Ese número es demasiado grande."]}}


@pytest.mark.parametrize(
    "changes",
    [
        {"text": ""}, {"text": "a" * 81},
        {"scale": 0.01}, {"scale": 2}, {"curve": 1.5}, {"arrangement": "wave"}, {"color_mode": "rainbow"},
        {"x": 11}, {"rotation_deg": -200},
    ],
)
def test_message_layout_fields_have_reasonable_bounds(api, changes):
    layout = {**MESSAGE_LAYOUT, **changes}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json")
    assert response.status_code == 400
    assert set(response.json()["message_layout"]) == set(changes)


@pytest.mark.parametrize(
    "changes, message",
    [
        ({"color_mode": "auto"}, "El color automático no lleva un color elegido."),
        ({"color_mode": "tones", "color": "lila"}, "Elige el tono más oscuro o el más claro de la cobertura."),
        ({"color_mode": "custom", "color": "deep"}, HEX_MESSAGE),
        ({"color_mode": "custom", "color": None}, HEX_MESSAGE),
        ({"arrangement": "arc", "curve": 0.0}, "Un mensaje en arco necesita algo de curva."),
    ],
)
def test_message_color_must_match_its_mode_and_an_arc_needs_curve(api, changes, message):
    layout = {**MESSAGE_LAYOUT, **changes}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json")
    assert response.status_code == 400
    assert response.json() == {"message_layout": [message]}


@pytest.mark.parametrize("color", ["#F6B8CA", "#f6b8ca", "#000000", "#FFFFFF", "#808080", "#0a1B2c"])
def test_message_color_accepts_any_hex_color_in_custom_mode(api, color):
    layout = {**MESSAGE_LAYOUT, "color_mode": "custom", "color": color}
    assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json").status_code == 200


@pytest.mark.parametrize(
    "color",
    ["rosa", "red", "#abc", "#12345", "#1234567", "#12345678", "F6B8CA", "#F6B8CG", " #F6B8CA", "#F6B8CA ", "#F6B8CA\n",
     "#F6B8CA\u200b", "#１２３４５６", "rgb(1,2,3)", "#", ""],
)
def test_message_color_rejects_anything_but_a_full_hex_code(api, color):
    layout = {**MESSAGE_LAYOUT, "color_mode": "custom", "color": color}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json")
    assert response.status_code == 400
    assert response.json() in ({"message_layout": [HEX_MESSAGE]}, {"message_layout": {"color": ["Este campo no puede estar en blanco."]}})


def test_the_old_list_mode_no_longer_exists(api):
    layout = {**MESSAGE_LAYOUT, "color_mode": "list", "color": "rosa"}
    response = api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json")
    assert response.status_code == 400
    assert response.json() == {"message_layout": {"color_mode": ["Elige automático, colores que combinan o elegir un color."]}}


def test_a_custom_message_color_is_saved_in_lowercase():
    serializer = MessageLayoutSerializer(data={**MESSAGE_LAYOUT, "color_mode": "custom", "color": "#F6B8CA"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["color"] == "#f6b8ca"


def test_message_color_accepts_the_other_modes(api):
    for mode, color in (("auto", None), ("tones", "deep"), ("tones", "light")):
        layout = {**MESSAGE_LAYOUT, "color_mode": mode, "color": color, "arrangement": "straight", "curve": 0}
        assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json").status_code == 200


def test_a_message_over_four_words_is_only_a_suggestion(api):
    layout = {**MESSAGE_LAYOUT, "text": "Feliz cumpleaños muy querida amiga Ana"}
    assert api.post(PRICE_URL, {**RULE_4_6_EXAMPLE, "message_layout": layout}, format="json").status_code == 200
