"""Opciones de "Diseña tu pastel" con disponibilidad y motivo, con repositorios en memoria."""
import dataclasses
from decimal import Decimal

import pytest

from core_pasteleria.repositories import cake_option_repo, settings_repo
from core_pasteleria.services.cake_options_service import get_cake_design_options
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.pricing_service import CakeDesignChoice, CakeDesignError, calculate_price
from core_pasteleria.services.warranty_service import get_stand_deposit
from tests import memory_cake_design as data


def options(**repo_overrides):
    return get_cake_design_options(
        cake_options=data.cake_option_repo(**repo_overrides), settings=data.settings_repo()
    )


def by_slug(items):
    return {item.slug: item for item in items}


def test_cake_types_are_the_three_of_rule_4_2():
    assert [(t.value, t.label) for t in options().cake_types] == [
        ("tres_leches", "Tres leches"), ("seco", "Seco"), ("envinado", "Envinado"),
    ]


def test_breads_keep_their_order_and_never_disappear():
    prices = {k: v for k, v in data.FILLING_PRICES.items() if k[0] != "envinado"}
    assert [b.slug for b in options().breads] == [b.slug for b in data.BREADS]
    assert [b.slug for b in options(filling_prices=prices).breads] == [b.slug for b in data.BREADS]
    # Solo las decoraciones tienen una disponibilidad que no depende del tipo de pastel.
    assert not hasattr(options().breads[0], "available")
    assert not hasattr(options().filling_bases[0], "available")
    assert not hasattr(options().filling_bases[0].flavors[0], "available")


def test_an_extra_bread_is_not_offered_in_a_type_without_filling_prices():
    prices = {k: v for k, v in data.FILLING_PRICES.items() if k[0] != "envinado"}
    breads = by_slug(options(filling_prices=prices).breads)
    assert breads["vainilla"].unavailable_reasons == {"envinado": "No disponible en pastel envinado"}
    assert "envinado" not in breads["vainilla"].price_per_kg_from
    # Choco-pingüino ya traía su motivo por el tipo; ese es el que gana.
    assert breads["choco_pinguino"].unavailable_reasons == {"envinado": "No se combina con pastel envinado"}


def test_a_base_without_flavors_offered_in_a_type_is_not_offered_in_it():
    solo_yogurt = data.base("solo_yogurt", "Solo yogurt", 1, "0.00", ["fresa_yogurt"])
    prices = {**data.FILLING_PRICES, **{(t, "solo_yogurt", None): Decimal("200") for t in data.ALL_TYPES}}
    base = by_slug(options(filling_bases=[*data.FILLING_BASES, solo_yogurt], filling_prices=prices)
                   .filling_bases)["solo_yogurt"]
    assert base.allowed_cake_types == ("tres_leches", "seco")
    assert base.unavailable_reasons == {"envinado": "No disponible en pastel envinado"}


def test_bread_reasons_by_cake_type_follow_rule_4_7():
    breads = by_slug(options().breads)
    assert breads["choco_pinguino"].allowed_cake_types == ("tres_leches", "seco")
    assert breads["choco_pinguino"].unavailable_reasons == {"envinado": "No se combina con pastel envinado"}
    assert breads["red_velvet"].unavailable_reasons == {
        "tres_leches": "Solo en pastel seco", "envinado": "Solo en pastel seco",
    }
    assert breads["vainilla"].unavailable_reasons == {}


def test_breads_carry_the_price_per_kg_the_interface_shows():
    breads = by_slug(options().breads)
    # "Desde": relleno más barato del tipo + incremento del pan (regla 4.6).
    assert breads["chocolate"].price_per_kg_from == {
        "tres_leches": Decimal("185.00"), "seco": Decimal("185.00"), "envinado": Decimal("205.00"),
    }
    assert breads["vainilla"].price_per_kg_from["envinado"] == Decimal("200.00")
    # Precio completo, con relleno incluido, solo en los tipos en que se ofrece.
    assert breads["choco_pinguino"].price_per_kg_from == {
        "tres_leches": Decimal("250.00"), "seco": Decimal("250.00"),
    }
    assert breads["red_velvet"].price_per_kg_from == {"seco": Decimal("280.00")}
    assert breads["red_velvet"].included_filling == "Relleno típico de red velvet"


