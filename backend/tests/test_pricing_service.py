"""Precio de "Diseña tu pastel" (Strategy) con repositorios en memoria, sin PostgreSQL.

Sin la marca `django_db`: si el servicio tocara la base, pytest-django fallaría.
"""
import ast
import dataclasses
import inspect
from decimal import Decimal

import pytest

from core_pasteleria.models import BreadPricingMode, DecorationPricing
from core_pasteleria.services import cake_options_service, catalog_service, pricing_service
from core_pasteleria.services.pricing_service import (
    CakeDesignChoice,
    CakeDesignError,
    PendingPriceError,
    calculate_price,
)
from tests import memory_cake_design as data


def price(cake_options=None, settings=None, **choice):
    """Calcula con los datos de las reglas; `choice` sobrescribe un pedido válido."""
    values = {"kg": 10, "cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal",
              "filling_flavors": ("durazno",)}
    values.update(choice)
    return calculate_price(
        CakeDesignChoice(**values),
        cake_options=cake_options or data.cake_option_repo(),
        settings=settings or data.settings_repo(),
    )


def errors_of(**choice):
    with pytest.raises(CakeDesignError) as raised:
        price(**choice)
    return raised.value.errors


# --- Fórmula 4.6 ---


def test_rule_4_6_example_costs_3825():
    breakdown = price(kg=15, cake_type="tres_leches", bread="chocolate", filling_base="queso",
                      filling_flavors=("zarzamora",))
    assert breakdown == pricing_service.PriceBreakdown(
        price_per_kg=Decimal("255.00"),
        kg=15,
        cake_subtotal=Decimal("3825.00"),
        wafer=Decimal("0.00"),
        decoration=Decimal("0.00"),
        total=Decimal("3825.00"),
        requires_quote=False,
    )


@pytest.mark.parametrize(
    ("cake_type", "bread", "base", "flavors", "per_kg"),
    [
        ("tres_leches", "vainilla", "normal", ("durazno",), "180"),
        ("seco", "vainilla", "normal", ("fresa",), "180"),
        ("envinado", "vainilla", "normal", ("fresa",), "200"),
        ("tres_leches", "choco_vainilla", "normal", ("cajeta",), "185"),
        ("tres_leches", "vainilla", "normal", ("fresa_yogurt",), "190"),
        ("seco", "vainilla", "normal", ("nuez",), "190"),
        ("envinado", "vainilla", "normal", ("nuez",), "200"),
        ("envinado", "vainilla", "flan", ("cajeta",), "250"),
        # Combinado: +$5; con Nuez, el precio de Nuez + $5.
        ("tres_leches", "vainilla", "normal", ("durazno", "fresa"), "185"),
        ("tres_leches", "vainilla", "normal", ("nuez", "fresa"), "195"),
        ("tres_leches", "chocolate", "normal", ("fresa", "nuez"), "200"),
        ("envinado", "vainilla", "normal", ("nuez", "durazno"), "205"),
    ],
)
def test_price_per_kg_follows_table_4_5_and_the_bread_increment(cake_type, bread, base, flavors, per_kg):
    breakdown = price(cake_type=cake_type, bread=bread, filling_base=base, filling_flavors=flavors)
    assert breakdown.price_per_kg == Decimal(per_kg)
    assert breakdown.cake_subtotal == Decimal(per_kg) * 10


@pytest.mark.parametrize(
    ("cake_type", "bread", "per_kg"),
    [
        ("tres_leches", "choco_pinguino", "250"),
        ("seco", "choco_pinguino", "250"),
        ("seco", "red_velvet", "280"),
    ],
)
def test_full_price_breads_include_their_filling(cake_type, bread, per_kg):
    breakdown = price(cake_type=cake_type, bread=bread, filling_base=None, filling_flavors=())
    assert breakdown.price_per_kg == Decimal(per_kg)
    assert breakdown.total == Decimal(per_kg) * 10


def test_amounts_are_decimals_with_two_places():
    breakdown = price(wafer=True)
    for name in ("price_per_kg", "cake_subtotal", "wafer", "decoration", "total"):
        value = getattr(breakdown, name)
        assert isinstance(value, Decimal), name
        assert value.as_tuple().exponent == -2, name


def test_breakdown_is_immutable():
    with pytest.raises(dataclasses.FrozenInstanceError):
        price().total = Decimal("0")


