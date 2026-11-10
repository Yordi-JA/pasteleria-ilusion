"""Opciones y precios de "Diseña tu pastel": restricciones, admin y semilla."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import UniqueConstraint
from django.urls import reverse

from core_pasteleria.models import (
    Bread,
    CakeType,
    CoverageColor,
    DecorationOption,
    FillingBase,
    FillingFlavor,
    FillingPrice,
    TierRecommendation,
)

seed_module = importlib.import_module("core_pasteleria.migrations.0005_seed_cake_options")

pytestmark = pytest.mark.django_db


def build_bread(**overrides):
    values = {
        "name": "Pan de prueba",
        "slug": "pan_de_prueba",
        "pricing_mode": "extra_per_kg",
        "price_per_kg": Decimal("5.00"),
    }
    return Bread(**{**values, **overrides})


def make_bread(**overrides):
    bread = build_bread(**overrides)
    bread.save()
    return bread


def rejected(operation):
    """Ejecuta `operation` y exige que la base la rechace."""
    with pytest.raises(IntegrityError), transaction.atomic():
        operation()


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


# --- Restricciones de la base ---


def test_full_price_bread_without_included_filling_is_rejected():
    rejected(lambda: make_bread(pricing_mode="full_price_per_kg", price_per_kg=Decimal("250"), included_filling=""))


def test_full_price_bread_needs_a_positive_price():
    rejected(
        lambda: make_bread(
            pricing_mode="full_price_per_kg", price_per_kg=Decimal("0"), included_filling="Crema"
        )
    )


def test_full_price_bread_with_filling_and_price_is_accepted():
    bread = make_bread(
        pricing_mode="full_price_per_kg", price_per_kg=Decimal("250"), included_filling="Crema"
    )
    bread.full_clean()


def test_extra_price_bread_with_included_filling_is_rejected():
    rejected(lambda: make_bread(included_filling="Crema"))


def test_bread_price_cannot_be_negative():
    rejected(lambda: make_bread(price_per_kg=Decimal("-1")))


def test_empty_cake_types_are_rejected_by_the_database():
    # Un arreglo vacío debe dar longitud 0 (no NULL): si diera NULL el CHECK lo dejaría pasar.
    rejected(lambda: make_bread(allowed_cake_types=[]))


def test_unknown_cake_type_is_rejected_by_the_database():
    rejected(lambda: make_bread(allowed_cake_types=["tres_leches", "helado"]))


def test_empty_cake_types_are_rejected_for_flavors_too():
    rejected(lambda: FillingFlavor.objects.create(name="Vacío", slug="vacio", allowed_cake_types=[]))


def test_cake_types_are_all_three_by_default():
    assert make_bread().allowed_cake_types == ["tres_leches", "seco", "envinado"]


@pytest.mark.parametrize("max_flavors", [0, 3])
def test_filling_base_max_flavors_outside_one_or_two_is_rejected(max_flavors):
    rejected(
        lambda: FillingBase.objects.create(
            name="Prueba", slug="prueba", max_flavors=max_flavors, combined_extra_per_kg=0
        )
    )


def test_combined_extra_with_a_single_flavor_is_rejected():
    rejected(
        lambda: FillingBase.objects.create(
            name="Prueba", slug="prueba", max_flavors=1, combined_extra_per_kg=Decimal("5")
        )
    )


def test_combined_extra_with_two_flavors_is_accepted():
    FillingBase.objects.create(
        name="Prueba", slug="prueba", max_flavors=2, combined_extra_per_kg=Decimal("5")
    ).full_clean()


def test_two_general_prices_for_the_same_base_and_type_are_rejected():
    base = FillingBase.objects.get(slug="normal")
    rejected(
        lambda: FillingPrice.objects.create(
            cake_type="seco", base=base, flavor=None, price_per_kg=Decimal("999")
        )
    )


def test_two_prices_for_the_same_flavor_base_and_type_are_rejected():
    base, flavor = FillingBase.objects.get(slug="normal"), FillingFlavor.objects.get(slug="nuez")
    rejected(
        lambda: FillingPrice.objects.create(
            cake_type="seco", base=base, flavor=flavor, price_per_kg=Decimal("999")
        )
    )


def test_filling_price_uniqueness_does_not_need_postgresql_15():
    # `nulls_distinct=False` solo existe desde PostgreSQL 15 y se ignora en servidores
    # anteriores: la unicidad se expresa con dos índices parciales que valen en todos.
    constraints = FillingPrice._meta.constraints
    assert not [c for c in constraints if getattr(c, "nulls_distinct", None) is False]
    unique = [c for c in constraints if isinstance(c, UniqueConstraint)]
    assert sorted(str(c.condition) for c in unique) == [
        "(AND: ('flavor__isnull', False))",
        "(AND: ('flavor__isnull', True))",
    ]


def test_same_flavor_in_other_types_or_other_flavors_in_the_same_type_are_allowed():
    base = FillingBase.objects.get(slug="normal")
    nuez, durazno = FillingFlavor.objects.get(slug="nuez"), FillingFlavor.objects.get(slug="durazno")
    FillingPrice.objects.create(cake_type="seco", base=base, flavor=durazno, price_per_kg=Decimal("185"))
    FillingPrice.objects.create(cake_type="tres_leches", base=base, flavor=durazno, price_per_kg=Decimal("185"))
    assert FillingPrice.objects.filter(base=base, flavor=nuez).count() == 3


def test_filling_price_must_be_positive():
    base = FillingBase.objects.get(slug="normal")
    FillingPrice.objects.filter(base=base).delete()
    rejected(
        lambda: FillingPrice.objects.create(
            cake_type="seco", base=base, flavor=None, price_per_kg=Decimal("0")
        )
    )


def test_filling_price_full_clean_reports_the_duplicate():
    price = FillingPrice(
        cake_type="seco",
        base=FillingBase.objects.get(slug="normal"),
        flavor=None,
        price_per_kg=Decimal("1"),
    )
    with pytest.raises(ValidationError):
        price.full_clean()


def test_included_decoration_with_a_price_is_rejected():
    rejected(
        lambda: DecorationOption.objects.create(
            name="Incluida con precio", slug="incluida", description="x",
            pricing="included", price=Decimal("10"),
        )
    )


def test_second_included_decoration_is_rejected():
    rejected(
        lambda: DecorationOption.objects.create(
            name="Otra sin decoración", slug="otra-sin", description="x", pricing="included"
        )
    )


def test_second_quote_decoration_is_rejected():
    rejected(
        lambda: DecorationOption.objects.create(
            name="Otra por cotizar", slug="otra-cotizar", description="x", pricing="quote"
        )
    )


def test_fixed_decoration_price_must_be_positive_when_set():
    rejected(
        lambda: DecorationOption.objects.create(
            name="Moños", slug="monos", description="x", pricing="fixed", price=Decimal("0")
        )
    )


def test_fixed_decoration_may_have_an_empty_price():
    DecorationOption.objects.create(
        name="Moños", slug="monos", description="x", pricing="fixed"
    ).full_clean()


def test_second_fixed_decoration_is_allowed():
    DecorationOption.objects.create(
        name="Moños", slug="monos", description="x", pricing="fixed", price=Decimal("30")
    )
    assert DecorationOption.objects.filter(pricing="fixed").count() == 4


def test_tier_max_below_min_is_rejected():
    rejected(
        lambda: TierRecommendation.objects.create(
            tiers=6, recommended_min_kg=40, recommended_max_kg=39
        )
    )


def test_tiers_must_be_unique_and_at_least_one():
    rejected(lambda: TierRecommendation.objects.create(tiers=2, recommended_min_kg=99))
    rejected(lambda: TierRecommendation.objects.create(tiers=0, recommended_min_kg=0))


# --- clean() ---


def test_flavor_price_in_a_type_the_flavor_does_not_allow_is_rejected():
    price = FillingPrice(
        cake_type=CakeType.ENVINADO,
        base=FillingBase.objects.get(slug="normal"),
        flavor=FillingFlavor.objects.get(slug="fresa_yogurt"),
        price_per_kg=Decimal("190"),
    )
    with pytest.raises(ValidationError) as error:
        price.clean()
    assert "tipo de pastel" in error.value.message_dict["flavor"][0]


def test_flavor_price_for_a_base_that_does_not_offer_the_flavor_is_rejected():
    price = FillingPrice(
        cake_type=CakeType.SECO,
        base=FillingBase.objects.get(slug="queso"),
        flavor=FillingFlavor.objects.get(slug="nuez"),
        price_per_kg=Decimal("190"),
    )
    with pytest.raises(ValidationError) as error:
        price.clean()
    assert "base" in error.value.message_dict["flavor"][0]


def test_general_price_passes_clean():
    FillingPrice(
        cake_type=CakeType.SECO,
        base=FillingBase.objects.get(slug="queso"),
        flavor=None,
        price_per_kg=Decimal("1"),
    ).clean()


def test_tier_kilos_must_grow_with_the_tiers():
    with pytest.raises(ValidationError):
        TierRecommendation(tiers=6, recommended_min_kg=20).clean()
    with pytest.raises(ValidationError):
        TierRecommendation(tiers=1, recommended_min_kg=16).clean()
    TierRecommendation(tiers=6, recommended_min_kg=36).clean()


def test_tier_clean_ignores_itself_when_edited():
    tier = TierRecommendation.objects.get(tiers=3)
    tier.recommended_min_kg = 19
    tier.clean()


def test_preview_color_must_be_a_hex_color():
    for bad in ("F0CE8A", "#FFF", "#GGGGGG", "rojo"):
        with pytest.raises(ValidationError) as error:
            build_bread(preview_color=bad).full_clean()
        assert "preview_color" in error.value.message_dict
    build_bread(preview_color="#F0CE8A").full_clean()


def test_coverage_color_requires_a_preview_color():
    with pytest.raises(ValidationError) as error:
        CoverageColor(name="Sin color", slug="sin_color", preview_color="").full_clean()
    assert "preview_color" in error.value.message_dict


# --- Admin ---


def test_bread_form_shows_cake_types_as_checkboxes_and_requires_one(superuser_client):
    bread = Bread.objects.get(slug="vainilla")
    url = reverse("admin:core_pasteleria_bread_change", args=[bread.pk])
    response = superuser_client.get(url)
    assert response.status_code == 200
    assert 'type="checkbox" name="allowed_cake_types"' in response.content.decode()
    data = {
        "name": bread.name, "pricing_mode": bread.pricing_mode, "price_per_kg": "0.00",
        "included_filling": "", "preview_color": "#F0CE8A", "sort_order": 1,
    }
    rejected_response = superuser_client.post(url, {**data})
    assert rejected_response.status_code == 200
    assert rejected_response.context["adminform"].form.errors["allowed_cake_types"]
    saved = superuser_client.post(url, {**data, "allowed_cake_types": ["seco"], "is_active": "on"})
    assert saved.status_code == 302
    bread.refresh_from_db()
    assert bread.allowed_cake_types == ["seco"]


def test_bread_slug_is_read_only_after_creation(superuser_client):
    bread = Bread.objects.get(slug="vainilla")
    url = reverse("admin:core_pasteleria_bread_change", args=[bread.pk])
    form = superuser_client.get(url).context["adminform"].form
    assert "slug" not in form.fields
    add_form = superuser_client.get(reverse("admin:core_pasteleria_bread_add")).context["adminform"].form
    assert "slug" in add_form.fields


def test_flavor_needs_at_least_one_base_in_the_admin(superuser_client):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_fillingflavor_add"),
        {"name": "Mango", "slug": "mango", "allowed_cake_types": ["seco"], "sort_order": 11},
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["bases"]
    assert not FillingFlavor.objects.filter(slug="mango").exists()


BREAD_PREVIEW_COLOR_ERROR = (
    'Un pan de dos colores también lleva el color de arriba ("color en la vista previa"). Escríbelo o borra este.'
)
FLAVOR_PIECES_COLOR_ERROR = 'Escribe el color de los trozos o elige el estilo "Liso".'


def bread_change_data(bread, **overrides):
    return {
        "name": bread.name, "pricing_mode": bread.pricing_mode, "price_per_kg": "0.00", "included_filling": "",
        "preview_color": "#805438", "preview_color_bottom": "", "allowed_cake_types": ["seco"],
        "sort_order": 1, "is_active": "on", **overrides,
    }


def flavor_change_data(flavor, **overrides):
    return {
        "name": flavor.name, "bases": [flavor.bases.first().pk], "allowed_cake_types": ["seco"], "is_combinable": "on",
        "preview_color": "#E25468", "preview_style": "smooth", "preview_color_secondary": "",
        "sort_order": 1, "is_active": "on", **overrides,
    }


def test_the_bread_form_needs_the_top_color_of_a_two_color_bread(superuser_client):
    bread = Bread.objects.get(slug="vainilla")
    url = reverse("admin:core_pasteleria_bread_change", args=[bread.pk])
    rejected_response = superuser_client.post(url, bread_change_data(bread, preview_color="", preview_color_bottom="#F0CE8A"))
    assert rejected_response.status_code == 200
    assert rejected_response.context["adminform"].form.errors == {"preview_color_bottom": [BREAD_PREVIEW_COLOR_ERROR]}
    for good in ({"preview_color_bottom": "#F0CE8A"}, {"preview_color_bottom": ""}):
        assert superuser_client.post(url, bread_change_data(bread, **good)).status_code == 302
    # Sin color de arriba y sin color de abajo, el pan se pinta con el respaldo: es válido.
    assert superuser_client.post(url, bread_change_data(bread, preview_color="")).status_code == 302


@pytest.mark.parametrize("style", ["fruit_slices", "fruit_chunks", "cookie_chunks", "sprinkles"])
def test_the_flavor_form_needs_the_color_of_the_pieces(superuser_client, style):
    flavor = FillingFlavor.objects.get(slug="zarzamora")
    url = reverse("admin:core_pasteleria_fillingflavor_change", args=[flavor.pk])
    rejected_response = superuser_client.post(url, flavor_change_data(flavor, preview_style=style))
    assert rejected_response.status_code == 200
    assert rejected_response.context["adminform"].form.errors == {"preview_color_secondary": [FLAVOR_PIECES_COLOR_ERROR]}
    saved = superuser_client.post(url, flavor_change_data(flavor, preview_style=style, preview_color_secondary="#C8283A"))
    assert saved.status_code == 302
    flavor.refresh_from_db()
    assert (flavor.preview_style, flavor.preview_color_secondary) == (style, "#C8283A")


def test_a_smooth_flavor_needs_no_color_for_pieces_in_the_admin(superuser_client):
    flavor = FillingFlavor.objects.get(slug="zarzamora")
    url = reverse("admin:core_pasteleria_fillingflavor_change", args=[flavor.pk])
    assert superuser_client.post(url, flavor_change_data(flavor)).status_code == 302


def changelist_save(client, model_name, row, **fields):
    """Guarda una fila desde la lista, como el botón "Guardar" con `list_editable` (sort_order e is_active)."""
    data = {
        "form-TOTAL_FORMS": "1", "form-INITIAL_FORMS": "1", "form-MIN_NUM_FORMS": "0", "form-MAX_NUM_FORMS": "1000",
        "form-0-id": str(row.pk), "form-0-sort_order": "9", "_save": "Guardar", **fields,
    }
    return client.post(reverse(f"admin:core_pasteleria_{model_name}_changelist"), data)


def test_reordering_or_deactivating_an_inconsistent_bread_from_the_list_does_not_fail(superuser_client):
    # Una fila que ya estaba así (creada sin pasar por el formulario): la lista solo edita orden y activo.
    Bread.objects.filter(slug="vainilla").update(preview_color="", preview_color_bottom="#F0CE8A")
    bread = Bread.objects.get(slug="vainilla")
    response = changelist_save(superuser_client, "bread", bread)
    assert response.status_code == 302
    bread.refresh_from_db()
    assert (bread.sort_order, bread.is_active) == (9, False)


def test_reordering_or_deactivating_an_inconsistent_flavor_from_the_list_does_not_fail(superuser_client):
    FillingFlavor.objects.filter(slug="zarzamora").update(preview_style="fruit_chunks", preview_color_secondary="")
    flavor = FillingFlavor.objects.get(slug="zarzamora")
    response = changelist_save(superuser_client, "fillingflavor", flavor)
    assert response.status_code == 302
    flavor.refresh_from_db()
    assert (flavor.sort_order, flavor.is_active) == (9, False)


def test_admin_pages_of_every_option_load(superuser_client):
    for name in (
        "bread", "fillingbase", "fillingflavor", "fillingprice",
        "tierrecommendation", "coveragecolor", "decorationoption",
    ):
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_changelist")).status_code == 200
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_add")).status_code == 200


# --- Semilla ---

# Tabla 4.5 de docs/reglas-de-negocio.md, escrita aparte de la migración.
RULE_TABLE_4_5 = {
    ("tres_leches", "normal", None): "180", ("seco", "normal", None): "180", ("envinado", "normal", None): "200",
    ("tres_leches", "normal", "fresa_yogurt"): "190", ("seco", "normal", "fresa_yogurt"): "190",
    ("tres_leches", "normal", "nuez"): "190", ("seco", "normal", "nuez"): "190", ("envinado", "normal", "nuez"): "200",
    ("tres_leches", "queso", None): "250", ("seco", "queso", None): "250", ("envinado", "queso", None): "250",
    ("tres_leches", "flan", None): "250", ("seco", "flan", None): "250", ("envinado", "flan", None): "250",
}


def test_seeded_filling_prices_equal_table_4_5():
    seeded = {
        (price.cake_type, price.base.slug, price.flavor.slug if price.flavor else None): price.price_per_kg
        for price in FillingPrice.objects.select_related("base", "flavor")
    }
    assert seeded == {key: Decimal(value) for key, value in RULE_TABLE_4_5.items()}


def test_seeded_breads_match_section_4_3():
    breads = {bread.slug: bread for bread in Bread.objects.all()}
    assert set(breads) == {"vainilla", "chocolate", "choco_vainilla", "choco_pinguino", "red_velvet"}
    assert [breads[s].price_per_kg for s in ("vainilla", "chocolate", "choco_vainilla")] == [0, 5, 5]
    for slug in ("vainilla", "chocolate", "choco_vainilla"):
        assert breads[slug].pricing_mode == "extra_per_kg"
        assert breads[slug].included_filling == ""
        assert breads[slug].allowed_cake_types == ["tres_leches", "seco", "envinado"]
    pinguino, velvet = breads["choco_pinguino"], breads["red_velvet"]
    assert (pinguino.pricing_mode, pinguino.price_per_kg) == ("full_price_per_kg", 250)
    assert (velvet.pricing_mode, velvet.price_per_kg) == ("full_price_per_kg", 280)
    assert pinguino.included_filling and velvet.included_filling
    # Reglas 4.3 y 4.7: Choco-pingüino no va en envinado; Red velvet solo en seco.
    assert pinguino.allowed_cake_types == ["tres_leches", "seco"]
    assert velvet.allowed_cake_types == ["seco"]


def test_seeded_filling_bases_and_flavors_match_section_4_4():
    bases = {base.slug: base for base in FillingBase.objects.all()}
    assert {s: (b.max_flavors, b.combined_extra_per_kg) for s, b in bases.items()} == {
        "normal": (2, Decimal("5")), "queso": (1, Decimal("0")), "flan": (1, Decimal("0")),
    }
    offered = {slug: set(base.flavors.values_list("name", flat=True)) for slug, base in bases.items()}
    assert offered["normal"] == {
        "Durazno", "Fresa", "Zarzamora", "Cajeta", "Galleta", "Chocolate",
        "Choco vainilla", "Capuchino", "Fresa con yogurt", "Nuez",
    }
    assert offered["queso"] == {"Chocolate", "Zarzamora"}
    assert offered["flan"] == {"Cajeta", "Zarzamora"}
    assert FillingFlavor.objects.count() == 10


def test_seeded_base_colors_come_from_the_3d_prototype():
    # `BASEREL` de design/referencia/pastel-css3d.js: la capa de crema de queso y de flan.
    colors = dict(FillingBase.objects.values_list("slug", "preview_color"))
    assert colors == {"normal": "", "queso": "#FAF4E2", "flan": "#F2C860"}


def test_seeded_fresa_con_yogurt_is_not_combinable_and_not_in_envinado():
    yogurt = FillingFlavor.objects.get(slug="fresa_yogurt")
    assert yogurt.is_combinable is False
    assert yogurt.allowed_cake_types == ["tres_leches", "seco"]
    others = FillingFlavor.objects.exclude(slug="fresa_yogurt")
    assert all(flavor.is_combinable for flavor in others)
    assert FillingFlavor.objects.get(slug="nuez").allowed_cake_types == ["tres_leches", "seco", "envinado"]


def test_seeded_tiers_match_section_3_3():
    tiers = {t.tiers: (t.recommended_min_kg, t.recommended_max_kg) for t in TierRecommendation.objects.all()}
    assert tiers == {1: (0, None), 2: (15, None), 3: (18, 20), 4: (25, None), 5: (30, 35)}


def test_seeded_coverage_colors_match_section_5():
    names = list(CoverageColor.objects.values_list("name", flat=True))
    assert names == [
        "Amarillo", "Blanco", "Azul fuerte", "Azul claro", "Verde", "Naranja",
        "Café", "Turquesa", "Rojo", "Rosa", "Lila",
    ]
    assert all(color.preview_color for color in CoverageColor.objects.all())


def test_seeded_decorations_match_section_6_1_with_pending_prices():
    decorations = {d.slug: d for d in DecorationOption.objects.all()}
    assert len(decorations) == 5
    assert decorations["ninguna"].pricing == "included"
    assert decorations["otra"].pricing == "quote"
    for slug in ("duya", "flores", "chispas"):
        assert decorations[slug].pricing == "fixed"
    # PENDIENTE: ninguna decoración trae un precio supuesto.
    assert all(d.price is None for d in decorations.values())


def test_every_seeded_row_passes_full_validation():
    for model in (Bread, FillingBase, FillingFlavor, FillingPrice, TierRecommendation, CoverageColor, DecorationOption):
        for row in model.objects.all():
            row.full_clean()


def test_seed_can_run_again_without_duplicating_or_overwriting():
    counts = {m: m.objects.count() for m in (Bread, FillingFlavor, FillingPrice, DecorationOption)}
    Bread.objects.filter(slug="chocolate").update(price_per_kg=Decimal("7.00"))
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("90.00"))
    FillingFlavor.objects.get(slug="durazno").bases.clear()
    seed_module.seed_cake_options(apps, None)
    # Las bases que la pastelería le quitó a un sabor no se vuelven a poner.
    assert FillingFlavor.objects.get(slug="durazno").bases.count() == 0
    assert {m: m.objects.count() for m in counts} == counts
    assert Bread.objects.get(slug="chocolate").price_per_kg == Decimal("7.00")
    assert DecorationOption.objects.get(slug="flores").price == Decimal("90.00")


# --- Un sabor no se cobra por debajo de su base ---


def own_price(slug, cake_type):
    return FillingPrice.objects.get(cake_type=cake_type, base__slug="normal", flavor__slug=slug)


def test_a_flavor_price_below_the_general_price_of_its_base_is_rejected():
    price = own_price("nuez", CakeType.TRES_LECHES)
    price.price_per_kg = Decimal("179.99")
    with pytest.raises(ValidationError) as error:
        price.full_clean()
    assert error.value.message_dict["price_per_kg"] == [
        "Un sabor no se cobra por debajo de su base: el precio general de Normal en "
        "tres leches es $180.00."
    ]


def test_a_flavor_price_equal_to_the_general_price_is_accepted():
    # Nuez en envinado cuesta lo mismo que la base Normal (tabla 4.5).
    price = own_price("nuez", CakeType.ENVINADO)
    price.full_clean()
    price.price_per_kg = Decimal("200")
    price.full_clean()


def test_a_new_flavor_price_below_the_base_is_rejected():
    durazno = FillingFlavor.objects.get(slug="durazno")
    price = FillingPrice(
        cake_type=CakeType.SECO, base=FillingBase.objects.get(slug="normal"), flavor=durazno,
        price_per_kg=Decimal("150"),
    )
    with pytest.raises(ValidationError) as error:
        price.full_clean()
    assert list(error.value.message_dict) == ["price_per_kg"]


def test_the_general_price_cannot_go_above_a_flavor_price_of_the_same_type():
    general = FillingPrice.objects.get(cake_type=CakeType.TRES_LECHES, base__slug="normal", flavor=None)
    general.price_per_kg = Decimal("191")
    with pytest.raises(ValidationError) as error:
        general.full_clean()
    assert error.value.message_dict["price_per_kg"] == [
        "Un sabor no se cobra por debajo de su base: Fresa con yogurt y Nuez cuestan menos "
        "en tres leches. Súbeles el precio primero."
    ]
    general.price_per_kg = Decimal("190")
    general.full_clean()


def test_seeded_flavor_prices_are_never_below_their_base():
    for price in FillingPrice.objects.all():
        price.full_clean()