def test_filling_bases_carry_their_general_price_by_type_and_their_flavors():
    bases = by_slug(options().filling_bases)
    normal = bases["normal"]
    assert normal.price_per_kg_by_cake_type == {
        "tres_leches": Decimal("180"), "seco": Decimal("180"), "envinado": Decimal("200"),
    }
    assert (normal.max_flavors, normal.combined_extra_per_kg) == (2, Decimal("5.00"))
    assert normal.allowed_cake_types == ("tres_leches", "seco", "envinado")
    flavors = by_slug(normal.flavors)
    assert flavors["nuez"].price_per_kg_by_cake_type == {
        "tres_leches": Decimal("190"), "seco": Decimal("190"), "envinado": Decimal("200"),
    }
    assert flavors["durazno"].price_per_kg_by_cake_type == {}
    yogurt = flavors["fresa_yogurt"]
    assert yogurt.is_combinable is False
    assert yogurt.unavailable_reasons == {"envinado": "No disponible en pastel envinado"}
    assert [f.slug for f in bases["queso"].flavors] == ["chocolate", "zarzamora"]


def test_a_base_without_a_general_price_is_disabled_for_that_type():
    prices = {k: v for k, v in data.FILLING_PRICES.items() if k != ("envinado", "flan", None)}
    flan = by_slug(options(filling_prices=prices).filling_bases)["flan"]
    assert flan.allowed_cake_types == ("tres_leches", "seco")
    assert flan.unavailable_reasons == {"envinado": "No disponible en pastel envinado"}


def test_decorations_say_why_they_cannot_be_chosen():
    decorations = by_slug(options().decorations)
    assert [d.slug for d in options().decorations] == ["ninguna", "duya", "flores", "chispas", "otra"]
    for slug in ("duya", "flores", "chispas"):
        assert (decorations[slug].available, decorations[slug].unavailable_reason) == (False, "Precio por confirmar")
        assert (decorations[slug].price, decorations[slug].price_pending) == (None, True)
    assert (decorations["ninguna"].available, decorations["ninguna"].price_pending) == (True, False)
    otra = decorations["otra"]
    assert (otra.available, otra.requires_quote, otra.price, otra.price_pending) == (True, True, None, False)


def test_a_fixed_decoration_with_a_price_is_available():
    flores = by_slug(options(decorations=data.with_decoration_price("flores", "150")).decorations)["flores"]
    assert (flores.available, flores.unavailable_reason, flores.price) == (True, None, Decimal("150"))


def test_limits_colors_and_tiers_come_from_the_repositories():
    result = options()
    assert result.limits == data.CAKE_DESIGN_SETTINGS
    assert list(result.coverage_colors) == data.COVERAGE_COLORS
    assert list(result.tier_recommendations) == data.TIERS


def test_options_are_immutable():
    result = options()
    bread, base = by_slug(result.breads)["red_velvet"], by_slug(result.filling_bases)["normal"]
    with pytest.raises(dataclasses.FrozenInstanceError):
        bread.name = "Otro"
    assert isinstance(result.breads, tuple) and isinstance(base.flavors, tuple)
    for mapping in (bread.unavailable_reasons, bread.price_per_kg_from, base.price_per_kg_by_cake_type,
                    by_slug(base.flavors)["nuez"].price_per_kg_by_cake_type):
        with pytest.raises(TypeError):
            mapping["seco"] = Decimal("1")


# --- Lo que options desactiva es lo que price rechaza ---


def _datasets():
    """Datos de las reglas y variantes que vuelven no disponibles un pan o una base en un tipo."""
    solo_yogurt = data.base("solo_yogurt", "Solo yogurt", 1, "0.00", ["fresa_yogurt"])
    yogurt_prices = {(t, "solo_yogurt", None): Decimal("200") for t in data.ALL_TYPES}
    return {
        "reglas": {},
        "sin_flan_en_envinado": {
            "filling_prices": {k: v for k, v in data.FILLING_PRICES.items() if k != ("envinado", "flan", None)}
        },
        "sin_precios_en_envinado": {
            "filling_prices": {k: v for k, v in data.FILLING_PRICES.items() if k[0] != "envinado"}
        },
        "base_solo_yogurt": {
            "filling_bases": [*data.FILLING_BASES, solo_yogurt],
            "filling_prices": {**data.FILLING_PRICES, **yogurt_prices},
        },
    }