def test_figures_come_from_the_repositories_not_from_constants():
    prices = {**data.FILLING_PRICES, ("tres_leches", "normal", None): Decimal("300")}
    breads = [dataclasses.replace(b, price_per_kg=Decimal("7")) if b.slug == "chocolate" else b
              for b in data.BREADS]
    settings = data.settings_repo(cake_design=dataclasses.replace(data.CAKE_DESIGN_SETTINGS,
                                                                  wafer_price=Decimal("99.50")))
    breakdown = price(cake_options=data.cake_option_repo(breads=breads, filling_prices=prices),
                      settings=settings, bread="chocolate", wafer=True)
    assert breakdown.price_per_kg == Decimal("307")
    assert breakdown.wafer == Decimal("99.50")


# --- Kilos ---


@pytest.mark.parametrize("kg", [4, 50])
def test_kilos_at_the_limits_are_accepted(kg):
    assert price(kg=kg).kg == kg


@pytest.mark.parametrize(
    ("kg", "message"),
    [
        (3, "El pedido es de mínimo 4 kg."),
        (0, "El pedido es de mínimo 4 kg."),
        (51, "En línea el máximo es 50 kg. Para más, escríbenos por WhatsApp."),
    ],
)
def test_kilos_outside_the_range_are_rejected(kg, message):
    assert errors_of(kg=kg) == {"kg": [message]}


@pytest.mark.parametrize("kg", [Decimal("4.5"), 4.0, "10", True])
def test_kilos_must_be_whole_numbers(kg):
    assert errors_of(kg=kg) == {"kg": ["Los kilos van en números enteros."]}


def test_kilo_limits_come_from_the_settings():
    # Subir el máximo pide también una base activa que cubra esos kilos: el máximo es el efectivo.
    settings = data.settings_repo(
        cake_design=dataclasses.replace(data.CAKE_DESIGN_SETTINGS, max_online_kg=60),
        stands=[*data.STANDS, data.stand(51, 60, "600", "approved")],
    )
    assert price(settings=settings, kg=60).kg == 60


# --- Tabla 4.7 ---


def test_choco_pinguino_is_rejected_in_envinado():
    assert errors_of(cake_type="envinado", bread="choco_pinguino", filling_base=None, filling_flavors=()) == {
        "bread": ["Choco-pingüino: no se combina con pastel envinado."]
    }


@pytest.mark.parametrize("cake_type", ["tres_leches", "envinado"])
def test_red_velvet_is_only_for_seco(cake_type):
    assert errors_of(cake_type=cake_type, bread="red_velvet", filling_base=None, filling_flavors=()) == {
        "bread": ["Red velvet: solo en pastel seco."]
    }


def test_fresa_con_yogurt_is_rejected_in_envinado():
    assert errors_of(cake_type="envinado", filling_flavors=("fresa_yogurt",)) == {
        "filling_flavors": ["Fresa con yogurt: no disponible en pastel envinado."]
    }


@pytest.mark.parametrize("bread", ["choco_pinguino", "red_velvet"])
def test_full_price_breads_do_not_take_a_filling(bread):
    assert errors_of(cake_type="seco", bread=bread, filling_base="normal", filling_flavors=("fresa",)) == {
        "filling_base": ["Este pan ya trae su relleno; no se elige otro."]
    }


@pytest.mark.parametrize(
    ("base", "name", "flavors"),
    [("queso", "Con queso", ("chocolate", "zarzamora")), ("flan", "Con flan", ("cajeta", "zarzamora"))],
)
def test_only_the_normal_base_takes_two_flavors(base, name, flavors):
    # Dos sabores que sí se ofrecen en esa base: lo único que falla es combinarlos.
    assert errors_of(filling_base=base, filling_flavors=flavors) == {
        "filling_flavors": [f"La base {name} lleva un solo sabor."]
    }


def test_fresa_con_yogurt_does_not_take_a_second_flavor():
    assert errors_of(filling_flavors=("fresa_yogurt", "fresa")) == {
        "filling_flavors": ["Fresa con yogurt: no se combina con otro sabor."]
    }


def test_normal_base_takes_at_most_its_max_flavors():
    assert errors_of(filling_flavors=("fresa", "durazno", "nuez")) == {
        "filling_flavors": ["La base Normal lleva máximo 2 sabores."]
    }


# --- Otras validaciones del relleno y del pan ---


@pytest.mark.parametrize(
    ("choice", "expected"),
    [
        ({"cake_type": "helado"}, {"cake_type": ["Ese tipo de pastel no existe."]}),
        ({"bread": "brioche"}, {"bread": ["Ese pan no existe o no está disponible."]}),
        ({"filling_base": None, "filling_flavors": ()}, {"filling_base": ["Elige la base del relleno."]}),
        ({"filling_base": "crema"}, {"filling_base": ["Esa base de relleno no existe o no está disponible."]}),
        ({"filling_flavors": ()}, {"filling_flavors": ["Elige el sabor del relleno."]}),
        ({"filling_flavors": ("mango",)}, {"filling_flavors": ["El sabor «mango» no existe o no está disponible."]}),
        ({"filling_base": "queso", "filling_flavors": ("durazno",)},
         {"filling_flavors": ["Durazno no se ofrece en la base Con queso."]}),
        ({"filling_flavors": ("fresa", "fresa")}, {"filling_flavors": ["No repitas el sabor."]}),
    ],
)
def test_filling_and_bread_choices_must_exist_and_fit(choice, expected):
    assert errors_of(**choice) == expected


def test_a_base_without_a_general_price_for_the_type_is_not_offered():
    prices = {k: v for k, v in data.FILLING_PRICES.items() if k != ("envinado", "flan", None)}
    with pytest.raises(CakeDesignError) as raised:
        price(cake_options=data.cake_option_repo(filling_prices=prices), cake_type="envinado",
              filling_base="flan", filling_flavors=("cajeta",))
    assert raised.value.errors == {"filling_base": ["Con flan: no disponible en pastel envinado."]}


def test_inactive_options_are_rejected_because_the_repository_does_not_list_them():
    breads = [b for b in data.BREADS if b.slug != "chocolate"]
    with pytest.raises(CakeDesignError) as raised:
        price(cake_options=data.cake_option_repo(breads=breads), bread="chocolate")
    assert raised.value.errors == {"bread": ["Ese pan no existe o no está disponible."]}


def test_independent_errors_are_reported_together():
    assert errors_of(kg=2, bread="red_velvet", filling_base=None, filling_flavors=(), decoration="duya") == {
        "kg": ["El pedido es de mínimo 4 kg."],
        "bread": ["Red velvet: solo en pastel seco."],
        "decoration": ["Precio por confirmar"],
    }


# --- Decoración y oblea ---


def test_without_decoration_nothing_is_added():
    for decoration in (None, "ninguna"):
        breakdown = price(decoration=decoration)
        assert (breakdown.decoration, breakdown.requires_quote) == (Decimal("0.00"), False)
        assert breakdown.total == breakdown.cake_subtotal


@pytest.mark.parametrize("slug", ["duya", "flores", "chispas"])
def test_a_fixed_decoration_with_a_pending_price_cannot_be_chosen(slug):
    with pytest.raises(PendingPriceError) as raised:
        price(decoration=slug)
    assert raised.value.errors == {"decoration": ["Precio por confirmar"]}


def test_a_fixed_decoration_with_a_price_is_added():
    options = data.cake_option_repo(decorations=data.with_decoration_price("flores", "150"))
    breakdown = price(cake_options=options, decoration="flores")
    assert breakdown.decoration == Decimal("150.00")
    assert breakdown.total == Decimal("1950.00")


def test_otra_decoracion_requires_a_quote_and_adds_nothing():
    breakdown = price(decoration="otra")
    assert breakdown.requires_quote is True
    assert breakdown.decoration == Decimal("0.00")
    assert breakdown.total == Decimal("1800.00")


def test_unknown_decoration_is_rejected():
    assert errors_of(decoration="glitter") == {"decoration": ["Esa decoración no existe o no está disponible."]}


def test_wafer_adds_its_price():
    breakdown = price(wafer=True)
    assert breakdown.wafer == Decimal("125.00")
    assert breakdown.total == Decimal("1925.00")


def test_everything_adds_up():
    options = data.cake_option_repo(decorations=data.with_decoration_price("chispas", "80"))
    breakdown = price(cake_options=options, kg=20, cake_type="seco", bread="red_velvet", filling_base=None,
                      filling_flavors=(), decoration="chispas", wafer=True)
    assert (breakdown.cake_subtotal, breakdown.decoration, breakdown.wafer, breakdown.total) == (
        Decimal("5600.00"), Decimal("80.00"), Decimal("125.00"), Decimal("5805.00")
    )


# --- Patrones ---