def _rejects(cake_options, **choice):
    try:
        calculate_price(CakeDesignChoice(kg=10, **choice), cake_options=cake_options, settings=data.settings_repo())
    except CakeDesignError:
        return True
    return False


def _any_filling(result, cake_type):
    """Primera base y sabor que options ofrece en ese tipo, para probar un pan."""
    for base in result.filling_bases:
        flavors = [f for f in base.flavors if cake_type not in f.unavailable_reasons]
        if cake_type not in base.unavailable_reasons and flavors:
            return {"filling_base": base.slug, "filling_flavors": (flavors[0].slug,)}
    return {"filling_base": None, "filling_flavors": ()}


def assert_options_match_price(cake_options, settings):
    result = get_cake_design_options(cake_options=cake_options, settings=settings)
    for cake_type in data.ALL_TYPES:
        for bread in result.breads:
            filling = _any_filling(result, cake_type) if not bread.included_filling else {}
            rejected = _rejects(cake_options, cake_type=cake_type, bread=bread.slug, **filling)
            assert rejected == (cake_type in bread.unavailable_reasons), (bread.slug, cake_type)
        for base in result.filling_bases:
            for flavor in base.flavors:
                rejected = _rejects(cake_options, cake_type=cake_type, bread="vainilla",
                                    filling_base=base.slug, filling_flavors=(flavor.slug,))
                disabled = cake_type in base.unavailable_reasons or cake_type in flavor.unavailable_reasons
                assert rejected == disabled, (base.slug, flavor.slug, cake_type)


@pytest.mark.parametrize("overrides", list(_datasets().values()), ids=list(_datasets()))
def test_what_options_disables_is_what_price_rejects(overrides):
    assert_options_match_price(data.cake_option_repo(**overrides), data.settings_repo())


@pytest.mark.django_db
def test_options_match_price_with_the_seeded_database():
    assert_options_match_price(cake_option_repo, settings_repo)


# --- Kilos máximos efectivos ---


def stands_up_to(max_kg):
    """Bases de la regla 7 con las que pasan de `max_kg` desactivadas."""
    return [dataclasses.replace(s, is_active=s.max_kg <= max_kg) for s in data.STANDS]


def limits_with(stands=None, **cake_design):
    settings = data.settings_repo(
        cake_design=dataclasses.replace(data.CAKE_DESIGN_SETTINGS, **cake_design), stands=stands
    )
    return get_cake_design_options(cake_options=data.cake_option_repo(), settings=settings).limits


def test_the_maximum_shown_is_the_lower_of_the_online_limit_and_the_largest_active_stand():
    assert limits_with().max_online_kg == 50
    assert limits_with(stands=stands_up_to(40)).max_online_kg == 40
    assert limits_with(max_online_kg=30).max_online_kg == 30


def test_without_active_stands_no_kilos_can_be_ordered_online():
    """Con `max_online_kg` en 0 el rango queda vacío: la interfaz manda a WhatsApp."""
    limits = limits_with(stands=stands_up_to(0))
    assert limits.max_online_kg == 0
    assert limits.min_custom_kg == 4


def _price_accepts_kg(kg, settings):
    """Lo mismo que hace la vista: precio y depósito de la base."""
    try:
        calculate_price(
            CakeDesignChoice(kg=kg, cake_type="seco", bread="red_velvet"),
            cake_options=data.cake_option_repo(), settings=settings,
        )
        get_stand_deposit(kg, settings=settings)
    except DomainValidationError:
        return False
    return True


@pytest.mark.parametrize(
    ("stands", "max_online_kg"),
    [(None, 50), (stands_up_to(40), 50), (None, 30), (stands_up_to(0), 50), (stands_up_to(12), 50)],
    ids=["reglas", "bases-hasta-40", "maximo-30", "sin-bases-activas", "bases-hasta-12"],
)
def test_the_kilos_options_allow_are_the_kilos_price_accepts(stands, max_online_kg):
    settings = data.settings_repo(
        cake_design=dataclasses.replace(data.CAKE_DESIGN_SETTINGS, max_online_kg=max_online_kg), stands=stands
    )
    limits = get_cake_design_options(cake_options=data.cake_option_repo(), settings=settings).limits
    for kg in range(0, 53):
        allowed = limits.min_custom_kg <= kg <= limits.max_online_kg
        assert _price_accepts_kg(kg, settings) == allowed, kg