def test_strategy_registries_cover_every_pricing_mode():
    assert set(pricing_service.BREAD_PRICING_STRATEGIES) == set(BreadPricingMode.values)
    assert set(pricing_service.DECORATION_PRICING_STRATEGIES) == set(DecorationPricing.values)


@pytest.mark.parametrize("module", [pricing_service, cake_options_service, catalog_service])
def test_services_have_no_elif_chains(module):
    tree = ast.parse(inspect.getsource(module))
    for node in ast.walk(tree):
        if isinstance(node, ast.If):
            assert not (len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If)), ast.unparse(node.test)


def test_decoration_strategies_say_when_the_price_is_pending():
    strategies = pricing_service.DECORATION_PRICING_STRATEGIES
    pending, priced = data.DECORATIONS[1], data.with_decoration_price("duya", "90")[1]
    assert strategies["fixed"].is_price_pending(pending) is True
    assert strategies["fixed"].is_price_pending(priced) is False
    # "Sin decoración" y "Otra decoración" llevan el precio vacío a propósito.
    assert strategies["included"].is_price_pending(data.DECORATIONS[0]) is False
    assert strategies["quote"].is_price_pending(data.DECORATIONS[4]) is False


# --- Disponibilidad que depende de los datos ---


def test_a_base_without_flavors_offered_in_the_type_is_rejected():
    solo_yogurt = data.base("solo_yogurt", "Solo yogurt", 1, "0.00", ["fresa_yogurt"])
    prices = {**data.FILLING_PRICES, ("envinado", "solo_yogurt", None): Decimal("200")}
    options = data.cake_option_repo(filling_bases=[*data.FILLING_BASES, solo_yogurt], filling_prices=prices)
    with pytest.raises(CakeDesignError) as raised:
        price(cake_options=options, cake_type="envinado", filling_base="solo_yogurt",
              filling_flavors=("fresa_yogurt",))
    assert raised.value.errors == {"filling_base": ["Solo yogurt: no disponible en pastel envinado."]}


def test_an_extra_bread_in_a_type_without_any_filling_price_is_rejected():
    prices = {k: v for k, v in data.FILLING_PRICES.items() if k[0] != "envinado"}
    with pytest.raises(CakeDesignError) as raised:
        price(cake_options=data.cake_option_repo(filling_prices=prices), cake_type="envinado")
    assert raised.value.errors == {"bread": ["Vainilla: no disponible en pastel envinado."]}


# --- Total estimado mientras se arma el pastel ---


def estimate(**choice):
    values = {"kg": 10, "cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal", "filling_flavors": ()}
    values.update(choice)
    return pricing_service.estimate_price(
        CakeDesignChoice(**values), cake_options=data.cake_option_repo(), settings=data.settings_repo()
    )


def estimate_errors(**choice):
    with pytest.raises(CakeDesignError) as raised:
        estimate(**choice)
    return raised.value.errors


def test_an_estimate_without_flavors_takes_the_general_price_of_the_base():
    assert estimate(kg=6).total == Decimal("1080.00")
    assert estimate(kg=6, cake_type="envinado").price_per_kg == Decimal("200.00")
    assert estimate(kg=6, bread="chocolate", filling_base="queso").total == Decimal("1530.00")


def test_an_estimate_with_flavors_prices_them_as_usual():
    estimated = estimate(filling_flavors=("nuez", "fresa"))
    assert dataclasses.replace(estimated, is_estimate=False) == price(filling_flavors=("nuez", "fresa"))
    assert estimated.is_estimate is True


def test_an_estimate_still_needs_the_base_and_follows_the_rules():
    assert estimate_errors(filling_base=None) == {"filling_base": ["Elige la base del relleno."]}
    assert estimate_errors(kg=3) == {"kg": ["El pedido es de mínimo 4 kg."]}
    assert estimate_errors(cake_type="envinado", bread="choco_pinguino", filling_base=None) == {
        "bread": ["Choco-pingüino: no se combina con pastel envinado."]
    }


def test_a_regular_choice_without_flavors_is_invalid():
    """Lo que un pedido lleva (`CakeDesignChoice` con `calculate_price`) siempre pide el sabor."""
    assert errors_of(filling_flavors=()) == {"filling_flavors": ["Elige el sabor del relleno."]}
    assert "estimate" not in {field.name for field in dataclasses.fields(CakeDesignChoice)}


# --- Kilos por personas (regla 3.1) ---


@pytest.mark.parametrize(
    ("people", "kg"),
    [(40, 6), (47, 7), (35, 5), (70, 10), (105, 15), (130, 19), (3, 4), (28, 4), (1, 4), (31, 4), (32, 5)],
)
def test_kg_for_people_rounds_half_up_and_never_goes_below_the_minimum(people, kg):
    # 47 / 7 = 6.71 sube; 31 / 7 = 4.43 baja; 32 / 7 = 4.57 sube; 3 personas dan el mínimo.
    assert pricing_service.kg_for_people(people, settings=data.settings_repo(), cake_options=data.cake_option_repo()) == kg


def test_half_exactly_rounds_up():
    settings = data.settings_repo(cake_design=dataclasses.replace(data.CAKE_DESIGN_SETTINGS, people_per_kg=2))
    options = data.cake_option_repo()
    assert pricing_service.kg_for_people(9, settings=settings, cake_options=options) == 5  # 4.5 kg sube a 5
    assert pricing_service.size_for_people(9, settings=settings, cake_options=options).rounded_kg == 5


def size(people, settings=None):
    return pricing_service.size_for_people(people, settings=settings or data.settings_repo(), cake_options=data.cake_option_repo())


def test_size_for_people_says_where_it_stands_against_the_limits():
    assert size(15) == pricing_service.PeopleSize(
        people=15, rounded_kg=2, kg=4, below_minimum=True, above_maximum=False, minimum_people=28,
        max_online_people=350, max_tiers=1,
    )
    assert size(400).above_maximum is True
    assert size(350).above_maximum is False


def capped_at_25_kg():
    """La configuración permite 50 kg, pero la base activa más grande cubre 25."""
    return data.settings_repo(stands=[stand for stand in data.STANDS if stand.max_kg <= 25])


def test_the_effective_maximum_is_the_default_for_people_and_for_kilos():
    settings = capped_at_25_kg()
    capped = size(200, settings)
    assert (capped.kg, capped.above_maximum, capped.max_online_people) == (29, True, 175)
    assert size(175, settings).above_maximum is False
    assert errors_of(kg=30, settings=settings)["kg"] == ["En línea el máximo es 25 kg. Para más, escríbenos por WhatsApp."]


def test_estimates_are_marked_and_regular_prices_are_not():
    assert estimate(kg=6).is_estimate is True
    assert price(kg=6).is_estimate is False


def test_size_for_people_rejects_non_positive_counts():
    with pytest.raises(CakeDesignError) as raised:
        size(0)
    assert raised.value.errors == {"people": ["Indica al menos una persona."]}


# --- Pisos: kilos mínimos que bloquean (regla 3.3, D50) ---


@pytest.mark.parametrize(
    ("kg", "allowed"),
    [(4, [1]), (14, [1]), (15, [1, 2]), (17, [1, 2]), (18, [1, 2, 3]), (25, [1, 2, 3, 4]), (30, [1, 2, 3, 4, 5]), (50, [1, 2, 3, 4, 5])],
)
def test_allowed_tiers_follow_the_minimums(kg, allowed):
    assert pricing_service.allowed_tiers(kg, cake_options=data.cake_option_repo()) == allowed


@pytest.mark.parametrize(("people", "max_tiers"), [(28, 1), (105, 2), (126, 3), (175, 4), (210, 5)])
def test_the_size_carries_the_most_tiers_the_kilos_allow(people, max_tiers):
    assert size(people).max_tiers == max_tiers


def test_tiers_below_their_minimum_are_rejected():
    assert errors_of(kg=4, tiers=2) == {"tiers": ["Para 2 pisos el pedido es desde 15 kg."]}
    assert errors_of(kg=17, tiers=3) == {"tiers": ["Para 3 pisos el pedido es desde 18 kg."]}
    assert price(kg=15, tiers=2).kg == 15
    assert price(kg=30, tiers=5).kg == 30


def test_unknown_tiers_and_forms_are_rejected():
    assert errors_of(tiers=6) == {"tiers": ["El pastel lleva de 1 a 5 pisos."]}
    assert errors_of(tiers=0) == {"tiers": ["El pastel lleva de 1 a 5 pisos."]}
    assert errors_of(form="hexagonal") == {"form": ["Elige una forma: redondo o rectangular."]}
    assert price(form="rectangular").kg == 10


def test_without_stands_there_are_no_online_orders():
    settings = data.settings_repo(stands=[])
    assert errors_of(settings=settings)["kg"] == ["Por ahora no tomamos pedidos en línea. Escríbenos por WhatsApp."]
